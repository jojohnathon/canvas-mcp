import os
import json
import requests
from fastapi import FastAPI, HTTPException, Depends, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv
import logging
import httpx

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("canvas-fast-agent-api")

# Load environment variables
load_dotenv()

# Environment variables
CANVAS_API_TOKEN = os.getenv("CANVAS_API_TOKEN")
CANVAS_BASE_URL = os.getenv("CANVAS_BASE_URL")
MCP_PORT = os.getenv("MCP_PORT", "3000")
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", f"http://localhost:{MCP_PORT}")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

# Log environment variables for debugging
logger.info(f"MCP_PORT: {MCP_PORT}")
logger.info(f"MCP_SERVER_URL: {MCP_SERVER_URL}")

# Create FastAPI app
app = FastAPI(
    title="Canvas Student Assistant API",
    description="API for the Canvas Student Assistant powered by fast-agent",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Models
class ToolInput(BaseModel):
    tool_name: str
    parameters: Dict[str, Any] = {}

class PromptInput(BaseModel):
    prompt_name: str
    arguments: Dict[str, Any] = {}

class ChatInput(BaseModel):
    message: str
    history: List[Dict[str, str]] = []

# Helper function for making requests to the MCP server
async def make_request(endpoint: str, method: str = "GET", data: Any = None) -> Dict:
    logger.info(f"Making {method} request to {MCP_SERVER_URL}{endpoint}")
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            if method == "GET":
                response = await client.get(f"{MCP_SERVER_URL}{endpoint}")
            elif method == "POST":
                response = await client.post(f"{MCP_SERVER_URL}{endpoint}", json=data)
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported method: {method}")
            
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error: {e}")
            raise HTTPException(status_code=e.response.status_code, detail=str(e))
        except httpx.RequestError as e:
            logger.error(f"Request error: {e}")
            raise HTTPException(status_code=500, detail=f"Error communicating with MCP server: {str(e)}")

# Routes
@app.get("/")
async def root():
    return {"message": "Canvas Student Assistant API is running"}

@app.get("/health")
async def health_check():
    try:
        # Check if the MCP server is running
        response = await make_request("/api/tools")
        status_data = {
            "status": "healthy", 
            "mcp_server": "connected",
            "google_api": "configured" if GOOGLE_API_KEY else "not configured"
        }
        return status_data
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {"status": "unhealthy", "error": str(e)}

@app.get("/tools")
async def get_tools():
    return await make_request("/api/tools")

@app.get("/prompts")
async def get_prompts():
    return await make_request("/api/prompts")

@app.post("/execute")
async def execute_tool(tool_input: ToolInput):
    data = {
        "name": tool_input.tool_name,
        "parameters": tool_input.parameters
    }
    return await make_request("/api/execute", method="POST", data=data)

@app.post("/prompt")
async def run_prompt(prompt_input: PromptInput):
    data = {
        "name": prompt_input.prompt_name,
        "arguments": prompt_input.arguments
    }
    return await make_request("/api/prompt", method="POST", data=data)

@app.post("/chat")
async def chat_with_agent(chat_input: ChatInput):
    if not GOOGLE_API_KEY:
        raise HTTPException(status_code=400, detail="GOOGLE_API_KEY not configured")
        
    data = {
        "message": chat_input.message,
        "history": chat_input.history
    }
    return await make_request("/api/chat", method="POST", data=data)

# Startup and shutdown events
@app.on_event("startup")
async def startup_event():
    logger.info("FastAPI server started")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("FastAPI server shutting down")