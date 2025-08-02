const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const logger = require('./logger');

// Load environment variables from .env file
const envPath = path.join(__dirname, '..', '.env');
logger.info('Loading environment variables from .env file...');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  logger.info('Loading environment variables from:', envPath);
} else {
  logger.warn('Warning: .env file not found at', envPath);
}

// Check required environment variables
logger.info('CANVAS_API_TOKEN exists:', !!process.env.CANVAS_API_TOKEN);
logger.info('CANVAS_BASE_URL:', process.env.CANVAS_BASE_URL);

// Create a copy of the environment for the child process
const childEnv = Object.assign({}, process.env);

// Log environment variables being passed (mask token)
const loggedEnv = { 
  CANVAS_API_TOKEN: childEnv.CANVAS_API_TOKEN ? '********' : undefined, 
  CANVAS_BASE_URL: childEnv.CANVAS_BASE_URL 
};
logger.info('Environment variables for MCP server:', loggedEnv);

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
logger.info('Starting MCP server...');
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
      logger.info(`MCP stdout data chunk received, buffer length: ${responseBuffer.length}`);
    } else {
      logger.info(`MCP stdout (likely log): ${dataStr.trim()}`);
      return; // Ignore non-JSON-like data unless already buffering
    }

    // Process buffer line by line (newline delimited JSON)
    let newlineIndex;
    while ((newlineIndex = responseBuffer.indexOf('\n')) !== -1) {
        const completeMessage = responseBuffer.substring(0, newlineIndex).trim();
        responseBuffer = responseBuffer.substring(newlineIndex + 1); // Keep the rest

        if (!completeMessage) continue; // Skip empty lines

        logger.info(`Complete message received: ${completeMessage.substring(0,150)}...`);

        if (responseResolver) { // Check if we are waiting for a response
            try {
                const responseJson = JSON.parse(completeMessage);
                logger.info(`Parsed MCP Response JSON:`, JSON.stringify(responseJson, null, 2)); // Log parsed response
                logger.info(`Resolving pending request with received JSON.`);
                clearTimeout(responseTimeout); // Clear the timeout
                responseResolver(responseJson); // Resolve the promise
            } catch (err) {
                logger.error('Error parsing MCP server response line:', err);
                logger.error('Raw complete message line:', completeMessage);
                clearTimeout(responseTimeout); // Clear the timeout
                if(responseRejector) {
                    // Pass specific error back
                    responseRejector(new Error(`Error parsing MCP server response: ${err.message}`));
                }
            } finally {
                 // Reset resolver/rejector for the next request
                 responseResolver = null;
                 responseRejector = null;
                 responseTimeout = null;
            }
        } else {
            logger.warn("Received JSON response from MCP stdout, but no request was pending.");
        }
    }
     logger.info(`Buffer remaining length after processing: ${responseBuffer.length}`);
});
// --- End Buffering Logic ---

