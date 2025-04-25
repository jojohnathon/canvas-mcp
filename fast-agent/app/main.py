from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
import logging
import json
import requests
import httpx  # Use httpx for async requests to MCP server
from urllib3.exceptions import NewConnectionError, MaxRetryError
import copy  # Import copy for deep copying schemas

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("canvas-fast-agent-api")

# Initialize FastAPI app
app = FastAPI(
    title="Canvas Student Assistant API",
    description="API for Canvas LMS integration with AI assistance",
    version="0.1.0",
)

# CORS middleware to allow cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load environment variables
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_API_URL = os.getenv("DEEPSEEK_API_URL", "https://api.deepseek.com/v1/chat/completions")
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:3001")
FASTAPI_PORT = os.getenv("FASTAPI_PORT", "8000")

# Check MCP server connectivity
def check_mcp_server():
    """Check if the MCP server is available and return the tools list if successful."""
    try:
        response = requests.get(f"{MCP_SERVER_URL}/api/tools", timeout=15)
        if response.status_code == 200:
            try:
                data = response.json()

                # *** Add check: Ensure data is a dictionary ***
                if not isinstance(data, dict):
                    logger.warning(f"MCP server response was not a JSON object (dictionary): {str(data)[:200]}...")
                    return False, None

                # Now safe to access keys
                if 'result' in data and isinstance(data['result'], dict) and 'tools' in data['result']:
                     logger.info("Successfully fetched tools from MCP server.")
                     return True, data['result']['tools'] # Return the actual list
                else:
                     # Handle cases where the response is a dict but not the expected JSON-RPC structure
                     logger.warning(f"MCP server response format unexpected (missing result/tools): {str(data)[:200]}...")
                     # Attempt to return data if it's already a list (fallback for non-JSON-RPC?)
                     if isinstance(data, list): # This case is less likely now but kept for safety
                         logger.warning("Assuming direct list response from MCP server.")
                         return True, data
                     return False, None
            except json.JSONDecodeError:
                logger.warning(f"Failed to decode JSON response from MCP server: {response.text}")
                return False, None
            # Catch the specific attribute error just in case, though the check above should prevent it
            except AttributeError as e:
                 logger.error(f"AttributeError while processing MCP response: {e}. Response data: {str(data)[:200]}...")
                 return False, None
        else:
            logger.warning(f"MCP server returned status code {response.status_code}")
            return False, None
    except (requests.exceptions.ConnectionError, NewConnectionError, MaxRetryError) as e:
        logger.warning(f"Failed to connect to MCP server: {str(e)}")
        # Log more detailed troubleshooting info
        logger.info(f"""
        ==========================================================
        MCP Server Connection Failed
        ----------------------------------------------------------
        To fix this issue, try the following:
        
        1. Ensure the Canvas MCP server is running. 
           - You can start it from the webui folder with: node server.js
           
        2. Check that the MCP_SERVER_URL environment variable is set correctly.
           - Current value: {MCP_SERVER_URL}
           
        3. If running via Claude Desktop, verify the claude_desktop_config.json
           has the correct Canvas MCP server configuration.
           
        4. For more details, see the troubleshooting guide in the README.md
        ==========================================================
        """)
        return False, None
    except Exception as e:
        logger.warning(f"Error connecting to MCP server: {str(e)}")
        return False, None

# Models
class ChatRequest(BaseModel):
    message: str
    history: Optional[List[Dict[str, str]]] = []

class ChatResponse(BaseModel):
    response: str

class ToolExecuteRequest(BaseModel):
    tool_name: str
    parameters: Dict[str, Any]

# Available tools definition - fallback if MCP server is unavailable
FALLBACK_TOOLS = [
    {
        "name": "get_courses",
        "description": "Fetches the list of courses for the current user",
        "parameters": {}
    },
    {
        "name": "get_assignments",
        "description": "Fetches assignments for a specific course",
        "parameters": {
            "course_id": {
                "type": "string",
                "description": "The ID of the course to fetch assignments for"
            }
        }
    },
    {
        "name": "submit_assignment",
        "description": "Submit an assignment for a course",
        "parameters": {
            "course_id": {
                "type": "string",
                "description": "The ID of the course"
            },
            "assignment_id": {
                "type": "string",
                "description": "The ID of the assignment"
            },
            "submission_text": {
                "type": "string",
                "description": "The text submission content"
            }
        }
    }
]

