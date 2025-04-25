import streamlit as st
import requests
import json
from typing import Dict, List, Any
from dotenv import load_dotenv
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
API_URL = os.getenv("FASTAPI_URL", "http://localhost:8000")

# Page setup
st.set_page_config(
    page_title="Canvas Student Assistant",
    page_icon="🎓",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Sidebar
st.sidebar.title("Canvas Student Assistant")
st.sidebar.markdown("### Navigate")
page = st.sidebar.radio("Select Interface", ["Chat", "Tools", "Prompts"])

# Session state initialization
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []

if "tools" not in st.session_state:
    try:
        response = requests.get(f"{API_URL}/tools")
        st.session_state.tools = response.json().get("tools", [])
    except Exception as e:
        st.session_state.tools = []
        st.sidebar.error(f"Failed to load tools: {str(e)}")

if "prompts" not in st.session_state:
    try:
        response = requests.get(f"{API_URL}/prompts")
        st.session_state.prompts = response.json().get("prompts", [])
    except Exception as e:
        st.session_state.prompts = []
        st.sidebar.error(f"Failed to load prompts: {str(e)}")

# Health check
try:
    health_response = requests.get(f"{API_URL}/health")
    health_data = health_response.json()
    
    if health_data.get("status") == "healthy":
        st.sidebar.success("✅ Connected to MCP server")
        
        # Check Gemini API configuration
        if health_data.get("google_api") == "configured":
            st.sidebar.success("✅ Google Gemini API configured")
        else:
            st.sidebar.error("❌ Google Gemini API not configured - AI features disabled")
    else:
        st.sidebar.error(f"❌ MCP server connection issue: {health_data.get('error', 'Unknown error')}")
except Exception as e:
    st.sidebar.error(f"❌ Cannot connect to API: {str(e)}")

# Chat interface
def chat_interface():
    st.title("Chat with Canvas Assistant")
    st.caption("Powered by Google Gemini")
    
    # Display chat history
    for message in st.session_state.chat_history:
        if message["role"] == "user":
            st.chat_message("user").write(message["content"])
        else:
            st.chat_message("assistant").write(message["content"])
    
    # Input for new messages
    if prompt := st.chat_input("Ask something about your Canvas courses..."):
        # Add user message to chat history
        st.session_state.chat_history.append({"role": "user", "content": prompt})
        st.chat_message("user").write(prompt)
        
        # Format history for API
        formatted_history = [
            {"role": msg["role"], "content": msg["content"]} 
            for msg in st.session_state.chat_history[:-1]  # Exclude the current message
        ]
        
        # Call API
        with st.chat_message("assistant"):
            with st.spinner("Thinking..."):
                try:
                    response = requests.post(
                        f"{API_URL}/chat",
                        json={"message": prompt, "history": formatted_history},
                        timeout=120
                    )
                    
                    if response.status_code == 200:
                        result = response.json()
                        response_text = result.get("response", "No response from server")
                        st.write(response_text)
                        st.session_state.chat_history.append({"role": "assistant", "content": response_text})
                    else:
                        st.error(f"Error: {response.status_code} - {response.text}")
                except Exception as e:
                    st.error(f"Failed to get response: {str(e)}")

# Tools interface
def tools_interface():
    st.title("Canvas Tools")
    
    if not st.session_state.tools:
        st.warning("No tools available. Please check the connection to the MCP server.")
        return
    
    # Tool selection
    selected_tool = st.selectbox(
        "Select a tool", 
        options=[tool["name"] for tool in st.session_state.tools],
        format_func=lambda x: next((t["description"] for t in st.session_state.tools if t["name"] == x), x)
    )
    
    # Get the selected tool details
    tool = next((t for t in st.session_state.tools if t["name"] == selected_tool), None)
    
    if tool:
        st.subheader(tool["description"])
        
        # Create dynamic form based on tool parameters
        parameters = {}
        if "parameters" in tool and tool["parameters"]:
            st.markdown("### Parameters")
            
            for param_name, param_info in tool["parameters"].items():
                param_type = param_info.get("type", "string")
                param_description = param_info.get("description", "")
                
                if param_type == "string":
                    parameters[param_name] = st.text_input(f"{param_name} ({param_description})")
                elif param_type == "integer":
                    parameters[param_name] = st.number_input(f"{param_name} ({param_description})", step=1)
                elif param_type == "boolean":
                    parameters[param_name] = st.checkbox(f"{param_name} ({param_description})")
                else:
                    parameters[param_name] = st.text_input(f"{param_name} ({param_description}) - Type: {param_type}")
        
        # Execute button
        if st.button("Execute Tool"):
            with st.spinner("Executing..."):
                try:
                    response = requests.post(
                        f"{API_URL}/execute",
                        json={"tool_name": selected_tool, "parameters": parameters},
                        timeout=120
                    )
                    
                    if response.status_code == 200:
                        result = response.json()
                        st.json(result)
                    else:
                        st.error(f"Error: {response.status_code} - {response.text}")
                except Exception as e:
                    st.error(f"Failed to execute tool: {str(e)}")

# Prompts interface
def prompts_interface():
    st.title("Canvas Prompts")
    
    if not st.session_state.prompts:
        st.warning("No prompts available. Please check the connection to the MCP server.")
        return
    
    # Prompt selection
    selected_prompt = st.selectbox(
        "Select a prompt", 
        options=[prompt["name"] for prompt in st.session_state.prompts],
        format_func=lambda x: next((p["description"] for p in st.session_state.prompts if p["name"] == x), x)
    )
    
    # Get the selected prompt details
    prompt = next((p for p in st.session_state.prompts if p["name"] == selected_prompt), None)
    
    if prompt:
        st.subheader(prompt["description"])
        
        # Create dynamic form based on prompt arguments
        arguments = {}
        if "arguments" in prompt and prompt["arguments"]:
            st.markdown("### Arguments")
            
            for arg_name, arg_info in prompt["arguments"].items():
                arg_type = arg_info.get("type", "string")
                arg_description = arg_info.get("description", "")
                
                if arg_type == "string":
                    arguments[arg_name] = st.text_input(f"{arg_name} ({arg_description})")
                elif arg_type == "integer":
                    arguments[arg_name] = st.number_input(f"{arg_name} ({arg_description})", step=1)
                elif arg_type == "boolean":
                    arguments[arg_name] = st.checkbox(f"{arg_name} ({arg_description})")
                else:
                    arguments[arg_name] = st.text_input(f"{arg_name} ({arg_description}) - Type: {arg_type}")
        
        # Execute button
        if st.button("Run Prompt"):
            with st.spinner("Running..."):
                try:
                    response = requests.post(
                        f"{API_URL}/prompt",
                        json={"prompt_name": selected_prompt, "arguments": arguments},
                        timeout=120
                    )
                    
                    if response.status_code == 200:
                        result = response.json()
                        st.markdown(result.get("result", "No result returned"))
                    else:
                        st.error(f"Error: {response.status_code} - {response.text}")
                except Exception as e:
                    st.error(f"Failed to run prompt: {str(e)}")

# Show the selected interface
if page == "Chat":
    chat_interface()
elif page == "Tools":
    tools_interface()
elif page == "Prompts":
    prompts_interface()