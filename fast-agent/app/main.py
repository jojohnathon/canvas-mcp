from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
import logging
import json
import requests
from urllib3.exceptions import NewConnectionError, MaxRetryError

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

# Check MCP server connectivity
def check_mcp_server():
    """Check if the MCP server is available"""
    try:
        response = requests.get(f"{MCP_SERVER_URL}/api/tools", timeout=5)
        if response.status_code == 200:
            return True, response.json()
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

# Try to get tools from MCP server or use fallback
mcp_available, mcp_tools = check_mcp_server()
TOOLS = mcp_tools if mcp_available else FALLBACK_TOOLS
logger.info(f"MCP server status: {'connected' if mcp_available else 'unavailable'}")
if not mcp_available:
    logger.warning("Using fallback tools since MCP server is unavailable")

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
    mcp_available, mcp_tools = check_mcp_server()
    if mcp_available:
        return mcp_tools
    return FALLBACK_TOOLS

@app.post("/execute", response_model=Dict[str, Any])
async def execute_tool(request: ToolExecuteRequest):
    """Execute a tool with the given parameters"""
    tool_name = request.tool_name
    parameters = request.parameters
    
    # Find the tool
    tool = next((t for t in TOOLS if t["name"] == tool_name), None)
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")
    
    # Try to execute the tool on the MCP server
    mcp_available, _ = check_mcp_server()
    if mcp_available:
        try:
            response = requests.post(
                f"{MCP_SERVER_URL}/api/execute", 
                json={"tool_name": tool_name, "parameters": parameters},
                timeout=30
            )
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"MCP server execution error: {response.status_code}")
                # Fall back to mock implementation
        except Exception as e:
            logger.error(f"Error executing tool on MCP server: {str(e)}")
            # Fall back to mock implementation
    
    # Mock implementation (fallback)
    if tool_name == "get_courses":
        return {
            "courses": [
                {"id": "1", "name": "Introduction to Computer Science"},
                {"id": "2", "name": "Web Development"},
                {"id": "3", "name": "Artificial Intelligence"}
            ]
        }
    elif tool_name == "get_assignments":
        course_id = parameters.get("course_id")
        if not course_id:
            raise HTTPException(status_code=400, detail="Missing required parameter 'course_id'")
        return {
            "assignments": [
                {"id": "101", "name": "Assignment 1", "due_date": "2025-05-15"},
                {"id": "102", "name": "Assignment 2", "due_date": "2025-05-22"},
                {"id": "103", "name": "Final Project", "due_date": "2025-06-10"}
            ]
        }
    elif tool_name == "submit_assignment":
        # Check required parameters
        required_params = ["course_id", "assignment_id", "submission_text"]
        for param in required_params:
            if param not in parameters:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Missing required parameter '{param}'"
                )
        
        return {
            "status": "success",
            "message": f"Assignment {parameters['assignment_id']} submitted successfully"
        }
    
    # Default response for unimplemented tools
    return {"status": "error", "message": f"Tool '{tool_name}' execution not implemented"}

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Process a chat message and return a response"""
    message = request.message
    history = request.history
    
    # Check if API keys are configured
    if not DEEPSEEK_API_KEY and not GOOGLE_API_KEY:
        return ChatResponse(
            response="Sorry, the AI features are not available. API keys are not configured."
        )
    
    # Use Deepseek API if available, else fallback to mock responses
    if DEEPSEEK_API_KEY:
        try:
            # Prepare conversation history in the format Deepseek expects
            formatted_history = []
            for msg in history:
                role = "user" if msg.get("role") == "user" else "assistant"
                formatted_history.append({"role": role, "content": msg.get("content", "")})
            
            # Add current user message
            formatted_history.append({"role": "user", "content": message})
            
            # Make API call to Deepseek
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {DEEPSEEK_API_KEY}"
            }
            
            payload = {
                "model": "deepseek-chat",
                "messages": formatted_history,
                "temperature": 0.7,
                "max_tokens": 500
            }
            
            logger.info("Sending request to Deepseek API")
            response = requests.post(DEEPSEEK_API_URL, headers=headers, json=payload, timeout=30)
            response_data = response.json()
            
            if response.status_code == 200:
                ai_response = response_data.get("choices", [{}])[0].get("message", {}).get("content", "")
                if not ai_response:
                    ai_response = "Sorry, I couldn't generate a response."
                
                return ChatResponse(response=ai_response)
            else:
                logger.error(f"Deepseek API error: {response_data}")
                return ChatResponse(
                    response=f"Sorry, there was an error with the AI service: {response_data.get('error', {}).get('message', 'Unknown error')}"
                )
                
        except Exception as e:
            logger.error(f"Error calling Deepseek API: {str(e)}")
            return ChatResponse(
                response=f"Sorry, there was an error communicating with the AI service: {str(e)}"
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