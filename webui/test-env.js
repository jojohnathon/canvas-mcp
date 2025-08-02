const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const logger = require('./logger');

// Load environment variables from .env file
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  logger.info('Loading environment variables from .env file...');
  dotenv.config({ path: envPath });
  
  // Read and parse .env file directly
  try {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    logger.info('Directly from .env:');
    logger.info('- CANVAS_API_TOKEN exists:', !!envConfig.CANVAS_API_TOKEN);
    if (envConfig.CANVAS_API_TOKEN) {
      // Show length and first few characters to help debugging without revealing the full token
      logger.info('  - Length:', envConfig.CANVAS_API_TOKEN.length);
      logger.info('  - First 4 chars:', envConfig.CANVAS_API_TOKEN.substring(0, 4) + '...');
    }
    logger.info('- CANVAS_BASE_URL:', envConfig.CANVAS_BASE_URL);
  } catch (err) {
    logger.error('Error parsing .env file:', err);
  }
}

// Check process.env after dotenv loading
logger.info('\nProcess environment after dotenv:');
logger.info('- CANVAS_API_TOKEN exists:', !!process.env.CANVAS_API_TOKEN);
if (process.env.CANVAS_API_TOKEN) {
  logger.info('  - Length:', process.env.CANVAS_API_TOKEN.length);
  logger.info('  - First 4 chars:', process.env.CANVAS_API_TOKEN.substring(0, 4) + '...');
}
logger.info('- CANVAS_BASE_URL:', process.env.CANVAS_BASE_URL);

// Create a safe environment copy for the child process
const childEnv = Object.assign({}, process.env);

// Test child process environment passing
logger.info('\nTesting child process environment passing...');

// Use a more explicit approach with a temp script file
const tempScriptPath = path.join(__dirname, 'temp-script.js');
fs.writeFileSync(tempScriptPath, `
const logger = require('./logger');
logger.info("Child process environment check:");
logger.info("- CANVAS_API_TOKEN exists:", !!process.env.CANVAS_API_TOKEN);
if (process.env.CANVAS_API_TOKEN) {
  logger.info("  - Length:", process.env.CANVAS_API_TOKEN.length);
  logger.info("  - First 4 chars:", process.env.CANVAS_API_TOKEN.substring(0, 4) + "...");
}
logger.info("- CANVAS_BASE_URL:", process.env.CANVAS_BASE_URL);
`);

const childProcess = spawn('node', [tempScriptPath], {
  env: childEnv,
  stdio: 'inherit'
});

childProcess.on('close', (code) => {
  logger.info(`Child process exited with code ${code}`);
  
  // Clean up temp script
  fs.unlinkSync(tempScriptPath);
}); 