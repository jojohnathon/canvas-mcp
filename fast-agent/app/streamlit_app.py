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

# Define markers (should match llm_service.py)
TOOL_CALL_START_MARKER = "[TOOL_CALL_START]"
TOOL_CALL_END_MARKER = "[TOOL_CALL_END]"

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
        full_response_content = "" # Initialize empty string to accumulate content
        current_status_message = "" # Track the latest status message

        try:
            # Format chat history for the API
            history = [
                {"role": msg["role"], "content": msg["content"]}
                for msg in st.session_state.messages[:-1] # Exclude the current user message
            ]

            # Make streaming request to API
            response = requests.post(
                f"{API_URL}/chat",
                json={
                    "message": prompt,
                    "history": history,
                    "use_deepseek": True,
                    "stream": True # Enable streaming
                },
                timeout=120,
                stream=True # Enable streaming in requests
            )

            response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)

            # Process the stream
            buffer = ""
            for chunk in response.iter_content(chunk_size=None, decode_unicode=True):
                if not chunk:
                    continue
                
                buffer += chunk
                processed_upto = 0

                while True:
                    start_marker_pos = buffer.find(TOOL_CALL_START_MARKER, processed_upto)
                    end_marker_pos = buffer.find(TOOL_CALL_END_MARKER, processed_upto)

                    # Find the earliest marker
                    first_marker_pos = -1
                    is_start_marker = False
                    if start_marker_pos != -1 and (end_marker_pos == -1 or start_marker_pos < end_marker_pos):
                        first_marker_pos = start_marker_pos
                        is_start_marker = True
                        marker_len = len(TOOL_CALL_START_MARKER)
                    elif end_marker_pos != -1:
                        first_marker_pos = end_marker_pos
                        is_start_marker = False
                        marker_len = len(TOOL_CALL_END_MARKER)
                    
                    # If no marker found in the remaining buffer
                    if first_marker_pos == -1:
                        # Process any remaining text in the buffer after the last processed point
                        text_part = buffer[processed_upto:]
                        if text_part:
                            full_response_content += text_part
                            # Display accumulated content + cursor, unless a status is active
                            if not current_status_message:
                                message_placeholder.markdown(full_response_content + "▌")
                            else:
                                # If status is active, update status with content preview
                                message_placeholder.text(f"{current_status_message} ... {full_response_content[-30:]}▌")
                        processed_upto = len(buffer) # Mark entire buffer as processed
                        break # Exit inner loop, wait for more chunks

                    # Process text before the marker
                    text_before_marker = buffer[processed_upto:first_marker_pos]
                    if text_before_marker:
                        full_response_content += text_before_marker
                        # Display accumulated content + cursor, unless a status is active
                        if not current_status_message:
                            message_placeholder.markdown(full_response_content + "▌")
                        else:
                            message_placeholder.text(f"{current_status_message} ... {full_response_content[-30:]}▌")

                    # Find the end of the marker message (newline)
                    marker_message_end = buffer.find('\n', first_marker_pos + marker_len)
                    if marker_message_end == -1:
                        # Marker message might be incomplete, wait for more chunks
                        break # Exit inner loop

                    # Extract and process the marker message
                    marker_content = buffer[first_marker_pos + marker_len : marker_message_end].strip()
                    if is_start_marker:
                        logger.info(f"Streamlit received tool start: {marker_content}")
                        current_status_message = f"⏳ {marker_content}"
                        message_placeholder.text(current_status_message)
                    else:
                        logger.info(f"Streamlit received tool end: {marker_content}")
                        current_status_message = f"✅ {marker_content}" # Keep status until next text
                        message_placeholder.text(current_status_message)
                        # Reset status message *only* if it was the end marker, 
                        # so subsequent text chunks clear it.
                        current_status_message = "" 

                    # Update processed position
                    processed_upto = marker_message_end + 1

                # Keep only the unprocessed part of the buffer
                buffer = buffer[processed_upto:]

            # Final update after stream ends
            # Clear any lingering status message if needed and show final content
            message_placeholder.markdown(full_response_content)

            # Add final assistant response to chat history
            if full_response_content:
                 st.session_state.messages.append({"role": "assistant", "content": full_response_content})
            else:
                 # Handle cases where the stream might end without actual content (e.g., only markers)
                 fallback_message = "Received an empty response after processing."
                 message_placeholder.warning(fallback_message)
                 st.session_state.messages.append({"role": "assistant", "content": fallback_message})


        except requests.exceptions.RequestException as e:
            error_message = f"Failed to communicate with the API: {str(e)}"
            message_placeholder.error(error_message)
            logger.error(error_message)
            # Add error to history to maintain context
            st.session_state.messages.append({"role": "assistant", "content": f"Error: {error_message}"})
        except Exception as e:
            error_message = f"An unexpected error occurred: {str(e)}"
            message_placeholder.error(error_message)
            logger.exception("Unexpected error during Streamlit chat processing:") # Log full traceback
            # Add error to history
            st.session_state.messages.append({"role": "assistant", "content": f"Error: {error_message}"})


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