// Phase 4 cut-over (2026-04-19): MySQL is the sole runtime datastore.
// Mongoose connect removed. Any residual `import mongoose from 'mongoose'`
// statements in legacy code paths are unreachable (controllers only take the
// MySQL branch). See database/migration.md Phase 15 for background.

import config from './env.js';
import { pingMysql } from './mysql.js';

const connectDB = async () => {
  const ok = await pingMysql();
  if (ok) {
    console.log(`MySQL connected: ${config.mysqlHost}:${config.mysqlPort}/${config.mysqlDatabase}`);
    return true;
  }
  throw new Error(
    `MySQL is not reachable at ${config.mysqlHost}:${config.mysqlPort}. ` +
    `Start MySQL on the Windows host and verify MYSQL_* env vars in backend/.env.`
  );
};

export default connectDB;
