import pino from 'pino';

export const logger = (pino as any)({
  level: process.env.LOG_LEVEL || 'info',
});

export default logger;
