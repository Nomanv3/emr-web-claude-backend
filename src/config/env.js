// Phase 4 cut-over (2026-04-19): MySQL is the sole runtime datastore.
// `useMysql` is hard-coded to `true`; controllers may still reference it but the
// Mongo branch is unreachable. `mongodbUri` is retained as a dead field so any
// un-deleted legacy code that reads `config.mongodbUri` doesn't throw.

export default {
  port: process.env.PORT || 5000,
  jwtSecret: process.env.JWT_SECRET || 'emr-jwt-secret-key-dev-2024',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'emr-jwt-refresh-secret-key-dev-2024',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',
  googleApiKey: process.env.GOOGLE_API_KEY || '',

  // Always true post-cutover. Kept as a named constant so controllers compile
  // without changes until Step F.2 physically removes the branch.
  useMysql: true,
  mongodbUri: '', // deprecated — no Mongo runtime

  mysqlHost:     process.env.MYSQL_HOST     || '192.168.80.1',
  mysqlPort:     parseInt(process.env.MYSQL_PORT || '3306', 10),
  mysqlUser:     process.env.MYSQL_USER     || 'root',
  mysqlPassword: process.env.MYSQL_PASSWORD || '',
  mysqlDatabase: process.env.MYSQL_DATABASE || 'emrdevtestingdb',
};
