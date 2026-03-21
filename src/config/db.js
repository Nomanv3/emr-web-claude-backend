import mongoose from 'mongoose';

const connectDB = async (retries = 2) => {
  const uri = process.env.MONGODB_URI || 'mongodb://192.168.80.1:27017/emr-application';
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        bufferCommands: true,
        // Fail fast if not connected — 3s buffer timeout instead of 10s default
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
        // Retry in background every 10s
        const bgRetry = async () => {
          try {
            await mongoose.connect(uri, {
              serverSelectionTimeoutMS: 5000,
              connectTimeoutMS: 5000,
            });
            console.log(`MongoDB connected (background retry): ${mongoose.connection.host}`);
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
