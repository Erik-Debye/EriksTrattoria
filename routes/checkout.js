'use strict';
import express from 'express';
import handlebars from 'handlebars';
import fs from 'fs';
import { MongoClient } from 'mongodb';
//we need to validate US phone numbers and format then (for use later in employee dashboard for lookups)
import { parsePhoneNumber } from 'libphonenumber-js/max';

const checkout = express.Router();

checkout.get('/', async (req, res) => {
  const data = {
    loggedOut: true,
    orderTable: null,
    filledForm: null,
  };

  if (req.session.isAuthorized === true) {
    data.loggedOut = false;
  }

  const orderNum = Number(req.session.orderNum);
  if (req.session.customerid) {
    const userNum = Number(req.session.customerid);
    await updateOrderUser(orderNum, userNum);
  } else {
    const userNum = Number(req.session.userid);
    await updateOrderUser(orderNum, userNum);
  }

  if (orderNum) {
    const order = await getOrder(orderNum);
    data.orderTable = createTable(order);
  } else {
    res.redirect('/order');
    return;
  }

  if (req.session.customerid) {
    const userObj = await getUser(req.session.customerid);
    if (userObj.name) {
      data.filledForm = prefillForm(userObj);
    }
  } else if (req.session.userid && req.session.userRole === 'customer') {
    const userObj = await getUser(req.session.userid);
    if (userObj.name) {
      data.filledForm = prefillForm(userObj);
    }
  } else {
    data.filledForm = null;
  }

  const source = fs.readFileSync('./templates/checkout.html');
  const template = handlebars.compile(source.toString());
  const page = template(data);
  res.send(page);
});

//this assumes our order form went through
checkout.post('/', async (req, res) => {
  const data = {
    loggedOut: true,
    orderTable: null,
    checkoutErr: null,
  };
  const orderNum = Number(req.session.orderNum);

  //edit 5.5.23 we want to add phone number validation using this library (a nodeJS port of Google's phone number validation library)
  //https://www.npmjs.com/package/libphonenumber-js
  //first, lets parse the number into a object. We can hardcode the US number as we only want US numbers
  const phoneNumber = parsePhoneNumber(`${req.body.phone}`, 'US');

  if (!phoneNumber.isValid()) {
    //this occurs if the phoneNumber isn't valid
    data.checkoutErr = 'You entered a invalid phone number. Your number must be a valid US number to continue.';
    if (req.session.isAuthorized === true) {
      data.loggedOut = false;
    }
    const order = await getOrder(orderNum);
    data.orderTable = createTable(order);

    const source = fs.readFileSync('./templates/checkout.html');
    const template = handlebars.compile(source.toString());
    const page = template(data);
    res.send(page);
  } else {
    //we want to check the zipcode to see if it is a number, and if so, try and fetch tax stuff. If error, return to /checkout
    if (Number(req.body.zip)) {
      const taxRate = await getTaxRate(Number(req.body.zip));
      //now we have to check if taxRate is defined. If not, invalid zipcode
      if (taxRate) {
        //format phone number to normalized format
        const tel = phoneNumber.formatNational();
        //if tax rate is defined we want to update the order with taxRate, notes, and telephone number (for guest order cases)
        await updateTaxInfo(orderNum, taxRate);
        await updateOrderNotes(orderNum, req.body.comment.trim());
        await updateOrderTel(orderNum, tel);
        //if logged in, we want to update the user profile if logged in
        if (req.session.userid && req.session.userRole != 'manager' && req.session.userRole != 'employee') {
          await updateUser(req.session.userid, req.body.fullname, req.body.email, tel, req.body.street, req.body.zip);
        } else if (req.session.customerid && req.session.customerid != 'guest') {
          await updateUser(
            req.session.customerid,
            req.body.fullname,
            req.body.email,
            tel,
            req.body.street,
            req.body.zip
          );
        }
        //then we want to head to /confirm
        req.session.orderNum = orderNum;
        res.redirect('/confirm');
      } //error getting tax rate
      else {
        data.checkoutErr = 'You entered a invalid Illinois ZipCode. Please try again.';
        if (req.session.isAuthorized === true) {
          data.loggedOut = false;
        }
        const order = await getOrder(orderNum);
        data.orderTable = createTable(order);

        const source = fs.readFileSync('./templates/checkout.html');
        const template = handlebars.compile(source.toString());
        const page = template(data);
        res.send(page);
      }
    } //zipcode was undefined or null or something else.
    else {
      data.checkoutErr = 'You entered an invalid Zip Code; Zip Code must be a valid Illinois 5 digit zip code.';
      if (req.session.isAuthorized === true) {
        data.loggedOut = false;
      }
      const order = await getOrder(orderNum);
      data.orderTable = createTable(order);
      const source = fs.readFileSync('./templates/checkout.html');
      const template = handlebars.compile(source.toString());
      const page = template(data);
      res.send(page);
    }
  }
});

