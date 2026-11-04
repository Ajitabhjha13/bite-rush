const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verifies JWT token and attaches user to req
const protect = async (req, res, next) => {
  let token;

  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      token = authHeader.split(' ')[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Attach user (without password) to the request
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({ message: 'User not found' });
      }

      // A password reset logs out every device: tokens issued before the change are refused.
      if (req.user.password_changed_at && decoded.iat < Math.floor(req.user.password_changed_at.getTime() / 1000)) {
        return res.status(401).json({ message: 'Your password was changed. Please log in again.' });
      }

      next();
    } catch (error) {
      return res.status(401).json({ message: 'Not authorized, invalid token' });
    }
  } else {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }
};

// Restricts route to admin role only (use AFTER protect)
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ message: 'Access denied, admin only' });
  }
};

module.exports = { protect, adminOnly };