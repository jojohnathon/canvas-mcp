import os
import json
import requests
from fastapi import FastAPI, HTTPException, Depends, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv
import sys
import subprocess
import time
import signal
import logging
import argparse
import httpx

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("canvas-fast-agent")

# Load environment variables
load_dotenv()

# Environment variables
CANVAS_API_TOKEN = os.getenv("CANVAS_API_TOKEN")
CANVAS_BASE_URL = os.getenv("CANVAS_BASE_URL")
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:3000")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

# Validate required environment variables
if not CANVAS_API_TOKEN:
    raise ValueError("CANVAS_API_TOKEN environment variable is required")
if not CANVAS_BASE_URL:
    raise ValueError("CANVAS_BASE_URL environment variable is required")
if not GOOGLE_API_KEY:
    logger.warning("GOOGLE_API_KEY environment variable is not set. AI features will not work.")

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
            raise HTTPException(status_code=e.response.status_code, detail=str(e))
        except httpx.RequestError as e:
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

def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description="Canvas MCP Fast Agent - Demo Application")
    parser.add_argument("--api-port", type=int, default=8000, help=f"Port for FastAPI backend (default: 8000)")
    parser.add_argument("--streamlit-port", type=int, default=8501, help=f"Port for Streamlit frontend (default: 8501)")
    parser.add_argument("--mcp-port", type=int, default=3000, help=f"Port for MCP server (default: 3000)")
    parser.add_argument("--api-only", action="store_true", help="Run only the FastAPI backend")
    parser.add_argument("--streamlit-only", action="store_true", help="Run only the Streamlit frontend")
    return parser.parse_args()

def run_api_server(api_port, mcp_port):
    """Run the FastAPI server"""
    logger.info(f"Starting FastAPI server on port {api_port}")
    env = os.environ.copy()
    env["FAST_API_PORT"] = str(api_port)
    env["MCP_PORT"] = str(mcp_port)
    return subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "api:app", "--host", "0.0.0.0", "--port", str(api_port)],
        env=env,
        cwd=os.path.dirname(os.path.abspath(__file__))
    )

def run_streamlit_server(streamlit_port, api_port):
    """Run the Streamlit server"""
    logger.info(f"Starting Streamlit server on port {streamlit_port}")
    env = os.environ.copy()
    env["FAST_API_PORT"] = str(api_port)
    return subprocess.Popen(
        [sys.executable, "-m", "streamlit", "run", "streamlit_app.py", 
         "--server.port", str(streamlit_port), 
         "--server.address", "0.0.0.0",
         "--browser.serverAddress", "localhost",
         "--browser.gatherUsageStats", "false"],
        env=env,
        cwd=os.path.dirname(os.path.abspath(__file__))
    )

def handle_sigterm(signum, frame):
    """Handle termination signal"""
    logger.info("Received termination signal. Shutting down...")
    sys.exit(0)

def main():
    """Main entry point for the application"""
    # Parse command line arguments
    args = parse_args()
    
    # Register signal handlers
    signal.signal(signal.SIGINT, handle_sigterm)
    signal.signal(signal.SIGTERM, handle_sigterm)
    
    # Set environment variables based on command line arguments
    os.environ["FAST_API_PORT"] = str(args.api_port)
    os.environ["MCP_PORT"] = str(args.mcp_port)
    
    try:
        api_process = None
        streamlit_process = None
        
        # Start the FastAPI server if not running streamlit only
        if not args.streamlit_only:
            api_process = run_api_server(args.api_port, args.mcp_port)
            logger.info(f"FastAPI server running at http://localhost:{args.api_port}")
            # Wait a bit for the API server to start
            time.sleep(2)
        
        # Start the Streamlit server if not running API only
        if not args.api_only:
            streamlit_process = run_streamlit_server(args.streamlit_port, args.api_port)
            logger.info(f"Streamlit server running at http://localhost:{args.streamlit_port}")
        
        # Print summary
        logger.info("Canvas MCP Fast Agent Demo Running")
        if not args.streamlit_only:
            logger.info(f"API documentation: http://localhost:{args.api_port}/docs")
        if not args.api_only:
            logger.info(f"Streamlit interface: http://localhost:{args.streamlit_port}")
        
        # Keep the main process running
        while True:
            # Check if processes are still running
            if api_process and api_process.poll() is not None:
                logger.error("FastAPI server stopped unexpectedly. Restarting...")
                api_process = run_api_server(args.api_port, args.mcp_port)
            
            if streamlit_process and streamlit_process.poll() is not None:
                logger.error("Streamlit server stopped unexpectedly. Restarting...")
                streamlit_process = run_streamlit_server(args.streamlit_port, args.api_port)
            
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received. Shutting down...")
    finally:
        # Terminate child processes
        if api_process:
            logger.info("Terminating FastAPI server...")
            api_process.terminate()
            api_process.wait()
        
        if streamlit_process:
            logger.info("Terminating Streamlit server...")
            streamlit_process.terminate()
            streamlit_process.wait()
        
        logger.info("Shutdown complete.")

if __name__ == "__main__":
    main() 