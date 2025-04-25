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
from langchain_google_vertexai import ChatVertexAI
from langchain_community.agent_toolkits import create_conversational_retrieval_agent

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
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
MODEL_NAME = os.getenv("MODEL_NAME", "gemini-pro")
USE_DEEPSEEK = os.getenv("USE_DEEPSEEK", "false").lower() == "true"

class DynamicTool:
    """A class to dynamically create and manage LangChain tools from MCP endpoints."""
    
    def __init__(self, name: str, description: str, api_path: str, params: List[Dict[str, Any]] = None):
        self.name = name
        self.description = description
        self.api_path = api_path
        self.params = self._parse_params(params or [])
    
    def _parse_params(self, params: List[Dict[str, Any]]):
        """Parse parameter definitions from MCP"""
        parsed_params = []
        for param in params:
            parsed_params.append(
                Field(
                    default=None,
                    description=param.get("description", ""),
                    name=param.get("name", "")
                )
            )
        return parsed_params
    
    async def arun(self, **kwargs):
        """Execute the tool by calling the MCP API"""
        try:
            logger.info(f"Executing tool {self.name} with params: {kwargs}")
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{MCP_URL}/api/execute",
                    json={
                        "name": self.name,
                        "args": kwargs
                    }
                )
                response.raise_for_status()
                result = response.json()
                return result.get("output", "No response from tool")
        except Exception as e:
            logger.error(f"Error executing tool {self.name}: {str(e)}")
            return f"Error executing tool: {str(e)}"

async def get_mcp_tools() -> List[DynamicTool]:
    """Fetch available tools from the MCP server and convert them to DynamicTool objects"""
    try:
        logger.info(f"Fetching tools from MCP server at {MCP_URL}")
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{MCP_URL}/api/tools")
            response.raise_for_status()
            tools_data = response.json()
        
        tools = []
        for tool_data in tools_data:
            tool_name = tool_data.get("name")
            tool_description = tool_data.get("description")
            tool_parameters = tool_data.get("args", [])
            
            if tool_name and tool_description:
                tools.append(
                    DynamicTool(
                        name=tool_name,
                        description=tool_description,
                        api_path=f"/api/execute",
                        params=tool_parameters
                    )
                )
        
        logger.info(f"Successfully fetched {len(tools)} tools from MCP server")
        return tools
    except Exception as e:
        logger.error(f"Error fetching tools from MCP server: {str(e)}")
        return []

async def create_agent_chain(tools: List[DynamicTool]) -> AgentExecutor:
    """Create a LangChain agent with the provided tools"""
    
    # Create the language model
    if USE_DEEPSEEK and DEEPSEEK_API_KEY:
        logger.info("Using DeepSeek API for the agent")
        llm = ChatOpenAI(
            model="deepseek-chat",
            temperature=0,
            api_key=DEEPSEEK_API_KEY,
            base_url="https://api.deepseek.com/v1"
        )
    elif GOOGLE_API_KEY:
        logger.info("Using Google Vertex AI for the agent")
        llm = ChatVertexAI(
            model_name=MODEL_NAME,
            temperature=0,
            google_api_key=GOOGLE_API_KEY
        )
    else:
        logger.error("No valid API key found. Set either GOOGLE_API_KEY or DEEPSEEK_API_KEY.")
        raise ValueError("No valid API key found. Set either GOOGLE_API_KEY or DEEPSEEK_API_KEY.")
    
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

if __name__ == "__main__":
    # Test fetching tools
    tools = get_mcp_tools()
    for tool in tools:
        print(f"Tool: {tool.name} - {tool.description}")
        print(f"Parameters: {[p.name for p in tool.params]}")
        print()
    
    # Test creating agent
    agent_chain = create_agent_chain(tools)
    if agent_chain:
        print("Agent chain created successfully")