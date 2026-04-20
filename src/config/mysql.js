// mysql.js — mysql2/promise pool + small query helpers for Phase 4
// MongoDB → MySQL migration. Used only when config.useMysql === true.
//
// Pool is created lazily on first use so a broken MySQL config never
// prevents the server from starting in Mongo-only mode.

import mysql from 'mysql2/promise';
import config from './env.js';

let pool = null;

export function getPool() {
  if (pool) return pool;
  pool = mysql.createPool({
    host:               config.mysqlHost,
    port:               config.mysqlPort,
    user:               config.mysqlUser,
    password:           config.mysqlPassword,
    database:           config.mysqlDatabase,
    waitForConnections: true,
    connectionLimit:    10,
    charset:            'utf8mb4',
    timezone:           '+00:00', // store/read timestamps as UTC
    dateStrings:        false,    // return Date objects
  });
  return pool;
}

// Quick connectivity check on boot. Returns true/false; never throws.
export async function pingMysql() {
  try {
    const p = getPool();
    const [[{ ok }]] = await p.query('SELECT 1 AS ok');
    return ok === 1;
  } catch (err) {
    console.error('MySQL ping failed:', err.message);
    return false;
  }
}

// Convenience helpers — all return the same shape as mysql2/promise.
export async function query(sql, params = []) {
  return getPool().query(sql, params);
}

export async function execute(sql, params = []) {
  return getPool().execute(sql, params);
}

// Run a function inside a transaction. `fn` receives a connection that
// supports .query/.execute. Auto-commits on resolve, rolls back on throw.
export async function withTransaction(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

export async function closeMysql() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
