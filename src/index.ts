import 'dotenv/config';

import { logger } from './logger.js';
import { fileURLToPath } from 'url';
import { CanvasServer } from './canvasServer.js';
import { CanvasConfig } from './types.js';

const __filenameLocal = fileURLToPath(import.meta.url);

if (process.argv[1] === __filenameLocal) {
  const config: CanvasConfig = {
    apiToken: process.env.CANVAS_API_TOKEN || '',
    baseUrl: process.env.CANVAS_BASE_URL || 'https://fhict.instructure.com',
  };

  if (!config.apiToken) {
    logger.error('Error: CANVAS_API_TOKEN environment variable is required');
    process.exit(1);
  }

  const server = new CanvasServer(config);
  logger.info('Starting Canvas MCP Server...');
  server.start().catch((error: unknown) => {
    logger.error('Fatal error during server startup:', error);
    process.exit(1);
  });
}
