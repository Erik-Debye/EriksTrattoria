'use strict';
import express from 'express';
import handlebars from 'handlebars';
import fs from 'fs';
import { MongoClient } from 'mongodb';
import auth from '../middleware/auth.js';

const dashboard = express.Router();

dashboard.get('/', auth, async (req, res) => {
  const data = {
    name: '',
    date: '',
    time: '',
    activeOrderTable: '',
    completedOrderTable: '',
  };

  data.name = req.cookies.username;

  const today = new Date();
  const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  data.date = today.toLocaleDateString('en-US', dateOptions);

  const userid = Number(req.session.userid);

  const activeOrders = await getTheirActiveOrders(userid);
  if (activeOrders.length) {
    data.activeOrderTable = createTheirOrdersTable(activeOrders, 'active');
  } else {
    data.activeOrderTable = null;
  }

  const completeOrders = await getTheirCompleteOrders(userid);
  if (completeOrders.length) {
    data.completedOrderTable = createTheirOrdersTable(completeOrders, 'complete');
  } else {
    data.completedOrderTable = null;
  }

  const source = fs.readFileSync('./templates/dashboard.html');
  const template = handlebars.compile(source.toString());
  const page = template(data);
  res.send(page);
});

//fn to return array of active orders
async function getTheirActiveOrders(id) {
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const orders = client.db().collection('orders');

  return orders.find({ userid: id, status: 'active' }).toArray();
}

//fn to return array of completed orders
async function getTheirCompleteOrders(id) {
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const orders = client.db().collection('orders');

  return orders.find({ userid: id, status: { $in: ['complete', 'cancelled'] } }).toArray();
}

//fn to create order table. Takes an array of order objects.
function createTheirOrdersTable(orderArr, type) {
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
    )}</th><th class="border-r border-black border-dashed pt-1 pb-2 pl-2 pr-2">${orderObj.status}</th>`;

    if (type === 'active') {
      table += `<th class="border-black border-dashed pt-1 pb-2 pl-2 pr-2"><div class="p-1 w-[120px] bg-green text-black rounded-sm"/>In Progress!</div></th></tr>`;
    } else {
      table += `<th class="border-black border-dashed pt-1 pb-2 pl-2 pr-2"><form action="/order/reorder/${orderObj.orderNum}" method="get" class="flex flex-col gap-2"><input class="p-1 w-full bg-yellow rounded-sm cursor-pointer hover:bg-green" type="submit" id="reorder" name="reorder" value="Reorder"/></form></th></tr>`;
    }
  });

  table += `</tbody></table>`;

  return table;
}

export default dashboard;
