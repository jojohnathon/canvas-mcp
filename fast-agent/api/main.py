@app.get("/health")
async def health_check():
    """Health check endpoint to verify the API is running correctly."""
    response = {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": __version__,
    }
    
    # Check DeepSeek API configuration
    deepseek_api_key = os.environ.get("DEEPSEEK_API_KEY")
    if deepseek_api_key:
        response["deepseek_api"] = "configured"
    else:
        response["deepseek_api"] = "missing"
        
    return response

@app.get("/test_deepseek")
async def test_deepseek_connection():
    """Test connection to DeepSeek API to verify it's working properly."""
    try:
        deepseek_api_key = os.environ.get("DEEPSEEK_API_KEY")
        if not deepseek_api_key:
            return {"status": "error", "message": "DeepSeek API key not configured"}
        
        # Import required libraries
        from openai import OpenAI
        
        # Initialize client with DeepSeek API key
        client = OpenAI(
            api_key=deepseek_api_key,
            base_url="https://api.deepseek.com/v1"
        )
        
        # Try a simple API call
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": "Say hello to test the API connection"}],
            max_tokens=10
        )
        
        return {
            "status": "success", 
            "message": "DeepSeek API connection successful",
            "response": response.choices[0].message.content
        }
    except Exception as e:
        return {"status": "error", "message": f"DeepSeek API connection failed: {str(e)}"}

@app.post("/chat")
async def chat(request: dict):
    """
    Process a chat message and return a response.
    
    Request body:
    - message: The user's message
    - history: List of previous chat messages (optional)
    """
    message = request.get("message", "")
    history = request.get("history", [])
    
    # Check message is not empty
    if not message:
        return {"error": "Message cannot be empty"}
    
    # Format history and add current message
    chat_history = []
    for msg in history:
        chat_history.append({
            "role": msg["role"],
            "content": msg["content"]
        })
    
    # Add current user message
    chat_history.append({"role": "user", "content": message})
    
    # Process message with LLM
    logger.info("Processing message with DeepSeek LLM")
    response = await llm_service.generate_response(chat_history)
    
    return {"response": response}