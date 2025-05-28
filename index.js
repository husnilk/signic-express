const express = require('express');
const app = express();
const userRoutes = require('./userRoutes'); // Path should be correct

// Middleware to parse JSON request bodies
app.use(express.json());

// Simple root route
app.get('/', (req, res) => {
  res.send('API Running');
});

// Mount user routes
app.use('/api/users', userRoutes);

// Basic error handling middleware
// This should be defined after all other app.use() and routes calls
app.use((err, req, res, next) => {
  console.error(err.stack);
  // Send JSON response for errors to be more API-like
  res.status(err.status || 500).json({
    message: err.message || 'Something broke!',
    // Optionally include stack in development
    // stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Export the app for testing BEFORE app.listen is called
module.exports = app;

// Start the server only if this script is run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}