# --- Helper Function to Format Tools for LLM ---
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

        # Basic structure
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
                     formatted_tool["function"]["parameters"]["properties"][param_name] = {
                         "type": param_details.get("type", "string"), # Default to string if type missing
                         "description": param_details.get("description", "")
                     }
                     # Assume parameters are required if not explicitly marked optional
                     # (Adjust this logic if your schema defines optionality differently)
                     if param_details.get("required", True): # Default to required=True
                          required_params.append(param_name)
                 else:
                      logger.warning(f"Skipping invalid parameter detail format for param '{param_name}' in tool '{tool.get('name')}': {param_details}")


            if required_params:
                formatted_tool["function"]["parameters"]["required"] = required_params
        elif parameters is not None:
             logger.warning(f"Tool '{tool.get('name')}' has 'parameters' but it's not a dictionary: {parameters}. Skipping parameter processing.")


        formatted_tools.append(formatted_tool)

    return formatted_tools
# --- End Helper Function ---

# Try to get tools from MCP server or use fallback
mcp_available, mcp_tools_list = check_mcp_server()
TOOLS = mcp_tools_list if mcp_available and isinstance(mcp_tools_list, list) else FALLBACK_TOOLS
logger.info(f"MCP server status: {'connected' if mcp_available else 'unavailable'}")
if not mcp_available:
    logger.warning("Using fallback tools since MCP server is unavailable")
elif not isinstance(mcp_tools_list, list):
     logger.warning("MCP server connected but did not return a valid tools list. Using fallback tools.")

@app.get("/")
def read_root():
    # Check MCP server status for the welcome message
    mcp_available, _ = check_mcp_server()
    message = "Welcome to Canvas Student Assistant API"
    if not mcp_available:
        message += " (Running in offline mode - MCP server unavailable)"
    return {"message": message, "mcp_status": "connected" if mcp_available else "offline"}

@app.get("/health")
def health_check():
    """Check API health status"""
    # Recheck MCP server connectivity
    mcp_available, _ = check_mcp_server()
    
    return {
        "status": "healthy",
        "google_api": "configured" if GOOGLE_API_KEY else "not_configured",
        "deepseek_api": "configured" if DEEPSEEK_API_KEY else "not_configured",
        "mcp_server": "connected" if mcp_available else "unavailable"
    }

@app.get("/tools")
def get_tools():
    """Get available tools"""
    # Attempt to refresh tools from MCP server
    mcp_available, mcp_tools_list = check_mcp_server()
    if mcp_available and isinstance(mcp_tools_list, list):
        return mcp_tools_list # Return the list directly
    logger.warning("Returning fallback tools for /tools endpoint.")
    return FALLBACK_TOOLS

