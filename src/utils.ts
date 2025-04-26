import axios, { AxiosInstance, AxiosResponse } from 'axios';

// Helper function for delay
export const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Helper method to fetch all pages for a paginated Canvas API endpoint.
 * Assumes the API uses Link headers for pagination.
 * Added generic type T for the expected data items.
 */
export async function fetchAllPages<T>(axiosInstance: AxiosInstance, initialUrl: string, config?: any): Promise<T[]> {
  let results: T[] = [];
  let url: string | null = initialUrl;
  const requestConfig = { ...config };

  console.log(`Fetching all pages starting from: ${url}`);

  while (url) {
    try {
      const response: AxiosResponse<T[]> = await axiosInstance.get<T[]>(url, requestConfig);
      // Handle cases where the response might not be an array (e.g., single object result)
      const responseData = Array.isArray(response.data) ? response.data : [response.data];
      results = results.concat(responseData);

      const linkHeader: string | undefined = response.headers['link'];
      url = null; // Reset url for the next iteration check
      if (linkHeader) {
        const links: string[] = linkHeader.split(',');
        const nextLink: string | undefined = links.find((link: string) => link.includes('rel="next"'));
        if (nextLink) {
          const match: RegExpMatchArray | null = nextLink.match(/<(.*?)>/);
          if (match && match[1]) {
            url = match[1];
            console.log(`Found next page link: ${url}`);
            // Add a small delay between page fetches to avoid rate limiting
            if (url) await delay(100);
          }
        }
      }
      // If requestConfig has params and page, remove page for subsequent requests if URL is absolute
      // This prevents sending 'page=1' repeatedly if the next link is absolute
      if (requestConfig?.params?.page && url && url.startsWith('http')) {
         delete requestConfig.params.page;
      }

    } catch (error: any) {
      console.error(`Error fetching page ${url}: ${error.message}`, error.response?.data);
      const apiError = error.response?.data?.errors?.[0]?.message || error.message;
      // Append the URL to the error message for better context
      throw new Error(`Failed during pagination at ${url || initialUrl}: ${apiError}`);
    }
  }

  console.log(`Finished fetching all pages. Total items: ${results.length}`);
  return results;
}


// Helper method to format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper method to format time duration in seconds
export function formatTimeDuration(seconds: number): string {
  if (!seconds) return 'Unknown';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  let result = '';
  if (hours > 0) result += `${hours} hour${hours > 1 ? 's' : ''} `;
  if (minutes > 0) result += `${minutes} minute${minutes > 1 ? 's' : ''} `;
  if (remainingSeconds > 0 || result === '')
    result += `${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
  return result.trim();
}
