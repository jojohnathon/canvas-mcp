const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Check if .env file exists
const envFilePath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envFilePath)) {
  console.log('Creating .env file...');
  
  // Create a sample .env file
  const envContent = `# Canvas API configuration
CANVAS_API_TOKEN=your_canvas_api_token_here
CANVAS_BASE_URL=https://yourinstitution.instructure.com
`;
  
  fs.writeFileSync(envFilePath, envContent);
  console.log('Created .env file. Please edit it with your Canvas API credentials.');
} else {
  console.log('.env file already exists.');
}

// Install dependencies
console.log('Installing dependencies...');
try {
  execSync('npm install', { stdio: 'inherit', cwd: __dirname });
  console.log('Dependencies installed successfully.');
} catch (error) {
  console.error('Failed to install dependencies:', error);
  process.exit(1);
}

console.log('\nSetup complete!');
console.log('\nTo start the Web UI server, run:');
console.log('  cd webui');
console.log('  node server.js');
console.log('\nThen open http://localhost:3000 in your browser.');
console.log('\nIMPORTANT: Make sure to edit the .env file with your Canvas API token before running the server!'); 