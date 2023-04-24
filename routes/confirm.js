'use strict';
import express from 'express';
import handlebars from 'handlebars';
import fs from 'fs';
import { MongoClient } from 'mongodb';

const confirm = express.Router();

confirm.get('/', async (req, res) => {
  const data = {
    orderTable: null,
  };
  const orderNum = Number(req.session.orderNum);
  if (orderNum) {
    const order = await getOrder(orderNum);
    data.orderTable = createTable(order);
  } else {
    res.redirect('/order');
    return;
  }

  const source = fs.readFileSync('./templates/confirm.html');
  const template = handlebars.compile(source.toString());
  const page = template(data);
  res.send(page);
});

confirm.post('/', async (req, res) => {
  const orderNum = Number(req.session.orderNum);

  //we want to set the order status to 'active'
  await setOrderActive(orderNum);

  //if guest, set userID in DB to guest
  if (!req.session.isAuthorized) {
    await setGuestStatus(orderNum);
  }

  res.redirect('/success');
});

function createTable(order) {
  let table = `<h1 class="font-serif text-6xl pt-8 pb-4">Your Order!</h1>`;

  order.order.forEach((pizza) => {
    table += `<div class="flex gap-10 items-center justify-start w-[40%] p-3 bg-red rounded-2xl"><img class="w-[10%] min-w-[10%]" src="./src/images/pizza.png" alt="Icon of a pizza slice"><h2 class="p-1 text-2xl min-w-[26rem] w-[26rem]">${pizza.numberOrdered} x ${pizza.size}in with `;

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
    table += `</h2><h2 class="p-1 text-2xl whitespace-nowrap">Price: $${pizza.cost}</h2></div>`;
  });

  const taxTotal = Number(order.price) * Number(order.taxRate);
  const total = Number(taxTotal) + Number(order.price);

  table += `<div class="flex justify-center items-center gap-12 bg-white text-black w-[40%] h-[4rem] rounded-2xl"><h3>Price: $${
    order.price
  }</h3><h3>Tax: $${taxTotal.toFixed(2)}</h3></div>
  
  <div class="flex justify-center items-center gap-12 bg-white text-black mb-4 w-[40%] h-[4rem] rounded-2xl"><h3>Total Price: $${total.toFixed(
    2
  )}</h3></div>`;
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

//fn to set order status to active
async function setOrderActive(orderNum) {
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const database = client.db();
  const orders = database.collection('orders');
  await orders.updateOne({ orderNum: orderNum }, { $set: { status: 'active' } });
  client.close();
}

async function setGuestStatus(orderNum) {
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const database = client.db();
  const orders = database.collection('orders');
  await orders.updateOne({ orderNum: orderNum }, { $set: { userid: 'guest' } });
  client.close();
}

export default confirm;
