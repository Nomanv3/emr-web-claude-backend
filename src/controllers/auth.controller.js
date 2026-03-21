import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import config from '../config/env.js';

const generateTokens = (user) => {
  const payload = {
    userId: user.userId,
    role: user.role,
    organizationId: user.organizationId,
    branchId: user.branchId,
  };

  const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
  const refreshToken = jwt.sign(payload, config.jwtRefreshSecret, { expiresIn: config.jwtRefreshExpiresIn });

  return { token, refreshToken };
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' },
      });
    }

    const user = await User.findOne({ email: email.toLowerCase(), isActive: true });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
    }

    const { token, refreshToken } = generateTokens(user);

    res.json({
      success: true,
      data: {
        token,
        refreshToken,
        expiresIn: 86400,
        user: {
          userId: user.userId,
          name: user.name,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
          branchId: user.branchId,
          qualifications: user.qualifications,
          registrationNumber: user.registrationNumber,
          specialization: user.specialization,
        },
      },
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
        error: { code: 'VALIDATION_ERROR', message: 'Refresh token is required' },
      });
    }

    const decoded = jwt.verify(refreshToken, config.jwtRefreshSecret);
    const user = await User.findOne({ userId: decoded.userId, isActive: true });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid refresh token' },
      });
    }

    const token = jwt.sign(
      { userId: user.userId, role: user.role, organizationId: user.organizationId, branchId: user.branchId },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    res.json({
      success: true,
      data: { token, expiresIn: 86400 },
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired refresh token' },
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
    const { email, password, name, role, organizationId, branchId, qualifications, registrationNumber, specialization } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE_EMAIL', message: 'Email already in use' },
      });
    }

    const user = new User({
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
      data: { userId: user.userId, email: user.email, name: user.name, role: user.role },
      message: 'User registered successfully',
    });
  } catch (error) {
    next(error);
  }
};
