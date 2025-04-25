import os
import logging
import json
import time  # Import the time module
from openai import OpenAI
from typing import List, Callable, Optional, Dict, Any  # Import necessary types
import asyncio  # Import asyncio

logger = logging.getLogger(__name__)

class LLMService:
    def __init__(self):
        self.deepseek_api_key = os.environ.get("DEEPSEEK_API_KEY")
        self.model_name = os.environ.get("MODEL_NAME", "deepseek-chat")
        
        # Configure DeepSeek API
        if self.deepseek_api_key:
            self.client = OpenAI(
                api_key=self.deepseek_api_key,
                base_url="https://api.deepseek.com/v1"
            )
            logger.info(f"DeepSeek API configured with model: {self.model_name}")
        else:
            self.client = None
            logger.error("DeepSeek API not configured. Please set DEEPSEEK_API_KEY.")

    async def generate_response(self, messages: List[Dict[str, Any]], tools: Optional[List[Dict[str, Any]]] = None, tool_executor: Optional[Callable[[str, Dict[str, Any]], Any]] = None):
        """
        Generate a response using the DeepSeek API, handling tool calls if necessary.
        
        Args:
            messages: List of message objects (dictionaries) with 'role' and 'content'.
            tools: List of tools formatted for the OpenAI API (optional).
            tool_executor: An async function to call when a tool needs execution. 
                           It should accept (tool_name: str, tool_args: dict) and return the result content (str). (optional).
            
        Returns:
            Generated text response (str).
        """
        if not self.client:
            logger.error("DeepSeek API not configured")
            return "I'm sorry, but the AI service is not properly configured. Please check the DEEPSEEK_API_KEY environment variable."

        try:
            logger.debug(f"Initial messages for LLM: {messages}")
            current_messages = messages[:]  # Work with a copy

            # --- First API Call ---
            start_time_first_call = time.time()  # Start timer for first call
            logger.info("Making first call to DeepSeek API...")
            # Ensure messages are correctly formatted dictionaries
            formatted_messages = [{"role": m["role"], "content": m["content"]} for m in current_messages if isinstance(m, dict) and "role" in m and "content" in m]
            
            # Ensure tools are correctly formatted dictionaries if provided
            formatted_tools = tools if tools and all(isinstance(t, dict) for t in tools) else None

            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=formatted_messages,
                tools=formatted_tools,
                tool_choice="auto" if formatted_tools else None,
                max_tokens=2048,
                temperature=0.7,
            )
            end_time_first_call = time.time()  # End timer for first call
            duration_first_call = end_time_first_call - start_time_first_call
            logger.info(f"First API call completed in {duration_first_call:.2f} seconds.")
            
            response_message = response.choices[0].message
            logger.debug(f"First API response message: {response_message}")

            tool_calls = response_message.tool_calls

            # --- Handle Tool Calls (if any) ---
            if tool_calls and tool_executor:
                start_time_tool_execution = time.time()  # Start timer for tool execution
                logger.info(f"LLM requested tool calls: {len(tool_calls)}")
                # Append the assistant's response message (requesting the tool call)
                current_messages.append(response_message.model_dump(exclude_unset=True)) 

                for tool_call in tool_calls:
                    function_name = tool_call.function.name
                    try:
                        function_args = json.loads(tool_call.function.arguments)
                        logger.debug(f"Executing tool: {function_name} with args: {function_args}")
                        logger.info(f"Executing tool: {function_name}...")  # Add simpler INFO log
                        # *** Call the provided executor function ***
                        tool_start_time = time.time()  # Start timer for individual tool
                        if asyncio.iscoroutinefunction(tool_executor):
                            function_response_content = await tool_executor(function_name, function_args)
                        else:
                            function_response_content = tool_executor(function_name, function_args) 
                        tool_end_time = time.time()  # End timer for individual tool
                        tool_duration = tool_end_time - tool_start_time
                        logger.info(f"Tool {function_name} executed successfully in {tool_duration:.2f} seconds.")
                    except json.JSONDecodeError as e:
                         logger.error(f"Failed to parse arguments for tool {function_name}: {tool_call.function.arguments} - Error: {e}")
                         function_response_content = f"Error: Invalid arguments format received from LLM for tool {function_name}."
                    except Exception as e:
                        logger.error(f"Error executing tool {function_name}: {e}")
                        function_response_content = f"Error executing tool {function_name}: {str(e)}"

                    # Append the tool execution result
                    current_messages.append(
                        {
                            "tool_call_id": tool_call.id,
                            "role": "tool",
                            "name": function_name,
                            "content": str(function_response_content),  # Ensure content is string
                        }
                    )
                
                end_time_tool_execution = time.time()  # End timer for tool execution
                duration_tool_execution = end_time_tool_execution - start_time_tool_execution
                logger.info(f"Total tool execution completed in {duration_tool_execution:.2f} seconds.")

                logger.debug(f"Messages for second LLM call: {current_messages}")
                
                # Ensure messages for the second call are also correctly formatted dictionaries
                formatted_second_messages = []
                for m in current_messages:
                    if isinstance(m, dict) and m.get("role") and ("content" in m or "tool_calls" in m or m.get("role") == "tool"):
                        msg_to_add = {"role": m["role"]}
                        if "content" in m and m["content"] is not None:
                            msg_to_add["content"] = m["content"]
                        if m["role"] == "assistant" and "tool_calls" in m:
                             msg_to_add["tool_calls"] = m["tool_calls"]
                        if m["role"] == "tool":
                            msg_to_add["tool_call_id"] = m.get("tool_call_id")
                            # Ensure content is always present for tool role, even if empty
                            msg_to_add["content"] = m.get("content", "") 
                        
                        # Simplified appending logic
                        if msg_to_add.get("role") == "tool" and "tool_call_id" in msg_to_add:
                             formatted_second_messages.append(msg_to_add)
                        elif msg_to_add.get("role") == "assistant" and ("content" in msg_to_add or "tool_calls" in msg_to_add):
                             formatted_second_messages.append(msg_to_add)
                        elif msg_to_add.get("role") not in ["assistant", "tool"] and "content" in msg_to_add:
                             formatted_second_messages.append(msg_to_add)
                             
                    elif not isinstance(m, dict) and hasattr(m, 'role'): # Handle Pydantic models if they slip through
                        msg_to_add = {"role": m.role}
                        if hasattr(m, 'content') and m.content is not None:
                            msg_to_add["content"] = m.content
                        if hasattr(m, 'tool_calls') and m.tool_calls is not None:
                            # Ensure tool_calls are dictionaries
                            msg_to_add["tool_calls"] = [tc.model_dump(exclude_unset=True) for tc in m.tool_calls]
                        
                        # Simplified appending logic for Pydantic models
                        if msg_to_add.get("role") == "assistant" and ("content" in msg_to_add or "tool_calls" in msg_to_add):
                             formatted_second_messages.append(msg_to_add)
                        elif msg_to_add.get("role") != "assistant" and "content" in msg_to_add:
                             formatted_second_messages.append(msg_to_add)

                # --- Second API Call (with tool results) ---
                start_time_second_call = time.time()  # Start timer for second call
                logger.info("Making second call to DeepSeek API with tool results...")
                logger.debug(f"Messages being sent for second call: {formatted_second_messages}")
                second_response = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=formatted_second_messages, 
                    max_tokens=2048,
                    temperature=0.7,
                )
                end_time_second_call = time.time()  # End timer for second call
                duration_second_call = end_time_second_call - start_time_second_call
                logger.info(f"Second API call completed in {duration_second_call:.2f} seconds.")
                logger.debug(f"Second API response message: {second_response.choices[0].message}")
                final_response = second_response.choices[0].message.content

            else:
                final_response = response_message.content

            return final_response or "Sorry, I couldn't generate a response."

        except Exception as e:
            logger.exception(f"Error generating response: {str(e)}")
            return f"An error occurred while generating a response: {str(e)}"

llm_service = LLMService()