# --- Refactored MCP Tool Execution Logic ---
async def _execute_mcp_tool_internal(tool_name: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
    """Internal function to execute a tool via the MCP server."""
    mcp_available, _ = check_mcp_server() # Re-check availability for safety
    if not mcp_available:
        return {"error": "MCP server unavailable during tool execution attempt."}

    try:
        mcp_payload = {
            "tool": tool_name,
            "args": parameters
        }
        logger.info(f"Sending execution request to MCP server: {mcp_payload}")

        # Use httpx for async request to MCP server
        async with httpx.AsyncClient(timeout=40.0) as client:
             response = await client.post(
                 f"{MCP_SERVER_URL}/api/execute",
                 json=mcp_payload,
             )
        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
        logger.info(f"Received execution response from MCP server: {response.status_code}")
        return response.json()

    except httpx.RequestError as e:
        logger.error(f"Error executing tool '{tool_name}' on MCP server: {e}")
        return {"error": f"MCP Request Error: {e}"}
    except Exception as e:
        logger.error(f"Unexpected error during MCP tool execution '{tool_name}': {e}")
        return {"error": f"Unexpected Error: {e}"}
# --- End Refactored Logic ---

@app.post("/execute", response_model=Dict[str, Any])
async def execute_tool(request: ToolExecuteRequest):
    """Execute a tool with the given parameters (now calls internal async function)."""
    tool_name = request.tool_name
    parameters = request.parameters

    # Refresh the TOOLS list (optional, but good practice)
    current_mcp_available, current_mcp_tools_list = check_mcp_server()
    current_tools = current_mcp_tools_list if current_mcp_available and isinstance(current_mcp_tools_list, list) else FALLBACK_TOOLS

    tool = next((t for t in current_tools if t.get("name") == tool_name), None)
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")

    # Call the internal async function
    result = await _execute_mcp_tool_internal(tool_name, parameters)

    # Check if the internal function returned an error
    if isinstance(result, dict) and "error" in result:
         raise HTTPException(status_code=502, detail=f"MCP tool execution failed: {result['error']}")

    return result

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Process a chat message and return a response, potentially using tools."""
    message = request.message
    history = request.history or [] # Ensure history is a list

    # Check if API keys are configured
    if not DEEPSEEK_API_KEY and not GOOGLE_API_KEY:
        return ChatResponse(
            response="Sorry, the AI features are not available. API keys are not configured."
        )

    # Use Deepseek API if available
    if DEEPSEEK_API_KEY:
        try:
            # --- Fetch and Format Tools ---
            current_mcp_available, current_mcp_tools_list = check_mcp_server()
            current_tools = current_mcp_tools_list if current_mcp_available and isinstance(current_mcp_tools_list, list) else FALLBACK_TOOLS
            llm_formatted_tools = format_tools_for_llm(current_tools)
            logger.info(f"Providing {len(llm_formatted_tools)} tools to the LLM.")
            # --- End Fetch and Format Tools ---

            # Prepare conversation history for the first call
            first_call_history = []
            for msg in history:
                role = "user" if msg.get("role") == "user" else "assistant"
                # Include tool_calls if they exist in history for assistant messages
                content = msg.get("content", "")
                tool_calls_history = msg.get("tool_calls")
                if role == "assistant" and tool_calls_history:
                     first_call_history.append({"role": role, "content": content, "tool_calls": tool_calls_history})
                # Include tool results if they exist in history
                elif msg.get("role") == "tool":
                     first_call_history.append({"role": "tool", "tool_call_id": msg.get("tool_call_id"), "content": content})
                else:
                     first_call_history.append({"role": role, "content": content})

            # Add current user message
            first_call_history.append({"role": "user", "content": message})

            # --- First API Call to LLM ---
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {DEEPSEEK_API_KEY}"
            }
            payload = {
                "model": "deepseek-chat",
                "messages": first_call_history,
                "temperature": 0.7,
                "max_tokens": 500,
                "tools": llm_formatted_tools,
                "tool_choice": "auto"
            }

            logger.info("Sending first request to Deepseek API with tools.")
            response = requests.post(DEEPSEEK_API_URL, headers=headers, json=payload, timeout=30)
            response_data = response.json()

            if response.status_code != 200:
                logger.error(f"Deepseek API error (first call): {response_data}")
                error_message = response_data.get('error', {}).get('message', 'Unknown error')
                return ChatResponse(response=f"Sorry, there was an error with the AI service: {error_message}")

            # --- Handle potential tool calls ---
            response_message = response_data.get("choices", [{}])[0].get("message", {})
            tool_calls = response_message.get("tool_calls")

            if tool_calls:
                logger.info(f"LLM requested tool calls: {tool_calls}")

                # Append the assistant's response message (containing the tool_calls request) to history
                first_call_history.append(response_message)

                # --- Execute Tool Calls ---
                # TODO: Handle multiple tool calls if the API supports it
                if not isinstance(tool_calls, list) or len(tool_calls) == 0:
                     logger.error(f"Invalid tool_calls format received (not a list or empty): {tool_calls}")
                     return ChatResponse(response="Sorry, the AI returned an invalid tool request format.")

                tool_call = tool_calls[0] # Process the first tool call

                # *** Add check: Ensure tool_call is a dictionary ***
                if not isinstance(tool_call, dict):
                    logger.error(f"Invalid tool_call format received (not a dictionary): {tool_call}")
                    return ChatResponse(response="Sorry, the AI returned an invalid tool request format.")

                tool_call_id = tool_call.get("id")
                function_info = tool_call.get("function", {})

                # *** Add check: Ensure function_info is a dictionary ***
                if not isinstance(function_info, dict):
                    logger.error(f"Invalid function_info format received (not a dictionary): {function_info}")
                    # Attempt to provide a response even if function_info is bad, using the ID if available
                    error_msg = "Sorry, the AI returned an invalid tool function format."
                    if tool_call_id:
                         # Append a placeholder tool result indicating the error
                         first_call_history.append({
                              "role": "tool",
                              "tool_call_id": tool_call_id,
                              "content": "Error: Invalid tool function format received from LLM."
                         })
                         # Try calling the LLM again to explain the error
                         logger.info("Sending second request to Deepseek API after invalid function_info.")
                         payload["messages"] = first_call_history
                         try:
                              second_response = requests.post(DEEPSEEK_API_URL, headers=headers, json=payload, timeout=30)
                              second_response_data = second_response.json()
                              if second_response.status_code == 200:
                                   final_ai_response = second_response_data.get("choices", [{}])[0].get("message", {}).get("content", "")
                                   return ChatResponse(response=final_ai_response or error_msg)
                              else:
                                   logger.error(f"Deepseek API error (second call after invalid function_info): {second_response_data}")
                         except Exception as e_inner:
                              logger.error(f"Error calling Deepseek API (second call after invalid function_info): {e_inner}")
                    # Fallback if we can't even call the LLM again
                    return ChatResponse(response=error_msg)


                tool_name = function_info.get("name")
                try:
                    # Arguments might be a JSON string, need to parse
                    tool_args_str = function_info.get("arguments", "{}")
                    tool_args = json.loads(tool_args_str)
                except json.JSONDecodeError:
                    logger.error(f"Failed to parse tool arguments: {tool_args_str}")
                    tool_args = {}
                except TypeError:
                     logger.error(f"Tool arguments were not a string, cannot parse: {tool_args_str}")
                     tool_args = {}


                if not tool_name or not tool_call_id:
                     logger.error(f"Invalid tool call format received (missing name or id): {tool_call}")
                     return ChatResponse(response="Sorry, the AI tried to use a tool but the request was malformed.")

                logger.info(f"Executing tool internally: {tool_name} with args: {tool_args}")

                # *** Call the internal async function directly ***
                tool_result_data = await _execute_mcp_tool_internal(tool_name, tool_args)

                # Process the result (check for errors, format for LLM)
                if isinstance(tool_result_data, dict) and "error" in tool_result_data:
                    tool_result_content = f"Error executing tool '{tool_name}': {tool_result_data['error']}"
                    logger.error(tool_result_content)
                else:
                    # Format successful result as string
                    try:
                        # Attempt to extract text content if possible (same logic as before)
                        if isinstance(tool_result_data, dict) and 'content' in tool_result_data:
                            content_list = tool_result_data['content']
                            if isinstance(content_list, list) and len(content_list) > 0 and isinstance(content_list[0], dict) and 'text' in content_list[0]:
                                tool_result_content = content_list[0]['text']
                            else:
                                tool_result_content = json.dumps(tool_result_data['content'])
                        else:
                            tool_result_content = json.dumps(tool_result_data)
                        logger.info(f"Tool '{tool_name}' executed successfully via internal call.")
                    except Exception as format_exc:
                        logger.error(f"Error formatting tool result: {format_exc}")
                        tool_result_content = f"Error formatting tool result: {format_exc}"


                # Append the tool result message to the history
                first_call_history.append({
                    "role": "tool",
                    "tool_call_id": tool_call_id,
                    "content": tool_result_content
                })

                # --- Second API Call to LLM with Tool Result ---
                logger.info("Sending second request to Deepseek API with tool result.")
                payload["messages"] = first_call_history # Update messages with tool result

                second_response = requests.post(DEEPSEEK_API_URL, headers=headers, json=payload, timeout=30)
                second_response_data = second_response.json()

                if second_response.status_code == 200:
                    final_ai_response = second_response_data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    if not final_ai_response:
                         final_ai_response = "Sorry, I received the tool result but couldn't generate a final response."
                    return ChatResponse(response=final_ai_response)
                else:
                    logger.error(f"Deepseek API error (second call): {second_response_data}")
                    error_message = second_response_data.get('error', {}).get('message', 'Unknown error after tool execution')
                    return ChatResponse(response=f"Sorry, there was an error with the AI service after using a tool: {error_message}")
                # --- End Second API Call ---

            else:
                # No tool call, just get the content from the first response
                ai_response = response_message.get("content", "")
                if not ai_response:
                    ai_response = "Sorry, I couldn't generate a response."
                return ChatResponse(response=ai_response)
            # --- End Handle tool calls ---

        except Exception as e:
            logger.exception(f"Error in chat endpoint: {str(e)}") # Use logger.exception for stack trace
            return ChatResponse(
                response=f"Sorry, there was an unexpected error processing your request: {str(e)}"
            )

    # Fallback to mock responses
    if "course" in message.lower():
        response = "You're currently enrolled in 3 courses: Introduction to Computer Science, Web Development, and Artificial Intelligence."
    elif "assignment" in message.lower():
        response = "You have several upcoming assignments. The closest deadline is for 'Assignment 1' due on May 15, 2025."
    elif "help" in message.lower():
        response = "I can help you with information about your courses, assignments, grades, and more. What would you like to know?"
    else:
        response = "I'm your Canvas assistant. I can help you navigate your courses and assignments. What would you like to know about your academic work?"
    
    return ChatResponse(response=response)

# Error handlers
@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {str(exc)}")
    return {"status": "error", "message": str(exc)}