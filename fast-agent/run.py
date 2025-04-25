#!/usr/bin/env python
import os
import sys
import subprocess
import signal
import time
import logging
import platform

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()]
)

# Get the absolute path of the current script
current_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(current_dir)

# Add the current directory to Python path
if current_dir not in sys.path:
    sys.path.append(current_dir)

# Environment variables
os.environ["PYTHONPATH"] = os.pathsep.join([current_dir, os.environ.get("PYTHONPATH", "")])
os.environ["PYTHONUNBUFFERED"] = "1"

# Define ports
FASTAPI_PORT = os.environ.get("FAST_API_PORT", "8000")
STREAMLIT_PORT = os.environ.get("STREAMLIT_PORT", "8501")

def run_fastapi():
    """Run the FastAPI server"""
    logging.info("Starting FastAPI server...")
    
    # Check if we're on Windows - if so, disable reload to avoid multiprocessing issues
    is_windows = platform.system() == "Windows"
    reload_flag = [] if is_windows else ["--reload"]
    
    fastapi_cmd = [
        sys.executable,
        "-m", "uvicorn",
        "app.main:app",
        "--host", "localhost",
        "--port", FASTAPI_PORT,
    ] + reload_flag
    
    logging.info(f"Running FastAPI with command: {' '.join(fastapi_cmd)}")
    return subprocess.Popen(
        fastapi_cmd,
        cwd=current_dir,
        env=os.environ.copy()
    )

def run_streamlit():
    """Run the Streamlit server"""
    logging.info("Starting Streamlit server...")
    
    # Get the absolute path to the streamlit app
    streamlit_app_path = os.path.join(current_dir, "app", "streamlit_app.py")
    logging.info(f"Streamlit app path: {streamlit_app_path}")
    
    # Verify that the file exists
    if not os.path.exists(streamlit_app_path):
        logging.error(f"Streamlit app file not found: {streamlit_app_path}")
        # List directory contents to help debug
        app_dir = os.path.join(current_dir, "app")
        if os.path.exists(app_dir):
            logging.info(f"Contents of {app_dir}: {os.listdir(app_dir)}")
    
    streamlit_cmd = [
        sys.executable,
        "-m", "streamlit", "run",
        streamlit_app_path,
        "--server.port", STREAMLIT_PORT,
        "--server.address", "localhost"
    ]
    
    logging.info(f"Running Streamlit with command: {' '.join(streamlit_cmd)}")
    return subprocess.Popen(
        streamlit_cmd,
        cwd=current_dir,  # Run from the project root, not app dir
        env=os.environ.copy()
    )

# Global flag for clean shutdown
is_shutting_down = False

def handle_exit(signum, frame):
    """Handle termination signals"""
    global is_shutting_down
    if is_shutting_down:
        return
    
    is_shutting_down = True
    logging.info("Received termination signal. Shutting down...")
    
    logging.info("Terminating FastAPI server...")
    if 'fastapi_process' in globals() and fastapi_process and fastapi_process.poll() is None:
        fastapi_process.terminate()
    
    logging.info("Terminating Streamlit server...")
    if 'streamlit_process' in globals() and streamlit_process and streamlit_process.poll() is None:
        streamlit_process.terminate()
    
    # Allow processes to terminate gracefully
    time.sleep(1)
    
    # Force kill if still running
    if 'fastapi_process' in globals() and fastapi_process and fastapi_process.poll() is None:
        fastapi_process.kill()
    if 'streamlit_process' in globals() and streamlit_process and streamlit_process.poll() is None:
        streamlit_process.kill()
    
    logging.info("Shutdown complete.")
    sys.exit(0)

if __name__ == "__main__":
    # Register signal handlers
    signal.signal(signal.SIGINT, handle_exit)
    signal.signal(signal.SIGTERM, handle_exit)
    
    try:
        # Start servers
        fastapi_process = run_fastapi()
        streamlit_process = run_streamlit()
        
        logging.info(f"FastAPI server running on http://localhost:{FASTAPI_PORT}")
        logging.info(f"Streamlit server running on http://localhost:{STREAMLIT_PORT}")
        
        # Monitor processes
        while True:
            # Check if processes are still running
            if fastapi_process.poll() is not None:
                logging.error(f"FastAPI server exited with code {fastapi_process.returncode}")
                break
            
            if streamlit_process.poll() is not None:
                logging.error(f"Streamlit server exited with code {streamlit_process.returncode}")
                break
            
            time.sleep(1)
    
    except Exception as e:
        logging.error(f"Error: {str(e)}")
    
    finally:
        # Ensure clean shutdown
        handle_exit(None, None)