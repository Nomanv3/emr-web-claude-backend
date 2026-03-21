import mongoose from 'mongoose';
import config from './env.js';

const connectDB = async (retries = 3) => {
  const uri = config.mongodbUri;
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 15000,
        socketTimeoutMS: 45000,
        bufferCommands: true,
      });
      mongoose.set('bufferTimeoutMS', 3000);
      console.log(`MongoDB connected: ${conn.connection.host}`);
      return conn;
    } catch (error) {
      console.error(`MongoDB connection attempt ${i + 1}/${retries} failed:`, error.message);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        // Set short buffer timeout so API calls fail fast with clear error
        mongoose.set('bufferTimeoutMS', 3000);
        console.warn('MongoDB not available — server will start without DB. Retrying in background...');
        // Retry in background every 10s, max 30 attempts (5 minutes)
        let bgAttempts = 0;
        const bgRetry = async () => {
          if (bgAttempts >= 30) {
            console.error('MongoDB background retry limit reached (30 attempts). Giving up.');
            return;
          }
          bgAttempts++;
          try {
            await mongoose.connect(uri, {
              serverSelectionTimeoutMS: 5000,
              connectTimeoutMS: 5000,
            });
            console.log(`MongoDB connected (background retry #${bgAttempts}): ${mongoose.connection.host}`);
          } catch {
            setTimeout(bgRetry, 10000);
          }
        };
        setTimeout(bgRetry, 10000);
        return null;
      }
    }
  }
};

export default connectDB;
