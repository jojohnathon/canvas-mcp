import os
import logging
from openai import OpenAI

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

    async def generate_response(self, messages):
        """
        Generate a response using the DeepSeek API.
        
        Args:
            messages: List of message objects with 'role' and 'content'
            
        Returns:
            Generated text response
        """
        try:
            if self.client:
                logger.info("Using DeepSeek API for generation")
                response = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=[{"role": m["role"], "content": m["content"]} for m in messages],
                    max_tokens=2048
                )
                return response.choices[0].message.content
            else:
                logger.error("DeepSeek API not configured")
                return "I'm sorry, but the AI service is not properly configured. Please check the DEEPSEEK_API_KEY environment variable."
                
        except Exception as e:
            logger.error(f"Error generating response: {str(e)}")
            return f"An error occurred while generating a response: {str(e)}"

llm_service = LLMService()