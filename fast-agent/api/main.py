import requests
import os
import json # Add json import
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request # Add Request
from fastapi.responses import StreamingResponse # Add StreamingResponse
from datetime import datetime
import logging
from api.services.llm_service import llm_service # Change this import to get the instance directly
from typing import List, Dict, Any, AsyncGenerator # Add typing imports, including AsyncGenerator
import time # Import time
import httpx

# Load environment variables from .env file in the parent directory
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env') 
load_dotenv(dotenv_path=dotenv_path)

app = FastAPI()
logger = logging.getLogger(__name__)
__version__ = "0.1.0" # Define the version

# Constants from environment variables
MCP_URL = os.getenv("MCP_URL", "http://localhost:3001")

@app.get("/health")
async def health_check():
    """Health check endpoint to verify the API is running correctly."""
    response = {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": __version__,
    }
    
    # Check DeepSeek API configuration
    deepseek_api_key = os.environ.get("DEEPSEEK_API_KEY")
    if deepseek_api_key:
        response["deepseek_api"] = "configured"
    else:
        response["deepseek_api"] = "missing"
        
    return response

@app.get("/test_deepseek")
async def test_deepseek_connection():
    """Test connection to DeepSeek API to verify it's working properly."""
    try:
        deepseek_api_key = os.environ.get("DEEPSEEK_API_KEY")
        if not deepseek_api_key:
            return {"status": "error", "message": "DeepSeek API key not configured"}
        
        # Import required libraries
        from openai import OpenAI
        
        # Initialize client with DeepSeek API key
        client = OpenAI(
            api_key=deepseek_api_key,
            base_url="https://api.deepseek.com/v1"
        )
        
        # Try a simple API call
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": "Say hello to test the API connection"}],
            max_tokens=10
        )
        
        return {
            "status": "success", 
            "message": "DeepSeek API connection successful",
            "response": response.choices[0].message.content
        }
    except Exception as e:
        return {"status": "error", "message": f"DeepSeek API connection failed: {str(e)}"}

