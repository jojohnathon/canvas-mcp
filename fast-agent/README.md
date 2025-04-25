# Canvas Student Assistant

A frontend and backend application for interacting with the Canvas MCP (Multi-Channel Processing) server.

## Components

- **FastAPI Backend**: Provides API endpoints to communicate with the Canvas MCP server
- **Streamlit Frontend**: Provides a user-friendly interface for students to interact with Canvas data
- **Gemini AI Integration**: Adds conversational AI capabilities using Google's Gemini model

## Setup

1. Clone the repository
2. Install the required dependencies:
   ```
   pip install -r requirements.txt
   ```
3. Create a `.env` file in the project root with the following variables:
   ```
   MCP_SERVER_URL=http://localhost:3000
   FASTAPI_URL=http://localhost:8000
   GOOGLE_API_KEY=your_google_api_key_here
   CANVAS_API_TOKEN=your_canvas_api_token_here
   CANVAS_BASE_URL=https://your-institution.instructure.com
   ```

## Google Gemini API Key

This application uses Google's Gemini model for AI capabilities. To obtain a Google API key:

1. Visit the Google AI Studio (https://makersuite.google.com/)
2. Create an API key for Gemini
3. Add the key to your `.env` file as `GOOGLE_API_KEY`

## Running the Application

### Option 1: Using the convenience script (recommended)

Run both the FastAPI backend and Streamlit frontend with a single command:
```
python run.py
```

Command-line options:
- `--api-port PORT`: Set the FastAPI server port (default: 8000)
- `--streamlit-port PORT`: Set the Streamlit server port (default: 8501)
- `--api-only`: Run only the FastAPI backend
- `--streamlit-only`: Run only the Streamlit frontend

### Option 2: Running services individually

1. Start the FastAPI backend:
   ```
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

2. Start the Streamlit frontend:
   ```
   streamlit run app/streamlit_app.py
   ```

## Features

- **Chat Interface**: Ask questions about your Canvas courses in natural language
- **Tools Interface**: Execute specific Canvas tools to retrieve information
- **Prompts Interface**: Run pre-defined prompts for common Canvas tasks

## API Endpoints

- `/health`: Check the health of the API and MCP server connection
- `/tools`: Get available Canvas tools
- `/prompts`: Get available Canvas prompts
- `/execute`: Execute a specific Canvas tool
- `/prompt`: Run a specific Canvas prompt
- `/chat`: Chat with the Canvas assistant (Powered by Google Gemini) 