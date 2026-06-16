require('dotenv').config();
const superAdminController = require('../controllers/superAdminController');

const req = { query: {}, session: { adminLogado: true, adminUsuario: 'admin' } };
const res = {
  locals: { csrfToken: 'test' },
  render(view, data) {
    console.log('render', view, 'keys', Object.keys(data));
    if (typeof data.fmtMoney !== 'function') throw new Error('fmtMoney missing');
    return require('express')().render(view, data, (err, html) => {
      if (err) throw err;
      console.log('OK', html.length);
    });
  }
};

superAdminController.dashboard(req, res).catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
