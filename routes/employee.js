'use strict';
import express from 'express';
import handlebars from 'handlebars';
import fs from 'fs';
import { MongoClient } from 'mongodb';
import auth from '../middleware/auth.js';
import { parsePhoneNumber } from 'libphonenumber-js/max';

const orderQueue = express.Router();

orderQueue.get('/', auth, async (req, res) => {
  const data = {
    name: '',
    date: '',
    time: '',
    activeOrderTable: '',
    lastOrdersTable: '',
    empErr: '',
    usersTable: '',
  };

  data.name = req.cookies.username;

  const today = new Date();
  const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  data.date = today.toLocaleDateString('en-US', dateOptions);

  const activeOrders = await getActiveOrders();
  if (activeOrders.length) {
    data.activeOrderTable = createOrdersTable(activeOrders, 'active');
  } else {
    data.activeOrderTable = null;
  }

  const lastOrders = await getLastOrders();
  if (lastOrders.length) {
    data.lastOrdersTable = createOrdersTable(lastOrders, 'last');
  } else {
    data.lastOrdersTable = null;
  }

  //employee error from employee input
  if (req.session.empErr) {
    data.empErr = await req.session.empErr;
    //we can now delete
    delete req.session.empErr;
  }

  if (req.session.userSearch) {
    const foundUsers = await req.session.userSearch;
    if (foundUsers.length) {
      data.usersTable = createUserTable(foundUsers);
      delete req.session.userSearch;
    } else {
      data.empErr = 'No Users Found!';
    }
  }

  const source = fs.readFileSync('./templates/orderQueue.html');
  const template = handlebars.compile(source.toString());
  const page = template(data);
  res.send(page);
});

orderQueue.get('/create', async (req, res) => {
  if (req.query.phoneNum == '') {
    //create an error message in session
    req.session.empErr = 'Please enter a phone number to look a number up.';
    res.redirect('/order-queue');
  } else if (req.query.phoneNum) {
    // need to parse number first
    const phoneNumber = parsePhoneNumber(`${req.query.phoneNum}`, 'US');
    if (!phoneNumber.isValid()) {
      req.session.empErr = 'Not a valid US phone number or no number was entered. Please try again.';
    } else {
      //valid, need to search for it.
      //data returned needs to be an array of userIDs b/c numbers are NOT UNIQUE
      const usersArr = await getUsersByPhone(phoneNumber.formatNational());
      //set session var to usersArr
      req.session.userSearch = usersArr;
    }
    res.redirect('/order-queue');
  } else {
    //create an error message in session
    req.session.empErr = 'Unknown Error. Please try again.';
    res.redirect('/order-queue');
  }
});

//changes order status
orderQueue.post('/:orderNum', async (req, res) => {
  const orderNum = req.params.orderNum;
  if (req.body['complete']) {
    await updateOrderStatus(orderNum, 'complete');
  } else if (req.body['cancel']) {
    await updateOrderStatus(orderNum, 'cancelled');
  } else {
    await updateOrderStatus(orderNum, 'active');
  }

  //redirect to og url
  res.redirect('/order-queue');
});

//directs employee to ordering system with correct userID sent
orderQueue.post('/new-order/:userID', async (req, res) => {
  const userID = req.params.userID;
  if (req.body.searchNew) {
    res.redirect('/order-queue');
  } else if (req.body.createOrder) {
    res.redirect(`/order/${userID}`);
  } else {
    console.log('hit');
    res.redirect(`/order/guest`);
  }
});

//fn to return array of active orders
async function getActiveOrders() {
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const orders = client.db().collection('orders');

  return orders.find({ status: 'active' }).toArray();
}

//fn to return array of last 15 orders
async function getLastOrders() {
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const orders = client.db().collection('orders');
  //sorts all returned orders by reverse of orderNum, then cuts to 15 entries, places into array
  return await orders
    .find({ status: { $nin: ['active', undefined] } })
    .sort({ orderNum: -1 })
    .limit(15)
    .toArray();
}

