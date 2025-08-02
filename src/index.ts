import 'dotenv/config';
import { fileURLToPath } from 'url';
import { CanvasServer } from './canvasServer.js';
import type { CanvasConfig } from './types.js';

const __filenameLocal = fileURLToPath(import.meta.url);

if (process.argv[1] === __filenameLocal) {
  const config: CanvasConfig = {
    apiToken: process.env.CANVAS_API_TOKEN || '',
    baseUrl: process.env.CANVAS_BASE_URL || 'https://fhict.instructure.com',
  };

  if (!config.apiToken) {
    console.error('Error: CANVAS_API_TOKEN environment variable is required');
    process.exit(1);
  }

  const server = new CanvasServer(config);
  console.error('Starting Canvas MCP Server...');
  server.start().catch((error: unknown) => {
    console.error('Fatal error during server startup:', error);
    process.exit(1);
  });
}
