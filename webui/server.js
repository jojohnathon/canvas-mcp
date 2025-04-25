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
let webServerStarted = false;
let serverInstance = null;

// --- Buffering and Response Handling Logic ---
let responseBuffer = '';
let responseResolver = null; // Single global resolver for simplicity (original approach)
let responseRejector = null; // Single global rejector for timeout/errors
let responseTimeout = null; // To store the timeout handle

// Attach a persistent listener outside the route handlers
mcpServer.stdout.on('data', (data) => {
    const dataStr = data.toString();
    // Append data to buffer only if it seems like JSON, ignore simple logs
    if (dataStr.trim().startsWith('{') || responseBuffer) {
      responseBuffer += dataStr;
      console.log(`MCP stdout data chunk received, buffer length: ${responseBuffer.length}`);
    } else {
      console.log(`MCP stdout (likely log): ${dataStr.trim()}`);
      return; // Ignore non-JSON-like data unless already buffering
    }

    // Process buffer line by line (newline delimited JSON)
    let newlineIndex;
    while ((newlineIndex = responseBuffer.indexOf('\n')) !== -1) {
        const completeMessage = responseBuffer.substring(0, newlineIndex).trim();
        responseBuffer = responseBuffer.substring(newlineIndex + 1); // Keep the rest

        if (!completeMessage) continue; // Skip empty lines

        console.log(`Complete message received: ${completeMessage.substring(0,150)}...`);

        if (responseResolver) { // Check if we are waiting for a response
            try {
                const responseJson = JSON.parse(completeMessage);
                console.log(`Resolving pending request with received JSON.`);
                clearTimeout(responseTimeout); // Clear the timeout
                responseResolver(responseJson); // Resolve the promise
            } catch (err) {
                console.error('Error parsing MCP server response line:', err);
                console.error('Raw complete message line:', completeMessage);
                clearTimeout(responseTimeout); // Clear the timeout
                if(responseRejector) {
                    responseRejector(new Error('Error parsing MCP server response'));
                }
            } finally {
                 // Reset resolver/rejector for the next request
                 responseResolver = null;
                 responseRejector = null;
                 responseTimeout = null;
            }
        } else {
            console.warn("Received JSON response from MCP stdout, but no request was pending.");
        }
    }
     console.log(`Buffer remaining length after processing: ${responseBuffer.length}`);
});
// --- End Buffering Logic ---

// Function to start the web server
function startWebServer() {
  if (webServerStarted) return; // Only start once
  webServerStarted = true;

  serverInstance = app.listen(PORT, () => {
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

  // Handle server errors after start
  serverInstance.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Error: Port ${PORT} is already in use. Please choose a different port.`);
      shutdownGracefully();
    } else {
      console.error('Server error:', error);
      shutdownGracefully();
    }
  });
}

mcpServer.stdout.on('data', (data) => {
  const message = data.toString();
  // Log all stdout data, but only trigger readiness on specific messages
  console.log(`MCP server stdout: ${message.trim()}`);
  if (message.includes('Canvas MCP Server running on stdio') || message.includes('Canvas MCP Server successfully connected')) {
    if (!mcpServerReady) {
      mcpServerReady = true;
      console.log('MCP server is ready');
      startWebServer();
    }
  }
});

mcpServer.stderr.on('data', (data) => {
  const message = data.toString();
  console.error(`MCP server stderr: ${message.trim()}`); // Log all stderr
  if (message.includes('Canvas MCP Server running on stdio') || message.includes('Canvas MCP Server successfully connected')) {
    if (!mcpServerReady) {
      mcpServerReady = true;
      console.log('MCP server is ready (detected from stderr)');
      startWebServer();
    }
  }
});

mcpServer.on('close', (code) => {
  console.log(`MCP server process exited with code ${code}`);
});

// --- Modified API Endpoints (JSON-RPC with correct methods) ---
async function handleMcpRequest(req, res, mcpMethodName, params = {}) {
    if (!mcpServerReady) {
        return res.status(503).json({ error: 'MCP server not ready' });
    }
    if (responseResolver) { // Check if another request is already pending
        console.error("Attempted to send new MCP request while previous one is still pending.");
        return res.status(500).json({ error: 'Server busy, previous MCP request pending.' });
    }

    console.log(`Handling MCP request, Method: ${mcpMethodName}`);

    try {
        // Create a promise that will be resolved when the response arrives
        const responsePromise = new Promise((resolve, reject) => {
            responseResolver = resolve; // Store the global resolver
            responseRejector = reject; // Store the global rejector

            // Timeout for this specific request
            responseTimeout = setTimeout(() => {
                if (responseResolver) { // Check if it's still pending
                    console.error(`MCP response timeout for method: ${mcpMethodName}`);
                    responseResolver = null; // Clear resolver
                    responseRejector = null; // Clear rejector
                    reject(new Error(`MCP response timeout for ${mcpMethodName}`));
                }
            }, 15000); // 15 second timeout
        });

        // Send JSON-RPC request
        const requestPayload = JSON.stringify({
            jsonrpc: "2.0",
            id: Date.now(), // Unique ID for the request
            method: mcpMethodName, // Use the correct method name
            params: params
         });
        console.log(`Sending JSON-RPC to MCP stdin: ${requestPayload}`);
        if (!mcpServer.stdin.write(requestPayload + '\n')) {
             console.warn(`MCP stdin write buffer full for method: ${mcpMethodName}`);
        }

        // Wait for the response
        const response = await responsePromise;
        res.json(response); // Send the received JSON directly

    } catch (error) {
        console.error(`Error in MCP request handler for method ${mcpMethodName}:`, error);
        // Ensure resolver/rejector are cleared if timeout didn't already
        responseResolver = null;
        responseRejector = null;
        responseTimeout = null; // Should be cleared by timeout or success, but clear just in case
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

app.get('/api/tools', async (req, res) => {
    // Use correct SDK method name
    await handleMcpRequest(req, res, 'tools/list', {});
});

app.post('/api/execute', async (req, res) => {
    console.log(`>>> Received request on /api/execute with body:`, req.body); // <-- Add this line
    // Use correct SDK method name
    // MCP spec expects params: { name: string, arguments: object }
    const params = {
        name: req.body.tool,
        arguments: req.body.args || {}
    };
    await handleMcpRequest(req, res, 'tools/call', params);
});

app.get('/api/prompts', async (req, res) => {
    // Use correct SDK method name
    await handleMcpRequest(req, res, 'prompts/list', {});
});
// --- End Modified API Endpoints ---

// Handle shutdown gracefully
function shutdownGracefully() {
  console.log('Shutting down...');
  if (mcpServer) {
    console.log('Terminating MCP server...');
    mcpServer.kill();
  }
  if (serverInstance) { // Check if serverInstance exists
    serverInstance.close(() => {
      console.log('Web UI server stopped');
      process.exit(0);
    });
  } else {
    process.exit(0); // Exit if server never started
  }
}

// Handle termination signals
process.on('SIGINT', shutdownGracefully);
process.on('SIGTERM', shutdownGracefully);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdownGracefully();
});