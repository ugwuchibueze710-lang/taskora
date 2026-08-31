import pg from 'pg';
import 'dotenv/config';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL error on idle client', err);
});

/**
 * Run a parameterized query.
 * @param {string} text
 * @param {any[]} params
 */
export async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Run a function inside a transaction. `fn` receives a client with the same
 * `.query` signature; commits on success, rolls back on throw.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
