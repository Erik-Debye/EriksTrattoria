'use strict';
import express from 'express';
import handlebars from 'handlebars';
import fs from 'fs';
import { MongoClient } from 'mongodb';

const order = express.Router();

order.get('/', async (req, res) => {
  const data = {
    orderTable: null,
  };

  let orderNum = Number(req.session.orderNum) || null;

  //if session has the orderNum
  if (orderNum) {
    const order = await getOrder(Number(orderNum));
    data.orderTable = createTable(order);
  } //if a new session was created, we need to grab the orderNum from the cookies
  else if (req.cookies.orderNum) {
    console.log('This hit');
    orderNum = Number(req.cookies.orderNum);
    await updateOrderUser(orderNum, req.session.userid);
    req.session.orderNum = orderNum;
    //reset the cookie
    res.cookie('orderNum', '');
    const order = await getOrder(Number(orderNum));
    data.orderTable = createTable(order);
  }

  //if the session was updated with a userid aka login
  //we want to update the order with the userid
  // if (req.session.userid) {
  //   await updateOrderUser(orderNum, req.session.userid);
  // }

  const source = fs.readFileSync('./templates/order.html');
  const template = handlebars.compile(source.toString());
  const page = template(data);
  res.send(page);
});

//this assumes our order form went through
order.post('/', async (req, res) => {
  const data = {
    orderTable: null,
    orderError: null,
  };
  //check for form errors
  if (!Number(req.body.amount) || Number(req.body.amount) <= 0) {
    data.orderError = 'Order Number must be more than 0, and it must be a number.';
    const orderNum = req.session.orderNum || null;
    if (orderNum) {
      const order = await getOrder(Number(orderNum));
      data.orderTable = createTable(order);
    }
    const source = fs.readFileSync('./templates/order.html');
    const template = handlebars.compile(source.toString());
    const page = template(data);
    res.send(page);
  } //if order exists in session, we add to it,
  else if (req.session.orderNum) {
    const currOrder = await getOrder(Number(req.session.orderNum));
    //create a new pizza
    const pizza = {
      size: Number(req.body.size),
      toppings: req.body.toppings || [],
      numberOrdered: req.body.amount,
      cost: 0,
    };
    //lets calculate
    const cost = findCost(pizza);
    pizza.cost = cost;
    //update the existing order
    if (req.session.userid) {
      await updateOrderUser(req.session.userid);
    }
    await updateOrder(currOrder, pizza);
    //build the table and reload
    const order = await getOrder(req.session.orderNum);
    data.orderTable = createTable(order);
    const source = fs.readFileSync('./templates/order.html');
    const template = handlebars.compile(source.toString());
    const page = template(data);
    res.send(page);
  } //else we create a new order and add to that
  else {
    const orderNum = await createNewOrderNum();
    req.session.orderNum = orderNum;
    const pizza = {
      size: Number(req.body.size),
      toppings: req.body.toppings || [],
      numberOrdered: req.body.amount,
      cost: 0,
    };
    //lets calculate cost
    const cost = findCost(pizza);
    pizza.cost = cost;
    //lets create the order
    await createNewOrder(orderNum, req.session.userid, pizza, req.body.amount, cost);
    //now we need to buidl a table
    const order = await getOrder(orderNum);
    data.orderTable = createTable(order);
    const source = fs.readFileSync('./templates/order.html');
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

  table += `<div class="flex justify-center items-end gap-12 text-white pb-4"><h3>Price: $${order.price}</h3><h4 class="text-lg">Tax not included</h4></div>
    <a class="pl-3 pr-3 pt-2 bg-white text-red hover:bg-red hover:text-orange rounded-2xl pb-2" href="/checkout">Proceed to Checkout</a>`;

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

//FN to create a newOrderNUm from the last order in DB
async function createNewOrderNum() {
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const database = client.db();
  const orders = database.collection('orders');
  const lastOrder = await orders.find().sort({ orderNum: -1 }).limit(1).toArray();
  const newOrderNum = lastOrder.length > 0 ? lastOrder[0].orderNum + 1 : 1;
  return newOrderNum;
}

//Fn to create a new order
async function createNewOrder(orderNum, userID, pizza, itemCount, cost) {
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const database = client.db();
  const orders = database.collection('orders');

  await orders.insertOne({
    orderNum: orderNum,
    userid: userID,
    order: [pizza],
    itemCount: Number(itemCount),
    price: Number(Number(cost).toFixed(2)),
    taxRate: null,
  });
  client.close();
}

//fn to update an existing order
async function updateOrder(currOrder, newPizza) {
  const currOrderPizzas = currOrder.order;
  //add to array of pizzas
  currOrderPizzas.push(newPizza);
  const newPrice = Number(currOrder.price) + Number(newPizza.cost);
  const newItemCount = Number(currOrder.itemCount) + Number(newPizza.numberOrdered);

  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const database = client.db();
  const orders = database.collection('orders');
  //update the order
  await orders.updateOne(
    { orderNum: currOrder.orderNum },
    { $set: { order: currOrderPizzas, price: Number(newPrice).toFixed(2), itemCount: newItemCount } }
  );
  client.close();
}

//fn to update a the user of an order
async function updateOrderUser(orderNum, userid) {
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const database = client.db();
  const orders = database.collection('orders');
  //update the order
  await orders.updateOne({ orderNum: orderNum }, { $set: { userid: userid } });
}

//fn to calc cost of pizza
function findCost(pizza) {
  let cost = 0;
  let toppingMultiplier = 0;
  if (pizza.size === 12) {
    cost += 12.99;
    toppingMultiplier += 1.25;
  } else if (pizza.size === 14) {
    cost += 14.99;
    toppingMultiplier += 1.5;
  } else {
    cost += 17.99;
    toppingMultiplier += 1.75;
  }
  //now add cost of toppings
  if (pizza.toppings && pizza.toppings.length > 0) {
    const numToppings = pizza.toppings.length;
    cost += numToppings * toppingMultiplier;
  }
  //now multiple by number of pizzas ordered
  cost *= pizza.numberOrdered;
  return cost.toFixed(2);
}

export default order;
