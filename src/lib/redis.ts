import Redis from 'ioredis';

type RedisInstance = Redis | null;

// Use globalThis to persist the Redis connection across hot reloads in serverless
const globalForRedis = globalThis as typeof globalThis & {
  __redis: RedisInstance;
};

function createRedisClient(): RedisInstance {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn('[Redis] REDIS_URL not set — using in-memory fallback');
    return null;
  }

  try {
    const client = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 3) return null; // Stop retrying after 3 attempts
        return Math.min(times * 100, 3000);
      },
      lazyConnect: true,
      // Keep alive for connection reuse in serverless
      keepAlive: 30000,
      connectTimeout: 5000,
      enableReadyCheck: true,
    });

    client.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });

    client.on('connect', () => {
      console.info('[Redis] Connected');
    });

    return client;
  } catch (error) {
    console.error('[Redis] Failed to create client:', error);
    return null;
  }
}

/**
 * Returns a shared Redis client instance.
 * Uses globalThis to persist across serverless invocations.
 * Returns null if Redis is not configured.
 */
export function getRedisClient(): RedisInstance {
  if (!globalForRedis.__redis) {
    globalForRedis.__redis = createRedisClient();
  }
  return globalForRedis.__redis;
}

export default getRedisClient;
