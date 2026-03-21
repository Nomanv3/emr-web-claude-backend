import dotenv from 'dotenv';
dotenv.config();

export default {
  port: process.env.PORT || 5000,
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/emr-application',
  jwtSecret: process.env.JWT_SECRET || 'emr-jwt-secret-key-dev-2024',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'emr-jwt-refresh-secret-key-dev-2024',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',
};
