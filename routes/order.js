'use strict';
import express from 'express';
import handlebars from 'handlebars';
import fs from 'fs';
import { MongoClient } from 'mongodb';

const order = express.Router();

//intial GET request on page load
order.get('/', async (req, res) => {
  //handlebars obj
  const data = {
    orderTable: null,
  };

  //here we see if the session has an order num. This occurs when either a logged in user OR a guest has started an order, AND logged-in status has changed
  //if no session orderNum exsists, the current user/guest has not made an order yet OR theor was a change in logged-in status
  let orderNum = Number(req.session.orderNum) || null;

  //if session has the orderNum
  if (orderNum) {
    //grab the order from the db
    const order = await getOrder(Number(orderNum));
    //generate the order summary table
    data.orderTable = createTable(order);
  } //if the logged-in status changed AND a guest (now new user) or a logged-out guest had begun an order before logging in, we can grab the in progress order from cookies
  else if (req.cookies.orderNum) {
    orderNum = Number(req.cookies.orderNum);
    //we need to update new user (guest) orders with their userID, so we update the order regardless to ensure an id exists for a logged in user.
    await updateOrderUser(orderNum, Number(req.session.userid));
    //set session orderNum so next time we hit the other if statement
    req.session.orderNum = orderNum;
    //reset the cookie
    res.cookie('orderNum', '');
    //get order and make table
    const order = await getOrder(Number(orderNum));
    data.orderTable = createTable(order);
  }

  //grab template, fill, and send
  const source = fs.readFileSync('./templates/order.html');
  const template = handlebars.compile(source.toString());
  const page = template(data);
  res.send(page);
});

//this is the GET from the employee/manager dashboards
order.get('/:userID', async (req, res) => {
  const customerID = req.params.userID;
  req.session.customerid = Number(customerID);
  //reset orderNum. This happens if someone abandons the order without checking out (and goes to create a new one)
  //we also want to delete the unfinished order from the DB
  if (req.session.orderNum) {
    const order = getOrder(req.session.orderNum);
    if (order && !order.status) {
      await deleteOrder(req.session.orderNum);
      delete req.session.orderNum;
      res.cookie('orderNum', '', { expires: 0 });
    }
  }
  res.redirect('/order');
});

//This is from the customer dashboard for reorders
order.get('/reorder/:orderID', async (req, res) => {
  const reorderID = Number(req.params.orderID);

  //first, we need to clone the old order into a new order with a new number
  //lets create the new number
  const newOrderID = await createNewOrderNum();
  //lets clone the document (we'll change the id of the new one)
  await cloneOrder(reorderID, newOrderID);
  //once this is done, we can set the session.orderNum to the new ID
  req.session.orderNum = newOrderID;
  //redirect and regular GET should handle it from here
  res.redirect('/order');
});

//This is for delete pizza request
order.get('/delete/:pizzaIndex', async (req, res) => {
  const pizzaIndex = Number(req.params.pizzaIndex);
  const order = Number(req.session.orderNum);
  //pass to a function
  await rmvPizzaFromOrder(order, pizzaIndex);
  //redirect and regular GET should handle it from here
  res.redirect('/order');
});

