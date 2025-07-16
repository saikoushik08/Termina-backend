// backend/server.js

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const getMeaningRoute = require('./routes/getMeaning');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Use the getMeaning route for word meaning API
app.use('/api/getMeaning', getMeaningRoute);

// Simple health check endpoint
app.get('/', (req, res) => {
  res.send('✅ Word Helper API is running.');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
