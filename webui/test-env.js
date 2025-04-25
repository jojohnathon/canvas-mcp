const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Load environment variables from .env file
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  console.log('Loading environment variables from .env file...');
  dotenv.config({ path: envPath });
  
  // Read and parse .env file directly
  try {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    console.log('Directly from .env:');
    console.log('- CANVAS_API_TOKEN exists:', !!envConfig.CANVAS_API_TOKEN);
    if (envConfig.CANVAS_API_TOKEN) {
      // Show length and first few characters to help debugging without revealing the full token
      console.log('  - Length:', envConfig.CANVAS_API_TOKEN.length);
      console.log('  - First 4 chars:', envConfig.CANVAS_API_TOKEN.substring(0, 4) + '...');
    }
    console.log('- CANVAS_BASE_URL:', envConfig.CANVAS_BASE_URL);
  } catch (err) {
    console.error('Error parsing .env file:', err);
  }
}

// Check process.env after dotenv loading
console.log('\nProcess environment after dotenv:');
console.log('- CANVAS_API_TOKEN exists:', !!process.env.CANVAS_API_TOKEN);
if (process.env.CANVAS_API_TOKEN) {
  console.log('  - Length:', process.env.CANVAS_API_TOKEN.length);
  console.log('  - First 4 chars:', process.env.CANVAS_API_TOKEN.substring(0, 4) + '...');
}
console.log('- CANVAS_BASE_URL:', process.env.CANVAS_BASE_URL);

// Create a safe environment copy for the child process
const childEnv = Object.assign({}, process.env);

// Test child process environment passing
console.log('\nTesting child process environment passing...');

// Use a more explicit approach with a temp script file
const tempScriptPath = path.join(__dirname, 'temp-script.js');
fs.writeFileSync(tempScriptPath, `
console.log("Child process environment check:");
console.log("- CANVAS_API_TOKEN exists:", !!process.env.CANVAS_API_TOKEN);
if (process.env.CANVAS_API_TOKEN) {
  console.log("  - Length:", process.env.CANVAS_API_TOKEN.length);
  console.log("  - First 4 chars:", process.env.CANVAS_API_TOKEN.substring(0, 4) + "...");
}
console.log("- CANVAS_BASE_URL:", process.env.CANVAS_BASE_URL);
`);

const childProcess = spawn('node', [tempScriptPath], {
  env: childEnv,
  stdio: 'inherit'
});

childProcess.on('close', (code) => {
  console.log(`Child process exited with code ${code}`);
  
  // Clean up temp script
  fs.unlinkSync(tempScriptPath);
}); 