const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

let mongod;

async function connect() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

async function clearDb() {
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) await collections[key].deleteMany({});
}

async function disconnect() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

async function createUser(overrides = {}) {
  const user = await User.create({
    name: 'Test User',
    email: `u${Date.now()}${Math.random().toString(36).slice(2, 6)}@test.com`,
    password: 'secret123',
    ...overrides
  });
  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
  return { user, token };
}

module.exports = { connect, clearDb, disconnect, createUser };
