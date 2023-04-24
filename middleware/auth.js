'use strict';

const auth = function (req, res, next) {
  const allowed = {
    '/dashboard': ['customer'],
    '/admin': ['manager'],
    '/order-queue': ['employee'],
  };

  const role = req.session.userRole;
  const path = req.originalUrl;

  if (req.session.isAuthorized && allowed[path].indexOf(role) !== -1) {
    next();
  } else if (req.session.isAuthorized) {
    role === 'manager'
      ? res.redirect('/admin')
      : role === 'employee'
      ? res.redirect('/order-queue')
      : res.redirect('/dashboard');
  } else {
    res.redirect('/login');
  }
};

export default auth;