// Function to start the web server
function startWebServer() {
  if (webServerStarted) return; // Only start once
  webServerStarted = true;

  serverInstance = app.listen(PORT, () => {
      logger.info(`Web UI server running at http://localhost:${PORT}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use. Try a different port using PORT environment variable.`);
        logger.info('Example: PORT=3002 node server.js');
      } else {
        logger.error('Error starting server:', err);
    }
    process.exit(1);
  });

  // Handle server errors after start
  serverInstance.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Error: Port ${PORT} is already in use. Please choose a different port.`);
        shutdownGracefully();
      } else {
        logger.error('Server error:', error);
        shutdownGracefully();
      }
  });
}

mcpServer.stdout.on('data', (data) => {
  const message = data.toString();
  // Log all stdout data, but only trigger readiness on specific messages
  logger.info(`MCP server stdout: ${message.trim()}`);
  if (message.includes('Canvas MCP Server running on stdio') || message.includes('Canvas MCP Server successfully connected')) {
    if (!mcpServerReady) {
      mcpServerReady = true;
      logger.info('MCP server is ready');
      startWebServer();
    }
  }
});

mcpServer.stderr.on('data', (data) => {
  const message = data.toString();
  logger.error(`MCP server stderr: ${message.trim()}`); // Log all stderr
  if (message.includes('Canvas MCP Server running on stdio') || message.includes('Canvas MCP Server successfully connected')) {
    if (!mcpServerReady) {
      mcpServerReady = true;
      logger.info('MCP server is ready (detected from stderr)');
      startWebServer();
    }
  }
});

mcpServer.on('close', (code) => {
  logger.info(`MCP server process exited with code ${code}`);
});

// --- Modified API Endpoints (JSON-RPC with correct methods) ---
async function handleMcpRequest(req, res, mcpMethodName, params = {}) {
    if (!mcpServerReady) {
        return res.status(503).json({ error: 'MCP server not ready' });
    }
    if (responseResolver) { // Check if another request is already pending
        logger.error("Attempted to send new MCP request while previous one is still pending.");
        return res.status(500).json({ error: 'Server busy, previous MCP request pending.' });
    }

    logger.info(`Handling MCP request, Method: ${mcpMethodName}, Params:`, JSON.stringify(params, null, 2)); // Log params

    try {
        // Create a promise that will be resolved when the response arrives
        const responsePromise = new Promise((resolve, reject) => {
            responseResolver = resolve; // Store the global resolver
            responseRejector = reject; // Store the global rejector

            // Timeout for this specific request
            responseTimeout = setTimeout(() => {
                if (responseResolver) { // Check if it's still pending
                    const timeoutError = new Error(`MCP response timeout after 15s for method: ${mcpMethodName}`);
                    logger.error(timeoutError.message); // Log timeout error
                    responseResolver = null; // Clear resolver
                    responseRejector = null; // Clear rejector
                    reject(timeoutError); // Reject with specific timeout error
                }
            }, 15000); // 15 second timeout
        }); // End of Promise constructor

        // Send JSON-RPC request
        const requestPayload = JSON.stringify({
            jsonrpc: "2.0",
            id: Date.now(), // Unique ID for the request
            method: mcpMethodName, // Use the correct method name
            params: params
         });
        logger.info(`Sending JSON-RPC to MCP stdin: ${requestPayload}`);
        if (!mcpServer.stdin.write(requestPayload + '\n')) {
             logger.warn(`MCP stdin write buffer full for method: ${mcpMethodName}`);
        }

        // Wait for the response *inside* the try block
        const response = await responsePromise;
        res.json(response); // Send the received JSON directly

    } catch (error) { // Catch block starts here
        // Log the specific error that occurred during handling
        logger.error(`Error handling MCP request for method ${mcpMethodName}:`, error);
        // Avoid sending headers twice if already sent
        if (!res.headersSent) {
            res.status(500).json({ error: error.message || 'Internal server error' });
        } else {
             logger.error("Headers already sent, cannot send error response to client.");
        }
    } finally {
        // Ensure resolver/rejector are always cleared after the request attempt
        responseResolver = null;
        responseRejector = null;
        // Timeout is cleared in success/error/timeout paths, no need to clear here unless adding redundant safety
    }
}

app.get('/api/tools', async (req, res) => {
    // Use correct SDK method name
    await handleMcpRequest(req, res, 'tools/list', {});
});

app.post('/api/execute', async (req, res) => {
    // Log the raw request body as well for comparison
    logger.info(`>>> Raw request body for /api/execute:`, req.body);
    // Use correct SDK method name
    // MCP spec expects params: { name: string, arguments: object }
    const params = {
        name: req.body.tool,
        arguments: req.body.args || {}
    };
    // Removed duplicate log from previous step
    await handleMcpRequest(req, res, 'tools/call', params);
});

app.get('/api/prompts', async (req, res) => {
    // Use correct SDK method name
    await handleMcpRequest(req, res, 'prompts/list', {});
});
// --- End Modified API Endpoints ---

// Handle shutdown gracefully
function shutdownGracefully() {
  logger.info('Shutting down...');
  if (mcpServer) {
    logger.info('Terminating MCP server...');
    mcpServer.kill();
  }
  if (serverInstance) { // Check if serverInstance exists
    serverInstance.close(() => {
      logger.info('Web UI server stopped');
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
  logger.error('Uncaught exception:', error);
  shutdownGracefully();
});