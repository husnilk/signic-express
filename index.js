const express = require('express');
const cors = require('cors');
const authRoutes = require('./authRoutes'); // Import auth routes

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

// Middleware to parse JSON bodies
app.use(express.json()); // Add this before route handlers

// Mount authentication routes
app.use('/auth', authRoutes); // Add this

// Define a simple route
app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Start the server
app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
