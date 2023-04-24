'use strict';

//https://stackoverflow.com/questions/47125420/express-jsmultiple-route-files-into-single-file

import express from 'express';

export const router = express.Router();

//import statements
import login from './login.js';
import register from './register.js';
import admin from './admin.js';
import dashboard from './dashboard.js';
import orderQueue from './employee.js';
import order from './order.js';
import checkout from './checkout.js';
import confirm from './confirm.js';
import success from './success.js';

//router.use statements
router.use('/login', login);
router.use('/register', register);
router.use('/admin', admin);
router.use('/dashboard', dashboard);
router.use('/order-queue', orderQueue);
router.use('/order', order);
router.use('/checkout', checkout);
router.use('/confirm', confirm);
router.use('/success', success);
