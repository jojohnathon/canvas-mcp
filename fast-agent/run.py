#!/usr/bin/env python
import subprocess
import sys
import os
import argparse
import time
import signal
import logging
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("canvas-assistant")

# Load environment variables
load_dotenv()

def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description="Canvas Student Assistant")
    parser.add_argument("--api-port", type=int, default=8000, help="Port for FastAPI backend (default: 8000)")
    parser.add_argument("--streamlit-port", type=int, default=8501, help="Port for Streamlit frontend (default: 8501)")
    parser.add_argument("--api-only", action="store_true", help="Run only the FastAPI backend")
    parser.add_argument("--streamlit-only", action="store_true", help="Run only the Streamlit frontend")
    return parser.parse_args()

def run_api_server(api_port):
    """Run the FastAPI server"""
    logger.info(f"Starting FastAPI server on port {api_port}")
    env = os.environ.copy()
    env["PORT"] = str(api_port)
    return subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", str(api_port), "--reload"],
        env=env
    )

def run_streamlit_server(streamlit_port, api_port):
    """Run the Streamlit server"""
    logger.info(f"Starting Streamlit server on port {streamlit_port}")
    env = os.environ.copy()
    env["FASTAPI_URL"] = f"http://localhost:{api_port}"
    return subprocess.Popen(
        [sys.executable, "-m", "streamlit", "run", "app/streamlit_app.py", 
         "--server.port", str(streamlit_port)],
        env=env
    )

def handle_sigterm(signum, frame):
    """Handle termination signal"""
    logger.info("Received termination signal. Shutting down...")
    sys.exit(0)

def main():
    # Parse command line arguments
    args = parse_args()
    
    # Register signal handlers
    signal.signal(signal.SIGINT, handle_sigterm)
    signal.signal(signal.SIGTERM, handle_sigterm)
    
    try:
        api_process = None
        streamlit_process = None
        
        # Start the FastAPI server if not running streamlit only
        if not args.streamlit_only:
            api_process = run_api_server(args.api_port)
            logger.info(f"FastAPI server running at http://localhost:{args.api_port}")
            # Wait a bit for the API server to start
            time.sleep(2)
        
        # Start the Streamlit server if not running API only
        if not args.api_only:
            streamlit_process = run_streamlit_server(args.streamlit_port, args.api_port)
            logger.info(f"Streamlit server running at http://localhost:{args.streamlit_port}")
        
        # Print summary
        logger.info("Canvas Student Assistant Running")
        if not args.streamlit_only:
            logger.info(f"API documentation: http://localhost:{args.api_port}/docs")
        if not args.api_only:
            logger.info(f"Streamlit interface: http://localhost:{args.streamlit_port}")
        
        # Keep the main process running
        while True:
            # Check if processes are still running
            if api_process and api_process.poll() is not None:
                logger.error("FastAPI server stopped unexpectedly. Restarting...")
                api_process = run_api_server(args.api_port)
            
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