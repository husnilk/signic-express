const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes"); // Import auth routes
const userRoutes = require("./routes/userRoutes"); // Import user routes

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

// Middleware to parse JSON bodies
app.use(express.json()); // Add this before route handlers

// Mount authentication routes
// app.use("/api/auth", authRoutes); // Add this
app.use("/api/users", userRoutes); // Mount user routes

// Simple root route
app.get("/", (req, res) => {
  res.send("API Running");
});

// Basic error handling middleware
// This should be defined after all other app.use() and routes calls
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

// Start the server
app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
