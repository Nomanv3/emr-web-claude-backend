const mysql = require('mysql2/promise');
(async () => {
  try {
    const conn = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'Noman@9511676707',
      multipleStatements: true,
    });
    await conn.query(
      `CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED WITH mysql_native_password BY 'Noman@9511676707'`
    );
    await conn.query(`GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION`);
    await conn.query(`FLUSH PRIVILEGES`);
    console.log("OK — root@'%' granted");
    await conn.end();
  } catch (e) {
    console.error('FAIL:', e.code || e.message);
    process.exit(1);
  }
})();
