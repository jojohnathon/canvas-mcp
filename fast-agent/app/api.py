import os
import json
import asyncio
import logging
from typing import Dict, List, Any, Optional
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from contextlib import asynccontextmanager

from agent import get_mcp_tools, create_agent_chain

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Get Google API Key
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    logger.warning("GOOGLE_API_KEY environment variable not set. AI features will not work.")

# Initialize agent tools and chain on startup
tools = []
agent_chain = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load tools and create agent chain on startup
    global tools, agent_chain
    try:
        tools = await get_mcp_tools()
        if GOOGLE_API_KEY:
            agent_chain = await create_agent_chain(tools)
            logger.info("Agent tools and chain initialized successfully")
        else:
            logger.warning("Google API key not found - AI features disabled")
    except Exception as e:
        logger.error(f"Failed to initialize agent: {str(e)}")
    
    yield
    
    # Cleanup on shutdown
    logger.info("Shutting down API")

# Create FastAPI app
app = FastAPI(
    title="Canvas Student Assistant API",
    description="API for interacting with Canvas MCP through LangChain agents",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For production, specify the actual frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class HealthResponse(BaseModel):
    status: str
    agent_ready: bool

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[Dict[str, str]]] = []

class ChatResponse(BaseModel):
    response: str
    tool_calls: Optional[List[Dict[str, Any]]] = None

class PromptRequest(BaseModel):
    prompt_name: str
    parameters: Optional[Dict[str, str]] = {}

class PromptResponse(BaseModel):
    output: str
    tool_calls: Optional[List[Dict[str, Any]]] = None

class ToolRequest(BaseModel):
    tool_name: str
    parameters: Dict[str, Any]

class ToolResponse(BaseModel):
    result: Any

# API routes
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Check API health and agent readiness"""
    return {
        "status": "healthy",
        "agent_ready": agent_chain is not None,
        "google_api": "configured" if GOOGLE_API_KEY else "not configured"
    }

@app.get("/tools")
async def get_tools():
    """Get available MCP tools"""
    global tools
    if not tools:
        try:
            tools = await get_mcp_tools()
        except Exception as e:
            logger.error(f"Failed to fetch tools: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to fetch tools: {str(e)}")
    
    # Format the tools for display
    formatted_tools = []
    for tool in tools:
        formatted_tools.append({
            "name": tool.name,
            "description": tool.description,
            "parameters": [
                {"name": param.name, "description": param.description}
                for param in tool.params
            ] if hasattr(tool, "params") else []
        })
    
    return formatted_tools

@app.get("/prompts")
async def get_prompts():
    """Get available MCP predefined prompts"""
    try:
        # Fetch prompts from MCP server
        MCP_SERVER_URL = os.getenv("MCP_URL", "http://localhost:3000")
        
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{MCP_SERVER_URL}/api/prompts")
            response.raise_for_status()
            prompts = response.json()
        
        return prompts
    except Exception as e:
        logger.error(f"Failed to fetch prompts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch prompts: {str(e)}")

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Process a chat message using the LangChain agent"""
    global agent_chain
    
    if not GOOGLE_API_KEY:
        raise HTTPException(status_code=400, detail="Google API Key not configured. AI features disabled.")
    
    if agent_chain is None:
        try:
            tools = await get_mcp_tools()
            agent_chain = await create_agent_chain(tools)
        except Exception as e:
            logger.error(f"Failed to initialize agent: {str(e)}")
            raise HTTPException(status_code=500, detail="Agent not available")
    
    try:
        # Convert the chat history to the format expected by the agent
        formatted_history = []
        for msg in request.history:
            if msg.get("role") == "user":
                formatted_history.append({"type": "human", "content": msg.get("content", "")})
            elif msg.get("role") == "assistant":
                formatted_history.append({"type": "ai", "content": msg.get("content", "")})
        
        # Run the agent
        result = await agent_chain.ainvoke({
            "input": request.message,
            "chat_history": formatted_history
        })
        
        # Extract the response
        response = result.get("output", "I couldn't process your request.")
        
        # Extract tool calls if available
        tool_calls = result.get("intermediate_steps", [])
        formatted_tool_calls = []
        
        for action, output in tool_calls:
            formatted_tool_calls.append({
                "tool": action.tool,
                "input": action.tool_input,
                "output": str(output)
            })
        
        return {
            "response": response,
            "tool_calls": formatted_tool_calls
        }
    except Exception as e:
        logger.error(f"Error processing chat: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing chat: {str(e)}")

@app.post("/run-prompt", response_model=PromptResponse)
async def run_prompt(request: PromptRequest):
    """Run a predefined MCP prompt"""
    try:
        # Run the prompt using the MCP server
        MCP_SERVER_URL = os.getenv("MCP_URL", "http://localhost:3000")
        
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{MCP_SERVER_URL}/api/prompts/{request.prompt_name}/execute",
                json=request.parameters
            )
            response.raise_for_status()
            result = response.json()
        
        return {
            "output": result.get("output", "No output received"),
            "tool_calls": result.get("toolCalls", [])
        }
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error running prompt: {str(e)}")
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        logger.error(f"Error running prompt: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error running prompt: {str(e)}")

@app.post("/execute-tool", response_model=ToolResponse)
async def execute_tool(request: ToolRequest):
    """Execute a specific tool directly"""
    global tools
    
    if not tools:
        try:
            tools = await get_mcp_tools()
        except Exception as e:
            logger.error(f"Failed to fetch tools: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to fetch tools: {str(e)}")
    
    # Find the requested tool
    tool = next((t for t in tools if t.name == request.tool_name), None)
    
    if tool is None:
        raise HTTPException(status_code=404, detail=f"Tool '{request.tool_name}' not found")
    
    try:
        # Execute the tool
        result = await tool.arun(**request.parameters)
        return {"result": result}
    except Exception as e:
        logger.error(f"Error executing tool '{request.tool_name}': {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error executing tool: {str(e)}")

# Run the server with uvicorn if executed directly
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True) 