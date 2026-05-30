require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable set nahi hai!');
}

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
}).catch(err => {
  console.error('❌ MongoDB connect error:', err.message);
});

mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB Atlas connected — ar_attendance database');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected — reconnecting...');
});

module.exports = mongoose;
