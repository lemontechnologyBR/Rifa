const express = require('express');
const router = express.Router();
const googleAuthController = require('../controllers/googleAuthController');

router.get('/google/organizador/callback', googleAuthController.callback);

module.exports = router;