# --- Helper Function to Format Tools for LLM (Adapted from app/main.py) ---
def format_tools_for_llm(tools_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Formats the tool list into the structure expected by the LLM API."""
    formatted_tools = []
    if not isinstance(tools_list, list):
        logger.error(f"Invalid tools_list provided to format_tools_for_llm: {type(tools_list)}. Expected list.")
        return [] # Return empty list if input is not a list

    for tool in tools_list:
        # Ensure tool is a dictionary and has the required 'name' key
        if not isinstance(tool, dict) or 'name' not in tool:
            logger.warning(f"Skipping invalid tool format: {tool}")
            continue

        # Basic structure for OpenAI tool format
        formatted_tool = {
            "type": "function",
            "function": {
                "name": tool.get("name"),
                "description": tool.get("description", ""), # Provide default empty string
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }
        }

        # Process parameters if they exist and are a dictionary
        parameters = tool.get("parameters")
        if isinstance(parameters, dict):
            required_params = []
            for param_name, param_details in parameters.items():
                 # Ensure param_details is a dictionary before accessing keys
                 if isinstance(param_details, dict):
                     # Map simple types, default to string
                     param_type = param_details.get("type", "string")
                     # Basic JSON schema type mapping (can be expanded)
                     if param_type not in ["string", "number", "integer", "boolean", "array", "object"]:
                         logger.warning(f"Unsupported parameter type '{param_type}' for param '{param_name}' in tool '{tool.get('name')}'. Defaulting to string.")
                         param_type = "string"
                         
                     formatted_tool["function"]["parameters"]["properties"][param_name] = {
                         "type": param_type,
                         "description": param_details.get("description", "")
                     }
                     # Check for the 'required' flag added during transformation
                     if param_details.get("required", False): # Default to False if not present
                          required_params.append(param_name)
                 else:
                      logger.warning(f"Skipping invalid parameter detail format for param '{param_name}' in tool '{tool.get('name')}': {param_details}")

            if required_params:
                formatted_tool["function"]["parameters"]["required"] = required_params
        elif parameters is not None:
             logger.warning(f"Tool '{tool.get('name')}' has 'parameters' but it's not a dictionary: {parameters}. Skipping parameter processing.")

        formatted_tools.append(formatted_tool)
        logger.debug(f"Formatted tool for LLM: {formatted_tool}")

    return formatted_tools
# --- End Helper Function ---


# --- Tool Executor Function ---
async def execute_mcp_tool(tool_name: str, tool_args: dict) -> str:
    """
    Executes a tool via the MCP server and returns the result content as a string.
    This function will be passed to the LLMService.
    """
    mcp_execute_url = f"{MCP_URL}/api/execute" # Define URL early for logging
    try:
        payload = {"tool": tool_name, "args": tool_args}
        # Log payload as JSON string for clarity - CHANGED TO DEBUG (removed indent)
        logger.debug(f"Executing tool '{tool_name}' via MCP bridge: {mcp_execute_url} with payload: {json.dumps(payload)}")
        logger.info(f"Executing tool '{tool_name}' via MCP bridge...") # Add simpler INFO log

        start_time = time.time() # Start timer for HTTP call
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(mcp_execute_url, json=payload)
        end_time = time.time() # End timer for HTTP call
        duration = end_time - start_time
        logger.info(f"HTTP call to {mcp_execute_url} for tool '{tool_name}' completed in {duration:.2f} seconds with status {response.status_code}.")

        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)

        result_data = response.json()
        # CHANGED TO DEBUG (removed indent)
        logger.debug(f"Received successful response from MCP bridge execute: {json.dumps(result_data)}")

        # Extract content from the 'result' object
        mcp_result = result_data.get("result", {}) # Get the inner result object
        if isinstance(mcp_result, dict) and 'content' in mcp_result:
            content_list = mcp_result['content']
            if isinstance(content_list, list) and len(content_list) > 0 and isinstance(content_list[0], dict) and 'text' in content_list[0]:
                extracted_text = content_list[0]['text']
                logger.info(f"Extracted text content from tool result: {extracted_text[:200]}...") # Log snippet
                return extracted_text
            else:
                # Fallback: return the content part as JSON string if text extraction fails
                logger.warning("Could not extract text from tool result content, returning content as JSON string.")
                return json.dumps(mcp_result['content'])
        elif "error" in result_data: # Check if the JSON-RPC response itself indicates an error
             error_details = result_data.get("error")
             logger.error(f"MCP bridge returned JSON-RPC error for tool '{tool_name}': {error_details}")
             return f"Error from tool '{tool_name}': {error_details.get('message', 'Unknown error')}"
        else:
            # Fallback: return the whole result object as JSON string if content extraction fails
            logger.warning("Could not find 'content' or 'error' in the 'result' object, returning result as JSON string.")
            return json.dumps(mcp_result)

    except httpx.TimeoutException:
        end_time = time.time() # End timer even on timeout
        duration = end_time - start_time
        logger.error(f"Timeout after {duration:.2f}s calling MCP server at {mcp_execute_url} for tool '{tool_name}'.")
        return f"Error: Timeout waiting for tool {tool_name} to execute."
    except httpx.RequestError as req_err:
        end_time = time.time() # End timer even on request error
        duration = end_time - start_time
        logger.error(f"HTTP request error after {duration:.2f}s calling MCP server for tool '{tool_name}': {req_err}")
        return f"Error: Could not connect to the tool execution server for {tool_name}."
    except json.JSONDecodeError as json_err:
        end_time = time.time() # End timer even on JSON error
        duration = end_time - start_time
        logger.error(f"Failed to decode JSON response after {duration:.2f}s from MCP server for tool '{tool_name}': {json_err}. Response text: {response.text}")
        return f"Error: Received invalid response format from the tool execution server for {tool_name}."
    except Exception as e:
        end_time = time.time() # End timer for other errors
        duration = end_time - start_time
        logger.exception(f"An unexpected error occurred after {duration:.2f}s during MCP tool execution for '{tool_name}': {e}")
        return f"Error: An unexpected error occurred while executing tool {tool_name}."
# --- End Tool Executor ---


@app.post("/chat")
async def chat(request: Request): # Change to use Request object
    """
    Process a chat message using LLMService, handling tools via execute_mcp_tool.
    Supports both streaming and non-streaming responses.
    """
    try:
        body = await request.json()
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    message = body.get("message", "")
    history = body.get("history", [])
    stream = body.get("stream", False) # Get the stream parameter
    
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    # Ensure history format is correct for LLMService (role, content)
    chat_history = []
    for msg in history:
        if isinstance(msg, dict) and "role" in msg and "content" in msg:
             chat_history.append({"role": msg["role"], "content": msg["content"]})
        else:
            logger.warning(f"Skipping invalid history message: {msg}")

    chat_history.append({"role": "user", "content": message})

    # --- Get and Format Tools ---
    try:
        available_tools_raw = await get_tools() 
        llm_formatted_tools = format_tools_for_llm(available_tools_raw)
        logger.info(f"Prepared {len(llm_formatted_tools)} tools for LLM.")
    except Exception as e:
        logger.error(f"Failed to get or format tools: {e}. Proceeding without tools.")
        llm_formatted_tools = None
    # --- End Get and Format Tools ---

    # Process message with LLMService, providing the executor and stream flag
    logger.info(f"Processing message with LLMService (stream={stream})...")
    
    try:
        response_generator_or_string = await llm_service.generate_response(
            messages=chat_history,
            tools=llm_formatted_tools,
            tool_executor=execute_mcp_tool,
            stream=stream # Pass the stream flag here
        )
    except Exception as e:
        logger.exception("Error calling LLMService generate_response")
        raise HTTPException(status_code=500, detail=f"Error processing message: {str(e)}")

    if stream:
        # Ensure it's an async generator before creating StreamingResponse
        if not isinstance(response_generator_or_string, AsyncGenerator):
             logger.error("Expected AsyncGenerator for streaming response, but got different type.")
             # Fallback or raise error
             async def error_stream():
                 yield "Error: Backend failed to generate stream." 
             return StreamingResponse(error_stream(), media_type="text/plain")
        
        logger.info("Returning StreamingResponse.")
        return StreamingResponse(response_generator_or_string, media_type="text/plain")
    else:
        # Ensure it's a string for non-streaming response
        if not isinstance(response_generator_or_string, str):
             logger.error("Expected string for non-streaming response, but got different type.")
             response_content = "Error: Backend generated unexpected response format."
        else:
             response_content = response_generator_or_string
        
        logger.info("Returning non-streaming JSON response.")
        return {"response": response_content}

@app.get("/tools")
async def get_tools():
    """Fetch available tools, including those from the MCP server and transform their schema."""
    all_tools = []
    # Add any tools defined directly in this FastAPI app here (if any)
    # Example: 
    # local_tools = [
    #     {"name": "local_tool_1", "description": "...", "parameters": {...}}
    # ]
    # all_tools.extend(local_tools)

    # Fetch tools from MCP server via the webui bridge
    try:
        # Use the correct path exposed by webui/server.js
        mcp_tools_url = f"{MCP_URL}/api/tools"
        logger.info(f"Fetching tools from MCP bridge: {mcp_tools_url}")
        response = requests.get(mcp_tools_url, timeout=10)
        response.raise_for_status() # This would raise an error if status != 2xx

        # Log the raw JSON response text - CHANGED TO DEBUG
        raw_response_text = response.text
        logger.debug(f"Raw text response from MCP bridge /api/tools: {raw_response_text}")

        # Log the parsed JSON response - CHANGED TO DEBUG (removed indent)
        try:
            parsed_json = response.json()
            logger.debug(f"Parsed JSON response from MCP bridge /api/tools: {json.dumps(parsed_json)}")
        except json.JSONDecodeError as json_err:
            logger.error(f"Failed to parse JSON response from bridge: {json_err}")
            logger.error(f"Raw text was: {raw_response_text}")
            parsed_json = {} # Avoid further errors

        # Get the tools list from the 'result' object
        mcp_tools_raw = parsed_json.get("result", {}).get("tools", [])
        # Log the extracted list - CHANGED TO DEBUG (removed indent)
        logger.debug(f"Extracted 'tools' list from bridge response: {json.dumps(mcp_tools_raw)}")

        if isinstance(mcp_tools_raw, list):
            logger.info(f"Successfully fetched {len(mcp_tools_raw)} tools from MCP bridge. Transforming schema...")
            transformed_mcp_tools = []
            for tool_index, tool in enumerate(mcp_tools_raw): # Add index for logging
                try: # Add try/except around each tool transformation
                    logger.debug(f"Processing raw tool #{tool_index}: {tool}")
                    if not isinstance(tool, dict):
                        logger.warning(f"Skipping non-dict tool #{tool_index} received from MCP bridge: {tool}")
                        continue

                    # Transform the inputSchema from MCP format to the format expected by Streamlit/LLM
                    transformed_tool = {
                        "name": tool.get("name"),
                        "description": tool.get("description"),
                        "parameters": {} # Initialize parameters dict
                    }

                    input_schema = tool.get("inputSchema")
                    logger.debug(f"Tool #{tool_index} '{tool.get('name')}' - Input Schema: {input_schema}") # Log input schema
                    if isinstance(input_schema, dict):
                        properties = input_schema.get("properties")
                        required_params = set(input_schema.get("required", []))
                        logger.debug(f"Tool #{tool_index} '{tool.get('name')}' - Properties: {properties}") # Log properties
                        logger.debug(f"Tool #{tool_index} '{tool.get('name')}' - Required Params: {required_params}") # Log required params

                        if isinstance(properties, dict):
                            for param_name, param_details in properties.items():
                                logger.debug(f"Tool #{tool_index} '{tool.get('name')}' - Processing param: {param_name} -> {param_details}") # Log each param detail
                                if isinstance(param_details, dict):
                                    # Simplified type mapping
                                    param_type = param_details.get("type", "string")
                                    if param_type not in ["string", "number", "integer", "boolean"]:
                                        logger.warning(f"Unsupported MCP type '{param_type}' for param '{param_name}' in tool #{tool_index} '{tool.get('name')}'. Defaulting to 'string'.")
                                        param_type = "string" # Default to string for unknown/complex types

                                    transformed_tool["parameters"][param_name] = {
                                        "type": param_type,
                                        "description": param_details.get("description", ""),
                                        "required": param_name in required_params,
                                        "default": param_details.get("default") # Pass default if present
                                    }
                                else:
                                    logger.warning(f"Invalid parameter details format for '{param_name}' in tool #{tool_index} '{tool.get('name')}': {param_details}")
                        else:
                             logger.warning(f"Tool #{tool_index} '{tool.get('name')}' has 'inputSchema' but 'properties' is not a dictionary: {properties}")
                    else:
                        logger.warning(f"Tool #{tool_index} '{tool.get('name')}' has no valid 'inputSchema'.")

                    # Only add tool if it has a name
                    if transformed_tool.get("name"):
                        logger.debug(f"Adding transformed tool #{tool_index}: {transformed_tool}")
                        transformed_mcp_tools.append(transformed_tool)
                    else:
                        logger.warning(f"Skipping tool #{tool_index} with no name received from MCP bridge: {tool}")
                except Exception as tool_transform_err:
                    logger.error(f"Error transforming tool #{tool_index}: {tool}. Error: {tool_transform_err}", exc_info=True) # Log exception details

            all_tools.extend(transformed_mcp_tools)
            logger.info(f"Finished transforming {len(transformed_mcp_tools)} MCP tools.")
        else:
             logger.error(f"Received non-list format for 'tools' from MCP bridge /api/tools endpoint: {mcp_tools_raw}")

    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to fetch tools from MCP bridge at {MCP_URL}: {e}")
    except Exception as e:
        logger.error(f"An unexpected error occurred while fetching/transforming MCP tools: {e}", exc_info=True)

    # TODO: Add logic to fetch/define other tools if necessary

    if not all_tools:
        logger.warning("No tools were loaded, returning empty list.")

    # Add explicit logging before returning - CHANGED TO DEBUG (removed indent)
    logger.debug(f"Returning final tools list from get_tools: {json.dumps(all_tools)}")
    logger.info(f"Returning {len(all_tools)} tools from get_tools.") # Add simpler INFO log
    return all_tools