'use strict';
import express from 'express';
import handlebars from 'handlebars';
import fs from 'fs';
import { MongoClient } from 'mongodb';
import auth from '../middleware/auth.js';

const dashboard = express.Router();

dashboard.get('/', auth, async (req, res) => {
  const data = {
    pagename: 'Customer Dashboard',
  };

  const source = fs.readFileSync('./templates/dashboard.html');
  const template = handlebars.compile(source.toString());
  const page = template(data);
  res.send(page);
});

dashboard.post('/', async (req, res) => {});

// //Fn to search Mongo for user
// async function findUser(username) {
//   const client = new MongoClient('mongodb://mongodb/erikstrattoria');
//   await client.connect({ useNewUrlParser: true });
//   const user = await client.db().collection('users').findOne({ username: username });
//   client.close();
//   return user;
// }

export default dashboard;
