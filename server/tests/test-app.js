const express = require('express');
const cors = require('cors');
const spotRoutes = require('../routes/spots');
const claimRoutes = require('../routes/claim');
const faucetRoutes = require('../routes/faucet');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/spots', spotRoutes);
app.use('/api/claim', claimRoutes);
app.use('/api/faucet', faucetRoutes);

module.exports = app;
