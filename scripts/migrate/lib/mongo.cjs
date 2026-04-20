'use strict';
// mongo.cjs — Raw MongoDB connection (no Mongoose model imports needed)
// Uses mongoose solely for the connection; raw collection access avoids ESM/CJS issues.

const mongoose = require('mongoose');

let _db = null;

async function getDb() {
  if (_db) return _db;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set in environment');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  _db = mongoose.connection.db;
  return _db;
}

async function closeMongo() {
  await mongoose.disconnect();
  _db = null;
}

module.exports = { getDb, closeMongo };