//fn to create order table. Takes an array of order objects.
function createOrdersTable(orderArr, type) {
  // table headers
  let table = `<table class="w-[1500px] h-fit mr-auto ml-auto border-black border-2  bg-clearWhite rounded-sm"><thead class="text-clearWhite bg-black font-sans text-2xl rounded-t-sm"><tr class="rounded-t-sm"><th class="border-r border-white border-dashed pt-1 pb-2 pl-2 pr-2 rounded-tl-sm">Order Number</th><th class="border-r border-white border-dashed p-2">Order</th><th class="border-r border-white border-dashed pt-1 pb-2 pl-2 pr-2">Notes</th><th class="border-r border-white border-dashed pt-1 pb-2 pl-2 pr-2">Phone</th><th class="border-r border-white border-dashed pt-1 pb-2 pl-2 pr-2">Total Items</th><th class="border-r border-white border-dashed pt-2 pb-2 pl-3 pr-3">Price</th><th class="border-r border-white border-dashed pt-1 pb-2 pl-2 pr-2">Tax</th><th class="border-r border-white border-dashed pt-1 pb-2 pl-2 pr-2">Total</th><th class="border-r border-white border-dashed pt-1 pb-2 pl-2 pr-2">Status</th><th class="rounded-tr-sm border-l border-white border-dashed pt-1 pb-2 pl-2 pr-2">Actions</th></tr></thead><tbody>`;

  orderArr.forEach((orderObj) => {
    table += `<tr class="border-b border-dashed"><th class="border-r border-black border-dashed pt-1 pb-2 pl-2 pr-2">${orderObj.orderNum}</th><th class="border-r border-black border-dashed p-2 text-left">`;

    orderObj.order.forEach((pizza) => {
      table += `${pizza.numberOrdered} x ${pizza.size}in pizza with `;

      if (pizza.toppings.length) {
        pizza.toppings.forEach((topping) => {
          if (pizza.toppings.indexOf(topping) === pizza.toppings.length - 1) {
            table += `${topping}`;
          } else {
            table += `${topping}, `;
          }
        });
      } else {
        table += `no toppings`;
      }

      table += ` ($${pizza.cost})</br>`;
    });

    table += `</th><th class="border-r border-black border-dashed pt-1 pb-2 pl-2 pr-2 whitespace-normal text-left w-fit">${orderObj.notes}</th><th class="border-r border-black border-dashed pt-1 pb-2 pl-2 pr-2 w-[160px]">${orderObj.phoneNumber}</th><th class="border-r border-black border-dashed pt-1 pb-2 pl-2 pr-2">${orderObj.itemCount}</th><th class="border-r border-black border-dashed pt-1 pb-2 pl-2 pr-2">$${orderObj.price}</th><th class="border-r border-black border-dashed pt-1 pb-2 pl-2 pr-2">`;

    const tax = +orderObj.price * +orderObj.taxRate;
    const total = +tax + +orderObj.price;

    table += `$${tax.toFixed(
      2
    )}</th><th class="border-r border-black border-dashed pt-1 pb-2 pl-2 pr-2">$${total.toFixed(
      2
    )}</th><th class="border-r border-black border-dashed pt-1 pb-2 pl-2 pr-2">${
      orderObj.status
    }</th><th class="border-black border-dashed pt-1 pb-2 pl-2 pr-2">`;

    if (type === 'active') {
      table += `<form action="/order-queue/${orderObj.orderNum}" method="post" class="flex flex-col gap-2"><input class="p-1 w-full bg-yellow rounded-sm cursor-pointer hover:bg-green" type="submit" id="complete" name="complete" value="Complete Order"/><input class="p-1 w-full bg-yellow rounded-sm cursor-pointer  hover:bg-orange" type="submit" id="cancel" name="cancel" value="Cancel Order"/></form></th></tr>`;
    } else {
      table += `<form action="/order-queue/${orderObj.orderNum}" method="post" class="flex flex-col gap-2"><input class="p-1 w-full bg-yellow rounded-sm cursor-pointer hover:bg-green" type="submit" id="readd" name="readd" value="Return Order to Queue"/></form></th></tr>`;
    }
  });

  table += `</tbody></table>`;

  return table;
}

//fn to create a table of found users
function createUserTable(userArr) {
  let table = `<table class="w-[1500px] h-fit mr-auto ml-auto border-black border-2  bg-clearWhite rounded-sm"><thead class="text-clearWhite bg-black font-sans text-2xl rounded-t-sm"><tr class="rounded-t-sm"><th class="border-r border-white border-dashed pt-1 pb-2 pl-2 pr-2 rounded-tl-sm">Name</th><th class="border-r border-white border-dashed p-2">Address</th><th class="border-r border-white border-dashed pt-1 pb-2 pl-2 pr-2">Phone</th><th class="border-r border-white border-dashed pt-1 pb-2 pl-2 pr-2">Email</th><th class="border-r border-white border-dashed pt-1 pb-2 pl-2 pr-2">Actions</th></tr></thead><tbody>`;

  userArr.forEach((userObj) => {
    table += `<tr class="border-b border-dashed"><th class="border-r border-black border-dashed pt-1 pb-2 pl-2 pr-2">${userObj.name}</th><th class="border-r border-black border-dashed p-2 text-left">${userObj.address}</th><th class="border-r border-black border-dashed pt-1 pb-2 pl-2 pr-2">${userObj.phone}</th><th class="border-r border-black border-dashed pt-1 pb-2 pl-2 pr-2">${userObj.email}</th><th class="border-black border-dashed pt-1 pb-2 pl-2 pr-2"><form action="/order-queue/new-order/${userObj.userid}" method="post" class="flex flex-col gap-2"><input class="p-1 w-full bg-yellow rounded-sm cursor-pointer hover:bg-green" type="submit" id="createOrder" name="createOrder" value="Create Order for User"/></form></th></tr>`;
  });

  table += `</tbody></table>`;

  return table;
}

//fn to set order status to complete
async function updateOrderStatus(orderNum, statusStr) {
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const orders = client.db().collection('orders');
  //orderNum in DB is an INT
  await orders.updateOne({ orderNum: Number(orderNum) }, { $set: { status: statusStr } });
  client.close();
}

//fn to search for users by phone number
async function getUsersByPhone(number) {
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const users = client.db().collection('users');
  const usersArr = await users
    .find({ phone: number }, { projection: { _id: 0, userid: 1, address: 1, email: 1, name: 1, phone: 1 } })
    .toArray();
  client.close();
  return usersArr;
}

export default orderQueue;
