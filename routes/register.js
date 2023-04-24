'use strict';
import express from 'express';
import bcrypt from 'bcrypt';
import handlebars from 'handlebars';
import fs from 'fs';
import { MongoClient } from 'mongodb';

const register = express.Router();

register.get('/', async (req, res) => {
  const data = {
    username: req.cookies.username,
    userid: req.session.userid,
    message: null,
    loggedOut: true,
  };

  //checks if logged in (changes form in html)
  if (data.username && data.userid) {
    data.loggedOut = false;
  } else {
    data.loggedOut = true;
  }

  const source = fs.readFileSync('./templates/register.html');
  const template = handlebars.compile(source.toString());
  const page = template(data);
  res.send(page);
});

register.post('/', async (req, res) => {
  if (req.body['home']) {
    res.redirect('/');
  } else if (req.body['login']) {
    res.redirect('/login');
  } else if (req.body['logout']) {
    req.session.destroy();
    const data = {
      username: req.cookies.username,
      userid: null,
      message: 'You have been logged out.',
      loggedOut: true,
    };
    const source = fs.readFileSync('./templates/register.html');
    const template = handlebars.compile(source.toString());
    const page = template(data);
    res.send(page);
  } else {
    //register
    const username = req.body.username.trim();
    const password = req.body.password.trim();
    if (!username || !password) {
      const data = {
        username: req.cookies.username,
        userid: null,
        message: 'You must have a username and password.',
        loggedOut: true,
      };
      const source = fs.readFileSync('./templates/register.html');
      const template = handlebars.compile(source.toString());
      const page = template(data);
      res.send(page);
    } else {
      //see if username is taken
      const user = await findUser(username);
      //if username taken
      if (user) {
        const data = {
          username: req.cookies.username,
          userid: null,
          message: 'Username taken, try another!',
          loggedOut: true,
        };
        const source = fs.readFileSync('./templates/register.html');
        const template = handlebars.compile(source.toString());
        const page = template(data);
        res.send(page);
        //account created
      } else {
        await createUser(username, password);
        if (req.session.orderNum) {
          res.cookie('orderNum', req.session.orderNum);
        }
        req.session.destroy();
        res.cookie('username', username);
        const data = {
          username: req.cookies.username,
          userid: null,
          loggedOut: true,
          newuser: true,
        };
        const source = fs.readFileSync('./templates/register.html');
        const template = handlebars.compile(source.toString());
        const page = template(data);
        res.send(page);
      }
    }
  }
});

//Fn to search Mongo for user
async function findUser(username) {
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const user = await client.db().collection('users').findOne({ username: username });
  client.close();
  return user;
}

//fn to add a new user to mongo
async function createUser(username, password, role = ['customer']) {
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });

  //get the last user id
  const lastUser = await client.db().collection('users').find().sort({ userid: -1 }).limit(1).toArray();
  const lastUserId = lastUser.length > 0 ? lastUser[0].userid + 1 : 1;

  await client
    .db()
    .collection('users')
    .insertOne({ userid: lastUserId, username: username, password: generateHashedPassword(password), roles: role });

  client.close();
}

//Fn to salt + hash passwords
function generateHashedPassword(password) {
  return bcrypt.hashSync(password, bcrypt.genSaltSync());
}

export default register;
