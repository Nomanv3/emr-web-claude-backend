const mysql = require('mysql2/promise');
(async () => {
  try {
    const conn = await mysql.createConnection({
      host: process.env.MYSQL_HOST || '192.168.80.1',
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || 'Noman@9511676707',
      database: process.env.MYSQL_DATABASE || 'emrdevtestingdb',
    });
    const [rows] = await conn.query(
      'SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema=? ORDER BY TABLE_NAME',
      ['emrdevtestingdb']
    );
    console.log('CONNECTED. Tables:', rows.length);
    rows.forEach((r) => console.log(' -', r.TABLE_NAME));
    await conn.end();
  } catch (e) {
    console.error('FAIL:', e.code || e.message);
    process.exit(1);
  }
})();
