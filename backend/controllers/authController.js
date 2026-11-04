const jwt = require('jsonwebtoken');
const User = require('../models/User');
const resets = require('../services/passwordResetService');

// Generate JWT token
const generateToken = (userId, role) => {
  return jwt.sign({ id: userId, role: role }, process.env.JWT_SECRET, {
    expiresIn: '7d'
  });
};

// @route   POST /api/auth/register
// @desc    Register a new user
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Basic validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please provide name, email, and password' });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Create user (password gets hashed automatically by the pre-save hook)
    const user = await User.create({ name, email, password });

    const token = generateToken(user._id, user.role);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @route   POST /api/auth/login
// @desc    Login user and return JWT
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = generateToken(user._id, user.role);

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @route   POST /api/auth/forgot-password
// @desc    Email a reset link. The answer is the same whether or not the email has an account.
const forgotPassword = async (req, res) => {
  try {
    await resets.requestReset(req.body.email);
    res.status(200).json({ message: 'If that email has an account, a reset link is on its way. It works for 30 minutes.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @route   POST /api/auth/reset-password
// @desc    Set a new password using the emailed token
const resetPassword = async (req, res) => {
  try {
    await resets.resetPassword(req.body.token, req.body.password);
    res.status(200).json({ message: 'Your password was changed. Please log in with the new one.' });
  } catch (error) {
    if (error instanceof resets.ResetError) return res.status(error.status).json({ message: error.message });
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { registerUser, loginUser, forgotPassword, resetPassword };