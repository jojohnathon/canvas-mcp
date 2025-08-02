import axios, { AxiosInstance, AxiosError } from 'axios';
import { CanvasConfig } from '../types.js';

export function createCanvasClient(config: CanvasConfig): AxiosInstance {
  const instance = axios.create({
    baseURL: config.baseUrl,
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
    },
  });

  instance.interceptors.response.use(
    response => response,
    (error: AxiosError) => {
      const status = error.response?.status;
      const data = error.response?.data;
      console.error(`Canvas API error${status ? ` (${status})` : ''}:`, data ?? error.message);
      return Promise.reject(error);
    }
  );

  return instance;
}
