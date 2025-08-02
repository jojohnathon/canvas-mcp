const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Check if .env file exists
const envFilePath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envFilePath)) {
  logger.info('Creating .env file...');
  
  // Create a sample .env file
  const envContent = `# Canvas API configuration
CANVAS_API_TOKEN=your_canvas_api_token_here
CANVAS_BASE_URL=https://yourinstitution.instructure.com
`;
  
  fs.writeFileSync(envFilePath, envContent);
  logger.info('Created .env file. Please edit it with your Canvas API credentials.');
} else {
  logger.info('.env file already exists.');
}

// Install dependencies
logger.info('Installing dependencies...');
try {
  execSync('npm install', { stdio: 'inherit', cwd: __dirname });
  logger.info('Dependencies installed successfully.');
} catch (error) {
  logger.error('Failed to install dependencies:', error);
  process.exit(1);
}

logger.info('\nSetup complete!');
logger.info('\nTo start the Web UI server, run:');
logger.info('  cd webui');
logger.info('  node server.js');
logger.info('\nThen open http://localhost:3000 in your browser.');
logger.info('\nIMPORTANT: Make sure to edit the .env file with your Canvas API token before running the server!');