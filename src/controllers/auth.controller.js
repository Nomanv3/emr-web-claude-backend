import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import config from '../config/env.js';

const generateTokens = (user) => {
  const payload = {
    userId: user.userId,
    organizationId: user.organizationId,
    branchId: user.branchId,
    role: user.role,
    username: user.username,
  };

  const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
  const refreshToken = jwt.sign(payload, config.jwtRefreshSecret, { expiresIn: config.jwtRefreshExpiresIn });

  return { token, refreshToken };
};

const buildSafeUser = (user) => ({
  userId: user.userId,
  username: user.username,
  name: user.name,
  email: user.email,
  role: user.role,
  organizationId: user.organizationId,
  branchId: user.branchId,
  qualifications: user.qualifications,
  registrationNumber: user.registrationNumber,
  specialization: user.specialization,
});

export const login = async (req, res, next) => {
  try {
    // Accept username (preferred) or email for back-compat.
    const { username, email, password } = req.body;
    const identifier = (username || email || '').toString().trim().toLowerCase();

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
        code: 'VALIDATION_ERROR',
      });
    }

    // Lookup by username first, fall back to email.
    let user = await User.findOne({ username: identifier, isActive: true });
    if (!user) {
      user = await User.findOne({ email: identifier, isActive: true });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
        code: 'AUTH_INVALID',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
        code: 'AUTH_INVALID',
      });
    }

    const { token, refreshToken } = generateTokens(user);

    return res.json({
      success: true,
      data: {
        user: buildSafeUser(user),
        token,
        refreshToken,
      },
      message: 'Login successful',
    });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required',
        code: 'VALIDATION_ERROR',
      });
    }

    const decoded = jwt.verify(refreshToken, config.jwtRefreshSecret);
    const user = await User.findOne({ userId: decoded.userId, isActive: true });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token',
        code: 'AUTH_INVALID',
      });
    }

    const token = jwt.sign(
      {
        userId: user.userId,
        organizationId: user.organizationId,
        branchId: user.branchId,
        role: user.role,
        username: user.username,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    return res.json({
      success: true,
      data: { token },
      message: 'Token refreshed',
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Refresh token has expired',
        code: 'AUTH_EXPIRED',
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token',
        code: 'AUTH_INVALID',
      });
    }
    next(error);
  }
};

export const logout = async (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
};

export const register = async (req, res, next) => {
  try {
    const {
      username,
      email,
      password,
      name,
      role,
      organizationId,
      branchId,
      qualifications,
      registrationNumber,
      specialization,
    } = req.body;

    if (!username || !email || !password || !name || !role) {
      return res.status(400).json({
        success: false,
        message: 'username, email, password, name, and role are required',
        code: 'VALIDATION_ERROR',
      });
    }

    const existingUser = await User.findOne({
      $or: [
        { username: username.toLowerCase() },
        { email: email.toLowerCase() },
      ],
    });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Username or email already in use',
        code: 'DUPLICATE_USER',
      });
    }

    const user = new User({
      username,
      email,
      passwordHash: password,
      name,
      role,
      organizationId,
      branchId,
      qualifications,
      registrationNumber,
      specialization,
    });

    await user.save();

    res.status(201).json({
      success: true,
      data: {
        userId: user.userId,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      message: 'User registered successfully',
    });
  } catch (error) {
    next(error);
  }
};
