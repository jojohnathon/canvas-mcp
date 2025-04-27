import os
import logging
import json
import time  # Import the time module
from openai import OpenAI, Stream  # Import Stream for type hinting
from openai.types.chat import ChatCompletionChunk  # Import ChatCompletionChunk for type hinting
from typing import List, Callable, Optional, Dict, Any, AsyncGenerator, Union  # Import AsyncGenerator and Union
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

    async def generate_response(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_executor: Optional[Callable[[str, Dict[str, Any]], Any]] = None,
        stream: bool = False  # Add stream parameter
    ) -> Union[str, AsyncGenerator[str, None]]:  # Update return type hint
        """
        Generate a response using the DeepSeek API, handling tool calls and optional streaming.

        Args:
            messages: List of message objects (dictionaries) with 'role' and 'content'.
            tools: List of tools formatted for the OpenAI API (optional).
            tool_executor: An async function to call when a tool needs execution.
                           It should accept (tool_name: str, tool_args: dict) and return the result content (str). (optional).
            stream: If True, yield response chunks as an async generator. Otherwise, return the full response string.

        Returns:
            If stream=False: The generated text response (str).
            If stream=True: An async generator yielding response chunks (str).
        """
        if not self.client:
            error_message = "I'm sorry, but the AI service is not properly configured. Please check the DEEPSEEK_API_KEY environment variable."
            logger.error("DeepSeek API not configured")
            if stream:
                async def error_generator():
                    yield error_message
                return error_generator()
            else:
                return error_message

        if stream:
            return self._generate_stream_response(messages, tools, tool_executor)
        else:
            return await self._generate_non_stream_response(messages, tools, tool_executor)

    async def _generate_non_stream_response(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_executor: Optional[Callable[[str, Dict[str, Any]], Any]] = None
    ) -> str:
        """Handles non-streaming response generation."""
        if not self.client:
            return "AI service client not initialized."
        try:
            logger.debug(f"Initial messages for LLM (non-streaming): {messages}")
            current_messages = messages[:]  # Work with a copy

            # --- First API Call (Non-Streaming) ---
            start_time_first_call = time.time()
            logger.info("Making first call to DeepSeek API (non-streaming)...")
            formatted_messages = [{"role": m["role"], "content": m["content"]} for m in current_messages if isinstance(m, dict) and "role" in m and "content" in m]
            formatted_tools = tools if tools and all(isinstance(t, dict) for t in tools) else None

            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=formatted_messages,
                tools=formatted_tools,
                tool_choice="auto" if formatted_tools else None,
                max_tokens=2048,
                temperature=0.7,
                stream=False
            )
            end_time_first_call = time.time()
            duration_first_call = end_time_first_call - start_time_first_call
            logger.info(f"First API call (non-streaming) completed in {duration_first_call:.2f} seconds.")
            
            response_message = response.choices[0].message
            logger.debug(f"First API response message (non-streaming): {response_message}")

            tool_calls = response_message.tool_calls

            # --- Handle Tool Calls (if any) ---
            if tool_calls and tool_executor:
                start_time_tool_execution = time.time()
                logger.info(f"LLM requested {len(tool_calls)} tool calls. Executing (non-streaming flow)...")
                current_messages.append(response_message.model_dump(exclude_unset=True))

                tasks = []
                tool_call_details = []

                for tool_call in tool_calls:
                    function_name = tool_call.function.name
                    try:
                        function_args = json.loads(tool_call.function.arguments)
                        logger.debug(f"Preparing tool: {function_name} with args: {function_args}")

                        if asyncio.iscoroutinefunction(tool_executor):
                            coro = tool_executor(function_name, function_args)
                        else:
                            loop = asyncio.get_running_loop()
                            coro = loop.run_in_executor(None, tool_executor, function_name, function_args)

                        tasks.append(coro)
                        tool_call_details.append({"id": tool_call.id, "name": function_name})

                    except json.JSONDecodeError as e:
                        logger.error(f"Failed to parse arguments for tool {function_name}: {tool_call.function.arguments} - Error: {e}")
                        current_messages.append({
                            "tool_call_id": tool_call.id, "role": "tool", "name": function_name,
                            "content": f"Error: Invalid arguments format received from LLM for tool {function_name}.",
                        })
                    except Exception as e:
                        logger.error(f"Error preparing tool {function_name}: {e}")
                        current_messages.append({
                            "tool_call_id": tool_call.id, "role": "tool", "name": function_name,
                            "content": f"Error preparing tool {function_name}: {str(e)}",
                        })

                if tasks:
                    logger.info(f"Running {len(tasks)} tool tasks concurrently (non-streaming flow)...")
                    results = await asyncio.gather(*tasks, return_exceptions=True)
                    logger.info("Parallel tool execution finished (non-streaming flow).")

                    for i, result in enumerate(results):
                        tool_detail = tool_call_details[i]
                        tool_call_id = tool_detail["id"]
                        function_name = tool_detail["name"]

                        if isinstance(result, Exception):
                            logger.error(f"Error executing tool {function_name} during parallel execution: {result}")
                            function_response_content = f"Error executing tool {function_name}: {str(result)}"
                        else:
                            logger.info(f"Tool {function_name} executed successfully (in parallel).")
                            function_response_content = str(result)

                        current_messages.append({
                            "tool_call_id": tool_call_id, "role": "tool", "name": function_name,
                            "content": function_response_content,
                        })

                end_time_tool_execution = time.time()
                duration_tool_execution = end_time_tool_execution - start_time_tool_execution
                logger.info(f"Total tool processing (non-streaming flow) completed in {duration_tool_execution:.2f} seconds.")

                logger.debug(f"Messages for second LLM call (non-streaming): {current_messages}")
                
                formatted_second_messages = self._format_messages_for_api(current_messages)

                # --- Second API Call (Non-Streaming) ---
                start_time_second_call = time.time()
                logger.info("Making second call to DeepSeek API with tool results (non-streaming)...")
                logger.debug(f"Messages being sent for second call (non-streaming): {formatted_second_messages}")
                second_response = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=formatted_second_messages,
                    max_tokens=2048,
                    temperature=0.7,
                    stream=False
                )
                end_time_second_call = time.time()
                duration_second_call = end_time_second_call - start_time_second_call
                logger.info(f"Second API call (non-streaming) completed in {duration_second_call:.2f} seconds.")
                logger.debug(f"Second API response message (non-streaming): {second_response.choices[0].message}")
                final_response = second_response.choices[0].message.content

            else:
                final_response = response_message.content

            return final_response or "Sorry, I couldn't generate a response."

        except Exception as e:
            logger.exception(f"Error generating non-streaming response: {str(e)}")
            return f"An error occurred while generating a response: {str(e)}"

    async def _generate_stream_response(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_executor: Optional[Callable[[str, Dict[str, Any]], Any]] = None
    ) -> AsyncGenerator[str, None]:
        """Internal implementation for streaming response generation."""
        if not self.client:
            logger.error("Streaming failed: AI service client not initialized.")
            yield "Error: AI service client not initialized."
            return

        try:
            logger.debug(f"Initial messages for LLM (streaming): {messages}")
            current_messages = messages[:]  # Work with a copy

            # --- First API Call (MUST be Non-Streaming to check for tools) ---
            start_time_first_call = time.time()
            logger.info("Making first call to DeepSeek API (non-streaming check for tools)...")
            formatted_messages = [{"role": m["role"], "content": m["content"]} for m in current_messages if isinstance(m, dict) and "role" in m and "content" in m]
            formatted_tools = tools if tools and all(isinstance(t, dict) for t in tools) else None

            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=formatted_messages,
                tools=formatted_tools,
                tool_choice="auto" if formatted_tools else None,
                max_tokens=2048,
                temperature=0.7,
                stream=False
            )
            end_time_first_call = time.time()
            duration_first_call = end_time_first_call - start_time_first_call
            logger.info(f"First API call (tool check) completed in {duration_first_call:.2f} seconds.")
            
            response_message = response.choices[0].message
            logger.debug(f"First API response message (tool check): {response_message}")

            tool_calls = response_message.tool_calls

            # --- Handle Tool Calls (if any) ---
            if tool_calls and tool_executor:
                start_time_tool_execution = time.time()
                logger.info(f"Tool calls detected ({len(tool_calls)}). Executing tools before streaming final response.")
                current_messages.append(response_message.model_dump(exclude_unset=True))

                tasks = []
                tool_call_details = []
                for tool_call in tool_calls:
                    function_name = tool_call.function.name
                    try:
                        function_args = json.loads(tool_call.function.arguments)
                        logger.debug(f"Preparing tool: {function_name} with args: {function_args}")
                        if asyncio.iscoroutinefunction(tool_executor):
                            coro = tool_executor(function_name, function_args)
                        else:
                            loop = asyncio.get_running_loop()
                            coro = loop.run_in_executor(None, tool_executor, function_name, function_args)
                        tasks.append(coro)
                        tool_call_details.append({"id": tool_call.id, "name": function_name})
                    except json.JSONDecodeError as e:
                        logger.error(f"Failed to parse arguments for tool {function_name}: {tool_call.function.arguments} - Error: {e}")
                        current_messages.append({
                            "tool_call_id": tool_call.id, "role": "tool", "name": function_name,
                            "content": f"Error: Invalid arguments format received from LLM for tool {function_name}.",
                        })
                    except Exception as e:
                        logger.error(f"Error preparing tool {function_name}: {e}")
                        current_messages.append({
                            "tool_call_id": tool_call.id, "role": "tool", "name": function_name,
                            "content": f"Error preparing tool {function_name}: {str(e)}",
                        })

                if tasks:
                    logger.info(f"Running {len(tasks)} tool tasks concurrently (streaming flow)...")
                    results = await asyncio.gather(*tasks, return_exceptions=True)
                    logger.info("Parallel tool execution finished (streaming flow).")

                    for i, result in enumerate(results):
                        tool_detail = tool_call_details[i]
                        tool_call_id = tool_detail["id"]
                        function_name = tool_detail["name"]
                        if isinstance(result, Exception):
                            logger.error(f"Error executing tool {function_name} during parallel execution: {result}")
                            function_response_content = f"Error executing tool {function_name}: {str(result)}"
                        else:
                            logger.info(f"Tool {function_name} executed successfully (in parallel).")
                            function_response_content = str(result)
                        current_messages.append({
                            "tool_call_id": tool_call_id, "role": "tool", "name": function_name,
                            "content": function_response_content,
                        })

                end_time_tool_execution = time.time()
                duration_tool_execution = end_time_tool_execution - start_time_tool_execution
                logger.info(f"Total tool processing (streaming flow) completed in {duration_tool_execution:.2f} seconds.")

                logger.debug(f"Messages for second LLM call (streaming): {current_messages}")
                
                formatted_second_messages = self._format_messages_for_api(current_messages)

                # --- Second API Call (Streaming) ---
                start_time_second_call = time.time()
                logger.info("Making second call to DeepSeek API with tool results (streaming)...")
                logger.debug(f"Messages being sent for second call (streaming): {formatted_second_messages}")
                stream_response: Stream[ChatCompletionChunk] = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=formatted_second_messages,
                    max_tokens=2048,
                    temperature=0.7,
                    stream=True
                )
                end_time_second_call_setup = time.time()
                logger.info(f"Second API call stream initiated in {end_time_second_call_setup - start_time_second_call:.2f} seconds.")

                async for chunk in stream_response:
                    if chunk.choices and chunk.choices[0].delta:
                        delta_content = chunk.choices[0].delta.content
                        if delta_content:
                            yield delta_content
                logger.info("Finished streaming response after tool execution.")

            else:
                logger.info("No tool calls detected. Yielding content from first response.")
                final_content = response_message.content
                if final_content:
                    yield final_content
                else:
                    logger.warning("First response had no tool calls and no content.")
                    yield ""

        except Exception as e:
            logger.exception(f"Error generating streaming response: {str(e)}")
            yield f"\nAn error occurred during streaming: {str(e)}"
            return

    def _format_messages_for_api(self, messages: List[Any]) -> List[Dict[str, Any]]:
        """Helper function to format messages list for the OpenAI API, handling dicts and pydantic models."""
        formatted_api_messages = []
        for m in messages:
            if isinstance(m, dict):
                if m.get("role") and ("content" in m or "tool_calls" in m or m.get("role") == "tool"):
                    msg_to_add = {"role": m["role"]}
                    if "content" in m and m["content"] is not None:
                        msg_to_add["content"] = m["content"]
                    if m["role"] == "assistant" and "tool_calls" in m:
                        msg_to_add["tool_calls"] = m["tool_calls"]
                    if m["role"] == "tool":
                        msg_to_add["tool_call_id"] = m.get("tool_call_id")
                        msg_to_add["content"] = m.get("content", "")

                    if msg_to_add.get("role") == "tool" and "tool_call_id" in msg_to_add:
                        formatted_api_messages.append(msg_to_add)
                    elif msg_to_add.get("role") == "assistant" and ("content" in msg_to_add or "tool_calls" in msg_to_add):
                        formatted_api_messages.append(msg_to_add)
                    elif msg_to_add.get("role") not in ["assistant", "tool"] and "content" in msg_to_add:
                        formatted_api_messages.append(msg_to_add)
                    else:
                        logger.warning(f"Skipping message due to unexpected format or missing content/tool_calls: {m}")

                else:
                    logger.warning(f"Skipping message due to missing role or content/tool_calls: {m}")

            elif hasattr(m, 'model_dump'):
                try:
                    dumped_message = m.model_dump(exclude_unset=True, exclude_none=True)
                    if dumped_message.get("role"):
                        if "content" in dumped_message or dumped_message.get("role") == "assistant":
                            formatted_api_messages.append(dumped_message)
                        else:
                            logger.warning(f"Skipping dumped Pydantic message due to missing content (and not assistant role): {dumped_message}")
                    else:
                        logger.warning(f"Skipping dumped Pydantic message due to missing role: {dumped_message}")
                except Exception as e:
                    logger.error(f"Failed to dump Pydantic message: {m}, Error: {e}")

            else:
                logger.warning(f"Skipping message of unknown type: {type(m)}")

        return formatted_api_messages


llm_service = LLMService()