const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (token == null) {
    return res.sendStatus(401); // Unauthorized if no token
  }

  jwt.verify(token, 'YOUR_SECRET_KEY', (err, user) => { // Use the same secret key as in login
    if (err) {
      return res.sendStatus(403); // Forbidden if token is invalid
    }
    req.user = user; // Add decoded user payload to request object
    next(); // Proceed to the next middleware or route handler
  });
}

module.exports = authenticateToken;