//when form is submitted for a new pizza
order.post('/', async (req, res) => {
  //handlebars obj
  const data = {
    orderTable: null,
    orderError: null,
  };
  //check for form errors - make sure amount input is both a number && > 0
  if (!Number(req.body.amount) || Number(req.body.amount) <= 0) {
    //add an error message to handlebars
    data.orderError = 'Order Number must be more than 0, and it must be a number.';
    //get orderNum (no need to worry about cookies, because this is already handled in the GET)
    const orderNum = req.session.orderNum || null;
    if (orderNum) {
      //rebuild table if there was an order in progress
      const order = await getOrder(Number(orderNum));
      data.orderTable = createTable(order);
    }
    //grab template, fill, and send
    const source = fs.readFileSync('./templates/order.html');
    const template = handlebars.compile(source.toString());
    const page = template(data);
    res.send(page);
  } //if no errors on input, we then add to the existing order IF it exists
  else if (req.session.orderNum) {
    //grab the current, in progress, order
    const currOrder = await getOrder(Number(req.session.orderNum));
    //create a new pizza
    const pizza = {
      size: Number(req.body.size),
      toppings: req.body.toppings || [],
      numberOrdered: Number(req.body.amount),
      cost: 0,
    };
    //lets calculate cost
    const cost = findCost(pizza);
    //update pizza obj
    pizza.cost = Number(cost);
    //update the existing order with the userID (again, just to make sure it happens)
    if (req.session.userid && req.session.userRole != 'manager' && req.session.userRole != 'employee') {
      await updateOrderUser(req.session.userid);
    } else if (req.session.customerid) {
      await updateOrderUser(Number(req.session.customerid));
    } else {
      await updateOrderUser('guest');
    }
    //add new pizza to order in the DB
    await updateOrder(currOrder, pizza);
    //build the order table
    const order = await getOrder(req.session.orderNum);
    data.orderTable = createTable(order);
    //grab template, fill, and send
    const source = fs.readFileSync('./templates/order.html');
    const template = handlebars.compile(source.toString());
    const page = template(data);
    res.send(page);
  } //else, a order does not exist yet, so we need to build it
  else {
    //create a new order number
    const orderNum = await createNewOrderNum();
    //set session OrderNum to the new number
    req.session.orderNum = orderNum;
    //build pizza
    const pizza = {
      size: Number(req.body.size),
      toppings: req.body.toppings || [],
      numberOrdered: Number(req.body.amount),
      cost: 0,
    };
    //lets calculate cost
    const cost = findCost(pizza);
    //set cost in pizza obj
    pizza.cost = cost;
    //lets create the order
    if (req.session.userRole != 'manager' && req.session.userRole != 'employee') {
      await createNewOrder(orderNum, req.session.userid, pizza, req.body.amount, cost);
    } else {
      await createNewOrder(orderNum, req.session.customerid, pizza, req.body.amount, cost);
    }
    //build the order table
    const order = await getOrder(orderNum);
    data.orderTable = createTable(order);
    //grab template, fill, and send
    const source = fs.readFileSync('./templates/order.html');
    const template = handlebars.compile(source.toString());
    const page = template(data);
    res.send(page);
  }
});

//FN to build the order table
function createTable(order) {
  //inital html
  let table = `<h1 class="font-serif text-6xl pt-8 pb-4">Your Order!</h1>`;

  if (order.order.length) {
    //loop through every pizza in the order array
    order.order.forEach((pizza) => {
      table += `<div class="flex gap-10 items-center justify-center w-[80%] p-3 bg-red rounded-sm"><img class="w-[10%] min-w-[10%]" src="./src/images/pizza.png" alt="Icon of a pizza slice"><h2 class="p-1 text-2xl min-w-[26rem] w-[26rem]">${pizza.numberOrdered} x ${pizza.size}in with `;

      //loop through the toppings array
      //check if it even has toppings
      if (pizza.toppings.length < 1) {
        table += `no toppings`;
      } else {
        pizza.toppings.forEach((topping) => {
          //handle the last element differently to avoid handing commas
          if (pizza.toppings.indexOf(topping) === pizza.toppings.length - 1) {
            table += `${topping}`;
          } else {
            table += `${topping}, `;
          }
        });
      }
      //add the pizza cost (cost of the individual pizza)
      //also add a remove pizza order that places the index of that pizza into the request
      table += `</h2><div class='flex flex-col items-start justify-center'><h2 class="p-1 text-2xl self-start whitespace-nowrap">Price: $${
        pizza.cost
      }</h2><form action='/order/delete/${order.order.indexOf(
        pizza
      )}' method='GET' class='flex items-center justify-center'><input type='submit' id='deletepizza' class='cursor-pointer p-1 rounded-sm bg-white text-black hover:bg-orange hover:text-white' name='deletepizza' value='Remove Pizza'></form></div></div>`;
    });

    //finish off table with total cost (no tax yet)
    table += `<div class="flex justify-center items-end gap-12 text-white pb-4"><h3>Price: $${order.price}</h3><h4 class="text-lg">Tax not included</h4></div>
      <a class="pl-3 pr-3 pt-2 bg-white text-black hover:bg-green rounded-sm pb-2" href="/checkout">Proceed to Checkout</a>`;

    return table;
  } else {
    return null;
  }
}

