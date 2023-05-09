'use strict';
import express from 'express';
import handlebars from 'handlebars';
import fs from 'fs';
import { MongoClient } from 'mongodb';

const success = express.Router();

success.get('/', async (req, res) => {
  const data = {
    orderTable: null,
  };
  const orderNum = Number(req.session.orderNum);
  if (orderNum) {
    const order = await getOrder(orderNum);
    data.orderTable = createTable(order);
  }

  //reset orderNum (EDIT: Orginally I tried setting this to null, but it doesn't work since MongoDB requires int32. Could do 0, but deleting it also works cause we recreate it when making a new order)
  delete req.session.orderNum;
  delete req.session.customerid;

  const source = fs.readFileSync('./templates/success.html');
  const template = handlebars.compile(source.toString());
  const page = template(data);
  res.send(page);
});

success.post('/', async (req, res) => {
  if (req.body['home']) {
    res.redirect('/');
  } else {
    if (req.session.userRole === 'manager') {
      res.redirect('/admin');
    } else if (req.session.userRole === 'employee') {
      res.redirect('/order-queue');
    } else {
      res.redirect('/dashboard');
    }
  }
});

function createTable(order) {
  let table = `<h1 class="font-serif text-6xl pt-8 pb-4">Your Order!</h1>`;

  order.order.forEach((pizza) => {
    table += `<div class="flex gap-10 items-center justify-start w-[40%] p-3 bg-red rounded-sm"><img class="w-[10%] min-w-[10%]" src="./src/images/pizza.png" alt="Icon of a pizza slice"><h2 class="p-1 text-2xl min-w-[26rem] w-[26rem]">${pizza.numberOrdered} x ${pizza.size}in with `;

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

  table += `<div class="flex justify-center items-center gap-12 bg-white text-black w-[40%] h-[4rem] rounded-sm"><h3>Price: $${
    order.price
  }</h3><h3>Tax: $${taxTotal.toFixed(2)}</h3></div>
  
  <div class="flex justify-center items-center gap-12 bg-white text-black mb-4 w-[40%] h-[4rem] rounded-sm"><h3>Total Price: $${total.toFixed(
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

export default success;
