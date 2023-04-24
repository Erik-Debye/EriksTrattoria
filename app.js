'use strict';

import express from 'express';
//for dir__name
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { MongoClient } from 'mongodb';
import { default as connectMongoDBSession } from 'connect-mongodb-session';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

//create app
const app = express();

//create sessions
MongoClient.connect('mongodb://mongodb/erikstrattoria', { useNewUrlParser: true })
  .then((_) => {
    console.log('MongoDB Connected');
  })
  .catch((err) => {
    console.log(err);
  });

const mongoStore = connectMongoDBSession(session);

const store = new mongoStore({
  uri: 'mongodb://mongodb/erikstrattoria',
  collection: 'sessions',
});

//we also want to initialize the collections here -- we can use an IIFE b/c it should be immediately invoked && not rerun
(async () => {
  //Fn to init the DB (needs to create both users and orders so that permissions for roles can be granted for both)

  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  try {
    await client.connect({ useNewUrlParser: true });
    const db = client.db();
    const collections = await db.collections();
    //check if orders collection exists
    const ordersExist = collections.some((collection) => collection.collectionName === 'orders');
    if (!ordersExist) {
      await db.createCollection('orders');
      console.log('Orders Collection Created!');
    }
    //check if users collection exists
    const usersExist = collections.some((collection) => collection.collectionName === 'users');
    if (!usersExist) {
      await db.createCollection('users');
      console.log('Users Collection Created!');
      //add roles to db
      await db.command({
        createRole: 'manager',
        privileges: [
          { resource: { db: 'erikstrattoria', collection: 'orders' }, actions: ['find', 'insert', 'update', 'remove'] },
          { resource: { db: 'erikstrattoria', collection: 'users' }, actions: ['find', 'insert', 'update', 'remove'] },
        ],
        roles: [],
      });
      await db.command({
        createRole: 'employee',
        privileges: [
          { resource: { db: 'erikstrattoria', collection: 'orders' }, actions: ['find', 'insert', 'update', 'remove'] },
          { resource: { db: 'erikstrattoria', collection: 'users' }, actions: ['find'] },
        ],
        roles: [],
      });
      await db.command({
        createRole: 'customer',
        privileges: [
          {
            resource: { db: 'erikstrattoria', collection: 'users' },
            actions: ['find', 'insert', 'update', 'remove'],
            filter: { userId: { $eq: '$$userId' } },
          },
          {
            resource: { db: 'erikstrattoria', collection: 'orders' },
            actions: ['find', 'insert', 'update', 'remove'],
          },
        ],
        roles: [],
      });

      //add default users
      await client
        .db()
        .collection('users')
        .insertOne({ userid: 1, username: 'manager', password: generateHashedPassword('manager'), roles: ['manager'] });

      await client
        .db()
        .collection('users')
        .insertOne({ userid: 2, username: 'worker', password: generateHashedPassword('worker'), roles: ['employee'] });

      //close connection
      client.close();
    } else {
      //close connection
      client.close();
    }
  } catch (error) {
    console.log(error);
  }
})();

//create the passwords
//Fn to salt + hash passwords
function generateHashedPassword(password) {
  return bcrypt.hashSync(password, bcrypt.genSaltSync());
}

app.use(cookieParser());
//uses the express-session as middleware for all req
app.use(
  session({
    resave: false,
    saveUninitialized: false,
    secret: crypto.randomBytes(16).toString('hex'),
    store: store,
  })
);

//define static page
const __fileName = fileURLToPath(import.meta.url);
const __dirName = path.dirname(__fileName);
app.use(express.static(`${__dirName}/static`));
app.use(
  express.urlencoded({
    extended: true,
  })
);

//add routes
import { router } from './routes/route-config.js';
app.use('/', router);

app.listen(3000, () => console.log('Server started!'));
