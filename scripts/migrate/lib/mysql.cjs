'use strict';
// mysql.cjs — mysql2/promise pool + idempotent upsert helper

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.MYSQL_HOST     || '192.168.80.1',
  port:     parseInt(process.env.MYSQL_PORT || '3306', 10),
  user:     process.env.MYSQL_USER     || 'root',
  password: process.env.MYSQL_PASSWORD || 'Noman@9511676707',
  database: process.env.MYSQL_DATABASE || 'emrdevtestingdb',
  charset:  'utf8mb4',
  timezone: '+00:00',        // store timestamps as UTC
  waitForConnections: true,
  connectionLimit: 5,
});

/**
 * upsert(table, row, uniqueKeyCol)
 * Inserts row into table. On duplicate key (by uniqueKeyCol) updates all other columns.
 *
 * @param {string}  table        MySQL table name
 * @param {object}  row          Plain object of { col: value, … }
 * @param {string}  uniqueKeyCol The unique/PK column name used as the conflict key
 */
async function upsert(table, row, uniqueKeyCol) {
  const cols = Object.keys(row);
  if (cols.length === 0) throw new Error('upsert: empty row object');

  const placeholders = cols.map(() => '?').join(', ');
  const colList = cols.map(c => `\`${c}\``).join(', ');

  // Build UPDATE clause for all columns except the unique key
  const updateCols = cols.filter(c => c !== uniqueKeyCol);
  if (updateCols.length === 0) {
    // Nothing to update — just ensure the row exists
    const sql = `INSERT IGNORE INTO \`${table}\` (${colList}) VALUES (${placeholders})`;
    return pool.execute(sql, Object.values(row));
  }

  const updateClause = updateCols.map(c => `\`${c}\` = VALUES(\`${c}\`)`).join(', ');
  const sql = `INSERT INTO \`${table}\` (${colList}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`;
  return pool.execute(sql, Object.values(row));
}

async function closeMysql() {
  await pool.end();
}

module.exports = { pool, upsert, closeMysql };
