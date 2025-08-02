import dotenv from 'dotenv';
import { CanvasConfig } from './types.js';

dotenv.config();

const apiToken = process.env.CANVAS_API_TOKEN;
const baseUrl = process.env.CANVAS_BASE_URL || 'https://fhict.instructure.com';

if (!apiToken) {
  throw new Error('CANVAS_API_TOKEN environment variable is required');
}

const config: CanvasConfig = {
  apiToken,
  baseUrl,
};

export default config;
