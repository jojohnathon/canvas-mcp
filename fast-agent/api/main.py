import requests
import os
import json # Add json import
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException # Add HTTPException
from datetime import datetime
import logging
from api.services.llm_service import llm_service # Change this import to get the instance directly
from typing import List, Dict, Any # Add typing imports

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
        # Log payload as JSON string for clarity
        logger.info(f"Executing tool '{tool_name}' via MCP bridge: {mcp_execute_url} with payload: {json.dumps(payload)}")

        response = requests.post(mcp_execute_url, json=payload, timeout=60)
        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)

        result_data = response.json()
        logger.info(f"Received successful response from MCP bridge execute: {json.dumps(result_data, indent=2)}")

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

    except requests.exceptions.HTTPError as http_err:
        # Handle HTTP errors (4xx, 5xx) specifically
        error_msg = f"HTTP error calling MCP bridge execute endpoint for tool '{tool_name}' at {mcp_execute_url}: {http_err}"
        logger.error(error_msg)
        response_text = ""
        # Log response details if available
        if http_err.response is not None:
            response_text = http_err.response.text
            logger.error(f"Response status: {http_err.response.status_code}, Response body: {response_text}")
            try:
                # Try to parse JSON detail, matching the observed {"detail":"Not Found"}
                detail = http_err.response.json()
                # Return the specific detail message
                return f"Error executing tool: {detail}"
            except json.JSONDecodeError:
                 # If response is not JSON, return status and reason
                 return f"Error executing tool: {http_err.response.status_code} - {http_err.response.reason}"
        else:
             # Return generic HTTP error if no response object
             return error_msg

    except requests.exceptions.RequestException as req_err:
        # Handle other request errors (connection, timeout, etc.)
        error_msg = f"Request error calling MCP bridge execute endpoint for tool '{tool_name}' at {mcp_execute_url}: {req_err}"
        logger.error(error_msg)
        return error_msg # Return error message to LLM

    except json.JSONDecodeError as json_err:
        # Handle errors parsing the successful JSON response (less likely after raise_for_status)
        error_msg = f"Error parsing JSON response from MCP bridge for tool '{tool_name}': {json_err}"
        logger.error(error_msg)
        return error_msg

    except Exception as e:
        # Catch-all for unexpected errors during execution/parsing
        error_msg = f"Unexpected error executing tool '{tool_name}' via MCP bridge: {e}"
        logger.exception(error_msg) # Log with stack trace
        return error_msg # Return error message to LLM
# --- End Tool Executor ---


@app.post("/chat")
async def chat(request: dict):
    """
    Process a chat message using LLMService, handling tools via execute_mcp_tool.
    """
    message = request.get("message", "")
    history = request.get("history", [])
    
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    # Ensure history format is correct for LLMService (role, content)
    # Note: LLMService now handles adding tool calls/results internally
    chat_history = []
    for msg in history:
        # Basic validation, can be expanded
        if isinstance(msg, dict) and "role" in msg and "content" in msg:
             chat_history.append({"role": msg["role"], "content": msg["content"]})
        else:
            logger.warning(f"Skipping invalid history message: {msg}")

    # Add current user message
    chat_history.append({"role": "user", "content": message})

    # --- Get and Format Tools ---
    try:
        # Fetch tools using the existing /tools endpoint logic
        available_tools_raw = await get_tools() 
        # Format for the LLM (OpenAI format)
        llm_formatted_tools = format_tools_for_llm(available_tools_raw)
        logger.info(f"Prepared {len(llm_formatted_tools)} tools for LLM.")
    except Exception as e:
        logger.error(f"Failed to get or format tools: {e}. Proceeding without tools.")
        llm_formatted_tools = None
    # --- End Get and Format Tools ---

    # Process message with LLMService, providing the executor
    logger.info("Processing message with LLMService...")
    response_content = await llm_service.generate_response(
        messages=chat_history,
        tools=llm_formatted_tools,
        tool_executor=execute_mcp_tool # Pass the executor function
    )
    
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

        # Log the raw JSON response text
        raw_response_text = response.text
        logger.info(f"Raw text response from MCP bridge /api/tools: {raw_response_text}")

        # Log the parsed JSON response
        try:
            parsed_json = response.json()
            logger.info(f"Parsed JSON response from MCP bridge /api/tools: {json.dumps(parsed_json, indent=2)}")
        except json.JSONDecodeError as json_err:
            logger.error(f"Failed to parse JSON response from bridge: {json_err}")
            logger.error(f"Raw text was: {raw_response_text}")
            parsed_json = {} # Avoid further errors

        # Get the tools list from the 'result' object
        mcp_tools_raw = parsed_json.get("result", {}).get("tools", []) 
        logger.info(f"Extracted 'tools' list from bridge response: {json.dumps(mcp_tools_raw, indent=2)}") # Log the extracted list

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

    # Add explicit logging before returning
    logger.info(f"Returning final tools list from get_tools: {json.dumps(all_tools, indent=2)}") 
    return all_tools