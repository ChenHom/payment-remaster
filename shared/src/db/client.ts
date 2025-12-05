import { Client as PgClient } from 'pg';

export type DBClient = PgClient | any;

export function createDBClientFromEnv(env: any = process.env): DBClient {
  // If running in Cloudflare, env.DB might be a Hyperdrive binding object
  // For local dev, env.DATABASE_URL or env.DB contains connection string
  const db = env.DB || env.DATABASE_URL || env.DATABASE_URL;
  if (!db) {
    throw new Error('DATABASE connection string not configured');
  }

  if (typeof db === 'string') {
    const client = new PgClient({
      connectionString: db
    });
    return client;
  }

  // Otherwise assume Hyperdrive-style binding (stub behavior)
  // We'll return a minimal wrapper with query method to remain compatible
  return db;
}
