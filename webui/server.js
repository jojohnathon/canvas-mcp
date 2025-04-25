const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables from .env file
const envPath = path.join(__dirname, '..', '.env');
console.log('Loading environment variables from .env file...');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('Loading environment variables from:', envPath);
} else {
  console.warn('Warning: .env file not found at', envPath);
}

// Check required environment variables
console.log('CANVAS_API_TOKEN exists:', !!process.env.CANVAS_API_TOKEN);
console.log('CANVAS_BASE_URL:', process.env.CANVAS_BASE_URL);

// Create a copy of the environment for the child process
const childEnv = Object.assign({}, process.env);

// Set port for the web server
const PORT = process.env.PORT || 3001;

const app = express();

// Enable CORS
app.use(cors());

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Start MCP server process
console.log('Starting MCP server...');
const mcpServerPath = path.join(__dirname, '..', 'build', 'index.js');
const mcpServer = spawn('node', [mcpServerPath], {
  env: childEnv,
  stdio: ['pipe', 'pipe', 'pipe']
});

let mcpServerReady = false;

mcpServer.stdout.on('data', (data) => {
  const message = data.toString();
  console.log(`MCP server: ${message}`);
  if (message.includes('Canvas MCP Server running on stdio')) {
    mcpServerReady = true;
    console.log('MCP server is ready');
  }
});

mcpServer.stderr.on('data', (data) => {
  const message = data.toString();
  console.error(`MCP server error: ${message}`);
  if (message.includes('Canvas MCP Server running on stdio')) {
    mcpServerReady = true;
    console.log('MCP server is ready from stderr');
  }
});

mcpServer.on('close', (code) => {
  console.log(`MCP server process exited with code ${code}`);
});

// API endpoints
app.get('/api/tools', (req, res) => {
  if (!mcpServerReady) {
    return res.status(503).json({ error: 'MCP server not ready' });
  }
  
  // Send a request to the MCP server to get the list of tools
  mcpServer.stdin.write(JSON.stringify({ type: 'list_tools' }) + '\n');
  
  // Set up a one-time listener for the response
  const listener = (data) => {
    try {
      const response = JSON.parse(data.toString());
      mcpServer.stdout.removeListener('data', listener);
      res.json(response);
    } catch (err) {
      console.error('Error parsing MCP server response:', err);
      mcpServer.stdout.removeListener('data', listener);
      res.status(500).json({ error: 'Error parsing MCP server response' });
    }
  };
  
  mcpServer.stdout.on('data', listener);
});

app.post('/api/execute', (req, res) => {
  if (!mcpServerReady) {
    return res.status(503).json({ error: 'MCP server not ready' });
  }
  
  const { tool, args } = req.body;
  
  // Send a request to the MCP server to execute the tool
  mcpServer.stdin.write(JSON.stringify({ type: 'execute_tool', tool, args }) + '\n');
  
  // Set up a one-time listener for the response
  const listener = (data) => {
    try {
      const response = JSON.parse(data.toString());
      mcpServer.stdout.removeListener('data', listener);
      res.json(response);
    } catch (err) {
      console.error('Error parsing MCP server response:', err);
      mcpServer.stdout.removeListener('data', listener);
      res.status(500).json({ error: 'Error parsing MCP server response' });
    }
  };
  
  mcpServer.stdout.on('data', listener);
});

app.get('/api/prompts', (req, res) => {
  if (!mcpServerReady) {
    return res.status(503).json({ error: 'MCP server not ready' });
  }
  
  // Send a request to the MCP server to get the list of prompts
  mcpServer.stdin.write(JSON.stringify({ type: 'list_prompts' }) + '\n');
  
  // Set up a one-time listener for the response
  const listener = (data) => {
    try {
      const response = JSON.parse(data.toString());
      mcpServer.stdout.removeListener('data', listener);
      res.json(response);
    } catch (err) {
      console.error('Error parsing MCP server response:', err);
      mcpServer.stdout.removeListener('data', listener);
      res.status(500).json({ error: 'Error parsing MCP server response' });
    }
  };
  
  mcpServer.stdout.on('data', listener);
});

// Start the server with better error handling
const server = app.listen(PORT, () => {
  console.log(`Web UI server running at http://localhost:${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try a different port using PORT environment variable.`);
    console.log('Example: PORT=3002 node server.js');
  } else {
    console.error('Error starting server:', err);
  }
  process.exit(1);
});

// Handle shutdown gracefully
function shutdownGracefully() {
  console.log('Shutting down...');
  if (mcpServer) {
    console.log('Terminating MCP server...');
    mcpServer.kill();
  }
  server.close(() => {
    console.log('Web UI server stopped');
    process.exit(0);
  });
}

// Handle termination signals
process.on('SIGINT', shutdownGracefully);
process.on('SIGTERM', shutdownGracefully);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdownGracefully();
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Error: Port ${PORT} is already in use. Please choose a different port.`);
    shutdownGracefully();
  } else {
    console.error('Server error:', error);
    shutdownGracefully();
  }
}); 