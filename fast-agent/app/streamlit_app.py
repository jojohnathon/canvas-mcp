import os
import sys
import streamlit as st
import requests
import json
import time
from typing import Dict, Any, List
import logging
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("canvas-fast-agent-streamlit")

# Make sure we're running in the correct directory
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)
os.chdir(current_dir)

# Load environment variables
load_dotenv()

# Constants
FAST_API_PORT = os.getenv("FAST_API_PORT", "8000")
API_URL = os.getenv("API_URL", f"http://localhost:{FAST_API_PORT}")
MCP_URL = os.getenv("MCP_URL", "http://localhost:3001")

logger.info(f"API URL: {API_URL}")
logger.info(f"MCP URL: {MCP_URL}")
logger.info(f"Working directory: {os.getcwd()}")
logger.info(f"Python executable: {sys.executable}")

# Page configuration
st.set_page_config(
    page_title="Canvas Student Assistant",
    page_icon="🎓",
    layout="wide",
    initial_sidebar_state="expanded",
)

# App title and intro
st.title("Canvas Student Assistant")
st.markdown("A smart assistant to help you with Canvas LMS using AI.")

# Sidebar
with st.sidebar:
    st.header("About")
    st.info(
        """
        This assistant helps you interact with Canvas LMS using natural language.
        You can ask questions about your courses, assignments, and more.
        """
    )
    
    # Health check
    try:
        response = requests.get(f"{API_URL}/health", timeout=5)
        health_data = response.json()
        
        if health_data.get("status") == "healthy":
            st.success("✅ API Connected")
            
            if health_data.get("deepseek_api") == "configured":
                st.success("✅ DeepSeek AI Features Available")
            else:
                st.error("❌ DeepSeek AI Features Not Available - Missing API key")
                st.warning("This application requires the DeepSeek API to function properly.")
        else:
            st.error("❌ API Connection Issue")
            st.code(json.dumps(health_data, indent=2))
    except Exception as e:
        st.error(f"❌ API Connection Failed: {str(e)}")

    # Add a separator
    st.markdown("---")
    st.subheader("AI Model")
    st.info("Using DeepSeek's AI model for all responses")

# Chat interface
st.header("Chat with Canvas Assistant")

# Initialize chat history
if "messages" not in st.session_state:
    st.session_state.messages = []

# Display chat messages
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.write(message["content"])

# Chat input
if prompt := st.chat_input("Ask about your Canvas courses..."):
    # Add user message to chat history
    st.session_state.messages.append({"role": "user", "content": prompt})
    
    # Display user message
    with st.chat_message("user"):
        st.write(prompt)
    
    # Display assistant response
    with st.chat_message("assistant"):
        message_placeholder = st.empty()
        message_placeholder.text("Thinking...")
        
        try:
            # Format chat history for the API
            history = [
                {"role": msg["role"], "content": msg["content"]} 
                for msg in st.session_state.messages[:-1]  # Exclude the current message
            ]
            
            # Make request to API
            response = requests.post(
                f"{API_URL}/chat",
                json={
                    "message": prompt, 
                    "history": history,
                    "use_deepseek": True
                },
                timeout=120
            )
            
            if response.status_code == 200:
                result = response.json()
                response_content = result.get("response", "Sorry, I couldn't generate a response.")
                message_placeholder.markdown(response_content)
                
                # Add assistant response to chat history
                st.session_state.messages.append({"role": "assistant", "content": response_content})
            else:
                error_message = f"Error: {response.status_code} - {response.text}"
                message_placeholder.error(error_message)
                logger.error(error_message)
        except Exception as e:
            error_message = f"Failed to communicate with the API: {str(e)}"
            message_placeholder.error(error_message)
            logger.error(error_message)

# Tools section
st.header("Available Tools")
try:
    tools_response = requests.get(f"{API_URL}/tools", timeout=5)
    if tools_response.status_code == 200:
        tools = tools_response.json()
        
        # Check if tools list is not empty before displaying
        if tools:
            with st.expander("View Available Tools"):
                for tool in tools:
                    st.subheader(tool["name"])
                    st.markdown(tool["description"])
                    if tool.get("parameters"):
                        st.markdown("**Parameters:**")
                        # Display parameters in a more readable format
                        param_list = []
                        for param_name, param_info in tool["parameters"].items():
                            req = " (required)" if param_info.get("required") else ""
                            param_list.append(f"- `{param_name}` ({param_info.get('type', 'string')}){req}: {param_info.get('description', '')}")
                        st.markdown("\n".join(param_list))
                    else:
                        st.markdown("**Parameters:** None")
                    st.markdown("---")
        else:
            st.info("No tools available from the API.") # Display message if no tools
    else:
        st.warning(f"Could not fetch tools: {tools_response.status_code} - {tools_response.text}")
except Exception as e:
    st.error(f"Failed to load tools: {str(e)}")

# Footer
st.markdown("---")
st.markdown("Made with ❤️ using FastAPI, Streamlit, and the Canvas API")