//fn to get order
async function getOrder(number) {
  //create a client
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  //navigate db
  const database = client.db();
  const orders = database.collection('orders');
  //find the order
  const orderArr = await orders.find({ orderNum: number }).toArray();
  //we need to specify the first index because Mongo requires toArray. The reply initally is [{orderObj}] and we want to retreive just {orderObj}
  const order = orderArr[0];
  //close client connection
  client.close();
  return order;
}

//fn to delete unfinished orders
async function deleteOrder(num) {
  //create client
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const orders = client.db().collection('orders');

  await orders.deleteOne({ orderNum: num }),
    (error, result) => {
      if (error) console.log(error);
    };
  client.close();
}

//FN to create a newOrderNUm from the last order in DB
async function createNewOrderNum() {
  //create client
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  //navigate DB
  const database = client.db();
  const orders = database.collection('orders');
  //calculate the last order number by grabbing all orders, sorting backwards, and returning the first result in the array.
  const lastOrder = await orders.find().sort({ orderNum: -1 }).limit(1).toArray();
  //if array has length, grab the order number of the single object (first index) and add 1, else create the first order.
  const newOrderNum = lastOrder.length > 0 ? lastOrder[0].orderNum + 1 : 1;
  client.close();
  return newOrderNum;
}

//Fn to create a new order
async function createNewOrder(orderNum, userID, pizza, itemCount, cost) {
  //create client
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  //navigate db
  const database = client.db();
  const orders = database.collection('orders');
  //insert a new order (note the defaults here)
  //no status added either. WE ONLY WANT TO ADD STATUS TO ORDERS CONFIRMED OR MADE BY EMPLOYEES
  await orders.insertOne({
    orderNum: orderNum,
    userid: userID,
    order: [pizza],
    itemCount: Number(itemCount),
    price: Number(Number(cost).toFixed(2)),
    taxRate: null,
  });
  //close client
  client.close();
}

//fn to update an existing order
async function updateOrder(currOrder, newPizza) {
  //grab the pizzas from the existing order obj
  const currOrderPizzas = currOrder.order;
  //add to array of pizzas
  currOrderPizzas.push(newPizza);
  //update total price
  const newPrice = Number(currOrder.price) + Number(newPizza.cost);
  //update total item count
  const newItemCount = Number(currOrder.itemCount) + Number(newPizza.numberOrdered);
  //create a client
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  //navigate db
  const database = client.db();
  const orders = database.collection('orders');
  //update the order
  await orders.updateOne(
    { orderNum: currOrder.orderNum },
    { $set: { order: currOrderPizzas, price: Number(Number(newPrice).toFixed(2)), itemCount: newItemCount } }
  );
  //close connection
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
  return Number(cost.toFixed(2));
}

async function cloneOrder(oldID, newID) {
  //get the older document (as object)
  const oldOrderObj = await getOrder(oldID);
  //we need to create a duplicate, but also remove _id
  const { _id, ...newOrderObj } = oldOrderObj;
  //we need to update some of those fields as a reset
  newOrderObj.orderNum = newID;
  newOrderObj.taxRate = 0;
  newOrderObj.notes = '';
  newOrderObj.status = '';
  //insert into document
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const orders = client.db().collection('orders');
  await orders.insertOne({ ...newOrderObj });
  client.close();
}

async function rmvPizzaFromOrder(order, pizzaIndex) {
  //first get the order
  const orderObj = await getOrder(order);
  //first, we need to grab the number of pizzas we are removing
  const pizzaCount = orderObj.order[pizzaIndex].numberOrdered;
  const newItemCount = orderObj.itemCount - pizzaCount;
  //next, we will also need to update the price
  const pizzaCost = Number(orderObj.order[pizzaIndex].cost);
  const newCost = orderObj.price - pizzaCost;
  //remove pizza by accessing the array held by the order key
  orderObj.order.splice([pizzaIndex], 1);
  //update order
  const client = new MongoClient('mongodb://mongodb/erikstrattoria');
  await client.connect({ useNewUrlParser: true });
  const orders = client.db().collection('orders');
  //set order array to new array
  await orders.updateOne(
    { orderNum: order },
    { $set: { order: orderObj.order, itemCount: newItemCount, price: Number(Number(newCost.toFixed(2))) } }
  );
  client.close();
}

export default order;
