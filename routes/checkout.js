'use strict';
import express from 'express';
import handlebars from 'handlebars';
import fs from 'fs';
import { MongoClient } from 'mongodb';

const checkout = express.Router();

checkout.get('/', async (req, res) => {
  const data = {
    loggedOut: true,
    orderTable: null,
  };

  if (req.session.isAuthorized === true) {
    data.loggedOut = false;
  }

  const orderNum = Number(req.session.orderNum);

  if (orderNum) {
    const order = await getOrder(orderNum);
    data.orderTable = createTable(order);
  } else {
    res.redirect('/order');
    return;
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
  //First things first, we want to check the zipcode to see if it is a number, and if so, try and fetch tax stuff. If error, return to /checkout
  if (Number(req.body.zip)) {
    const taxRate = await getTaxRate(Number(req.body.zip));
    //now we have to check if taxRate is defined. If not, invalid zipcode
    if (taxRate) {
      //if tax rate is defined we want to update the order
      await updateTaxInfo(orderNum, taxRate);
      //also update the order with the notes
      await updateOrderNotes(orderNum, req.body.comment);
      //if logged in, we want to update the user profile if logged in
      if (req.session.userid) {
        await updateUser(
          req.session.userid,
          req.body.fullname,
          req.body.email,
          req.body.phone,
          req.body.street,
          req.body.zip
        );
      }
      await updateUser();
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
});

function createTable(order) {
  let table = `<h1 class="font-serif text-6xl pt-8 pb-4">Your Order!</h1>`;

  order.order.forEach((pizza) => {
    table += `<div class="flex gap-10 items-center justify-start w-[80%] p-3 bg-red rounded-2xl"><img class="w-[10%] min-w-[10%]" src="./src/images/pizza.png" alt="Icon of a pizza slice"><h2 class="p-1 text-2xl self-start min-w-[26rem] w-[26rem]">${pizza.numberOrdered} x ${pizza.size}in with `;

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

export default checkout;