function createTable(order) {
  let table = `<h1 class="font-serif text-6xl pt-8 pb-4">Your Order!</h1>`;

  order.order.forEach((pizza) => {
    table += `<div class="flex gap-10 items-center justify-start w-[80%] p-3 bg-red rounded-sm"><img class="w-[10%] min-w-[10%]" src="./src/images/pizza.png" alt="Icon of a pizza slice"><h2 class="p-1 text-2xl self-start min-w-[26rem] w-[26rem]">${pizza.numberOrdered} x ${pizza.size}in with `;

    if (pizza.toppings.length < 1) {
      table += `no toppings`;
    } else {
      pizza.toppings.forEach((topping) => {
        if (pizza.toppings.indexOf(topping) === pizza.toppings.length - 1) {
          table += `${topping}`;
        } else {
          table += `${topping}, `;
        }
      });
    }
    table += `</h2><h2 class="p-1 text-2xl self-start whitespace-nowrap">Price: $${pizza.cost}</h2></div>`;
  });

  table += `<div class="flex justify-center items-end gap-12 text-white pb-4"><h3>Price: $${order.price}</h3><h4 class="text-lg">Tax not included</h4></div>`;
  return table;
}

function prefillForm(user) {
  let form = `<div class="flex gap-8 w-full justify-between"><label class="text-white" for="fullname">Enter your full name:</label><input class="p-2 rounded-sm text-black font-sans" type="text" id="fullname" name="fullname" required="" value="${user.name}" /></div><div class="flex gap-8 w-full justify-between"><label class="text-white" for="phone">Enter your phone number:</label><input class="p-2 rounded-sm text-black font-sans" type="tel" id="phone" name="phone" required="" value="${user.phone}" /></div><div class="flex gap-8 w-full justify-between"><label class="text-white" for="email">Enter your email:</label><input class="p-2 rounded-sm text-black font-sans" type="email" id="email" name="email" required="" value="${user.email}" /></div><div class="flex gap-8 w-full justify-between"><label class="text-white" for="street">Enter your street address:</label><input class="p-2 rounded-sm text-black font-sans" type="text" id="street" name="street" required="" value="${user.address}" /></div><div class="flex gap-8 w-full justify-between"><label class="text-white" for="zip">Enter your 5 digit Zip Code:</label><input class="p-2 rounded-sm text-black font-sans" list="codes" id="zip" name="zip" required="" value="${user.zipcode}" />`;

  return form;
}

//fn to get order
async function getOrder(number) {
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const database = client.db();
  const orders = database.collection('orders');
  const orderArr = await orders.find({ orderNum: number }).toArray();
  const order = orderArr[0];
  client.close();
  return order;
}

//fn to grab user info
async function getUser(userid) {
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const database = client.db();
  const users = database.collection('users');
  const userArr = await users
    .find({ userid: Number(userid) }, { projection: { _id: 0, address: 1, email: 1, name: 1, phone: 1, zipcode: 1 } })
    .toArray();
  client.close();

  return userArr[0];
}

//fn to fetch tax rate
async function getTaxRate(zipcode) {
  const URL = `http://web250taxrates.harpercollege.org/taxrates/IL/${zipcode}`;
  let taxRate;
  await fetch(URL)
    .then((res) => res.json())
    .then((taxData) => {
      const data = taxData;
      taxRate = Number(data.EstimatedCombinedRate);
    })
    .catch((err) => console.error(err));
  return taxRate;
}

//fn to update taxRate in order
async function updateTaxInfo(orderNum, taxRate) {
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const database = client.db();
  const orders = database.collection('orders');
  await orders.updateOne({ orderNum: orderNum }, { $set: { taxRate: Number(taxRate) } });
  client.close();
}

async function updateOrderNotes(orderNum, notes) {
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const database = client.db();
  const orders = database.collection('orders');
  await orders.updateOne({ orderNum: orderNum }, { $set: { notes: notes } });
  client.close();
}

async function updateOrderTel(orderNum, tel) {
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const database = client.db();
  const orders = database.collection('orders');
  await orders.updateOne({ orderNum: orderNum }, { $set: { phoneNumber: tel } });
  client.close();
}

//fn to update logged in user profile
async function updateUser(userid, fullname, email, phone, street, zip) {
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const database = client.db();
  const users = database.collection('users');
  await users.updateOne(
    { userid: userid },
    { $set: { name: fullname, email: email, phone: phone, address: street, zipcode: zip } }
  );
  client.close();
}

//fn to update a the user of an order
async function updateOrderUser(orderNum, userid) {
  //create client
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  //navigate db
  const database = client.db();
  const orders = database.collection('orders');
  //update the order with userID
  await orders.updateOne({ orderNum: orderNum }, { $set: { userid: userid } });
  //close connection
  client.close();
}

export default checkout;
