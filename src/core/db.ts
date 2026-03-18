/**
 * PostgreSQL Connection Pool
 *
 * Singleton pg.Pool — lazily initialized on first use.
 * Degrades gracefully when DATABASE_URL is not set (returns null).
 */

import pg from 'pg';

let pool: pg.Pool | null = null;

/**
 * Returns the shared pg.Pool, initializing it on first call.
 * Returns null if DATABASE_URL is not configured.
 */
export function getPool(): pg.Pool | null {
    if (!process.env.DATABASE_URL) return null;

    if (!pool) {
        pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

        pool.on('error', (err) => {
            console.error('[db] idle client error:', err.message);
        });
    }

    return pool;
}
