import { AxiosInstance, AxiosResponse } from 'axios';
import { logger } from './logger.js';

/**
 * Pause execution for a specified number of milliseconds.
 */
export const delay = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch all pages of a paginated Canvas API endpoint using the Link header.
 */
export async function fetchAllPages<T>(
  axiosInstance: AxiosInstance,
  initialUrl: string,
  config?: any
): Promise<T[]> {
  let results: T[] = [];
  let url: string | null = initialUrl;
  const requestConfig = { ...config };

  logger.debug(`Fetching all pages starting from: ${url}`);

  while (url) {
    try {
      const response: AxiosResponse<T[]> = await axiosInstance.get<T[]>(
        url,
        requestConfig
      );
      const responseData = Array.isArray(response.data)
        ? response.data
        : [response.data];
      results = results.concat(responseData);

      const linkHeader: string | undefined = response.headers['link'];
      url = null;
      if (linkHeader) {
        const links: string[] = linkHeader.split(',');
        const nextLink: string | undefined = links.find((link: string) =>
          link.includes('rel="next"')
        );
        if (nextLink) {
          const match: RegExpMatchArray | null = nextLink.match(/<(.*?)>/);
          if (match && match[1]) {
            url = match[1];
            logger.debug(`Found next page link: ${url}`);
            if (url) {
              await delay(100);
            }
          }
        }
      }
    } catch (error: any) {
      const apiError = error.response?.data?.errors?.[0]?.message || error.message;
      throw new Error(`Failed during pagination at ${url}: ${apiError}`);
    }
  }

  logger.debug(`Finished fetching all pages. Total items: ${results.length}`);
  return results;
}

