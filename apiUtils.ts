/**
 * Utility functions for handling API rate limiting and retries
 */

/**
 * Sleep for a specified number of milliseconds
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Retry an async function with exponential backoff
 * @param fn - The async function to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param initialDelay - Initial delay in milliseconds (default: 1000)
 * @param maxDelay - Maximum delay in milliseconds (default: 10000)
 * @returns The result of the function if successful
 * @throws The last error if all retries fail
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
  maxDelay: number = 10000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // If this is the last attempt, throw the error
      if (attempt === maxRetries) {
        break;
      }
      
      // Calculate exponential backoff delay
      const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
      
      // Add some jitter to prevent thundering herd
      const jitter = Math.random() * 0.3 * delay;
      const totalDelay = delay + jitter;
      
      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(totalDelay)}ms`);
      
      await sleep(totalDelay);
    }
  }
  
  throw lastError;
}

/**
 * Throttle manager for API calls to specific endpoints
 * Ensures minimum time between calls to prevent rate limiting
 */
export class ThrottleManager {
  private lastCallTimes: Map<string, number> = new Map();
  private pendingCalls: Map<string, Promise<any>> = new Map();
  
  /**
   * Throttle an API call to ensure minimum delay between calls
   * @param key - Unique identifier for this throttle (e.g., "setChargingAmps:VIN123")
   * @param fn - The async function to call
   * @param minDelay - Minimum delay in milliseconds between calls (default: 5000)
   * @returns The result of the function
   */
  async throttle<T>(
    key: string,
    fn: () => Promise<T>,
    minDelay: number = 5000
  ): Promise<T> {
    // If there's a pending call for this key, wait for it to complete
    const pending = this.pendingCalls.get(key);
    if (pending) {
      console.log(`Waiting for pending call to complete: ${key}`);
      await pending.catch(() => {
        // Ignore errors from pending calls, we'll make our own
      });
    }
    
    // Check if we need to wait before making the call
    const lastCallTime = this.lastCallTimes.get(key) || 0;
    const timeSinceLastCall = Date.now() - lastCallTime;
    
    if (timeSinceLastCall < minDelay) {
      const waitTime = minDelay - timeSinceLastCall;
      console.log(`Throttling ${key}: waiting ${waitTime}ms before call`);
      await sleep(waitTime);
    }
    
    // Make the call and track it
    const promise = fn();
    this.pendingCalls.set(key, promise);
    this.lastCallTimes.set(key, Date.now());
    
    try {
      const result = await promise;
      return result;
    } finally {
      // Clean up the pending call
      this.pendingCalls.delete(key);
    }
  }
  
  /**
   * Reset throttle for a specific key (useful for testing or manual resets)
   */
  reset(key: string): void {
    this.lastCallTimes.delete(key);
    this.pendingCalls.delete(key);
  }
  
  /**
   * Clear all throttle state
   */
  clearAll(): void {
    this.lastCallTimes.clear();
    this.pendingCalls.clear();
  }
}

// Global throttle manager instance
export const globalThrottleManager = new ThrottleManager();
