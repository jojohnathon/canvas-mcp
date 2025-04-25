import os
import json
import logging
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
import httpx
from langchain_core.tools import tool
from langchain_core.pydantic_v1 import BaseModel, Field, create_model
from langchain_core.prompts import ChatPromptTemplate
from langchain.agents import AgentExecutor
from langchain.chat_models import ChatOpenAI

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Configuration from environment variables
MCP_URL = os.getenv("MCP_URL", "http://localhost:3000")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
MODEL_NAME = os.getenv("MODEL_NAME", "deepseek-chat")

# ... existing code ...

async def create_agent_chain(tools: List[DynamicTool]) -> AgentExecutor:
    """Create a LangChain agent with the provided tools"""
    
    if not DEEPSEEK_API_KEY:
        logger.error("No DEEPSEEK_API_KEY found in environment variables.")
        raise ValueError("DEEPSEEK_API_KEY is required but not found in environment variables.")
    
    # Create the language model using DeepSeek
    logger.info("Using DeepSeek API for the agent")
    llm = ChatOpenAI(
        model=MODEL_NAME,
        temperature=0,
        api_key=DEEPSEEK_API_KEY,
        base_url="https://api.deepseek.com/v1"
    )
    
    # Create the system message
    system_message = """
    You are a helpful Canvas student assistant. You can help students with various tasks related to their courses, 
    assignments, grades, and other Canvas activities. You have access to the following tools:
    
    1. Fetch to-do items
    2. Get upcoming assignments
    3. Check grades
    4. View assignment details
    5. Find recent announcements
    6. Access course modules
    7. Browse course files
    8. Check unread discussions
    9. View discussion topics
    10. Check quiz submissions
    
    Use these tools to assist the student with their questions and tasks.
    Always be helpful, clear, and concise in your responses.
    If you're not sure about something, admit it rather than making things up.
    """
    
    # Create the agent
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system_message),
            ("human", "{input}"),
        ]
    )
    
    agent = AgentExecutor.from_agent_and_tools(
        agent="chat-conversational-react-description",
        tools=tools,
        llm=llm,
        verbose=True,
        max_iterations=5,
        handle_parsing_errors=True,
    )
    
    logger.info("Agent chain created successfully")
    return agent