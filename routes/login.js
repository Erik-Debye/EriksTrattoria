'use strict';
import express from 'express';
import bcrypt from 'bcrypt';
import handlebars from 'handlebars';
import fs from 'fs';
import { MongoClient } from 'mongodb';

const login = express.Router();

login.get('/', async (req, res) => {
  const data = {
    username: req.cookies.username,
    userid: req.session.userid,
    message: null,
    heading: null,
    loggedOut: true,
  };

  //checks if logged in (changes form in html)
  if (data.username && data.userid) {
    data.loggedOut = false;
    data.heading = `Welcome back ${data.username}! You are logged in!`;
  } else if (data.username) {
    data.loggedOut = true;
    data.heading = `Welcome back ${data.username}! Please log in.`;
  } else {
    data.loggedOut = true;
    data.heading = null;
  }

  const source = fs.readFileSync('./templates/login.html');
  const template = handlebars.compile(source.toString());
  const page = template(data);
  res.send(page);
});

login.post('/', async (req, res) => {
  if (req.body['reload']) {
    res.redirect(req.originalUrl);
  } else if (req.body['home']) {
    res.redirect('/');
  } else if (req.body['logout']) {
    req.session.destroy();
    res.cookie('orderNum', '', { expires: 0 });
    const data = {
      username: req.cookies.username,
      userid: null,
      heading: `Welcome back ${req.cookies.username}! Please log in.`,
      message: 'You have been logged out.',
      loggedOut: true,
    };
    const source = fs.readFileSync('./templates/login.html');
    const template = handlebars.compile(source.toString());
    const page = template(data);
    res.send(page);
  } else if (req.body['register']) {
    res.redirect('/register');
  } else if (req.body['forget']) {
    req.session.destroy();
    res.cookie('username', '', { expires: 0 });
    res.cookie('orderNum', '', { expires: 0 });
    const data = {
      username: null,
      userid: null,
      heading: null,
      message: 'Cookies and Session Data purged.',
      loggedOut: true,
    };
    const source = fs.readFileSync('./templates/login.html');
    const template = handlebars.compile(source.toString());
    const page = template(data);
    res.send(page);
  } else {
    //login
    const username = req.body.username.trim();
    const password = req.body.password.trim();
    const [userID, userRole] = await authUser(username, password);
    if (userID) {
      req.session.userid = userID;
      res.cookie('username', username);
      req.session.isAuthorized = true;
      req.session.userRole = userRole;
      //TEMP
      res.redirect('/');
      // userRole === 'manager'
      //   ? res.redirect('/admin')
      //   : userRole === 'employee'
      //   ? res.redirect('/order-queue')
      //   : res.redirect('/dashboard');
    } else {
      const data = {
        username: req.cookies.username,
        userid: req.session.userid,
        message: 'Incorrect password or username. Try again!',
        loggedOut: true,
      };
      const source = fs.readFileSync('./templates/login.html');
      const template = handlebars.compile(source.toString());
      const page = template(data);
      res.send(page);
    }
  }
});

//fn to authenticate a user
async function authUser(username, password) {
  const userObj = await findUser(username);
  if (userObj && bcrypt.compareSync(password, userObj.password)) {
    return [userObj.userid, userObj.roles[0]];
  } else {
    return [null, null];
  }
}

//Fn to search Mongo for user
async function findUser(username) {
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const user = await client.db().collection('users').findOne({ username: username });
  client.close();
  return user;
}

export default login;
