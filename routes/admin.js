'use strict';
import express from 'express';
import handlebars from 'handlebars';
import fs from 'fs';
import { MongoClient } from 'mongodb';
import auth from '../middleware/auth.js';

const admin = express.Router();

admin.get('/', auth, async (req, res) => {
  const data = {
    pagename: 'Admin Page',
  };

  const source = fs.readFileSync('./templates/admin.html');
  const template = handlebars.compile(source.toString());
  const page = template(data);
  res.send(page);
});

admin.post('/', async (req, res) => {});

// //Fn to search Mongo for user
// async function findUser(username) {
//   const client = new MongoClient('mongodb://mongodb/erikstrattoria');
//   await client.connect({ useNewUrlParser: true });
//   const user = await client.db().collection('users').findOne({ username: username });
//   client.close();
//   return user;
// }

export default admin;
