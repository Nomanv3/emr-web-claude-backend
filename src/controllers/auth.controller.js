import config from '../config/env.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { query, execute } from '../config/mysql.js';
import { mapUserRow, mapUserRowWithHash } from '../db/mappers/user.mapper.js';

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
    let [rows] = await query(
      'SELECT * FROM `user` WHERE username = ? AND is_active = 1 LIMIT 1',
      [identifier]
    );
    if (!rows.length) {
      [rows] = await query(
        'SELECT * FROM `user` WHERE email = ? AND is_active = 1 LIMIT 1',
        [identifier]
      );
    }
    if (!rows.length) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
        code: 'AUTH_INVALID',
      });
    }

    const userWithHash = mapUserRowWithHash(rows[0]);
    const isMatch = await bcrypt.compare(password, userWithHash.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
        code: 'AUTH_INVALID',
      });
    }

    const safeUser = mapUserRow(rows[0]);
    const { token, refreshToken } = generateTokens(safeUser);
    return res.json({
      success: true,
      data: { user: buildSafeUser(safeUser), token, refreshToken },
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

    const [[row]] = await query(
      'SELECT * FROM `user` WHERE user_id = ? AND is_active = 1 LIMIT 1',
      [decoded.userId]
    );
    if (!row) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token',
        code: 'AUTH_INVALID',
      });
    }

    const user = mapUserRow(row);
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
    return res.json({ success: true, data: { token }, message: 'Token refreshed' });

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

    const uLower = username.toLowerCase();
    const eLower = email.toLowerCase();

    // Duplicate check.
    const [[existing]] = await query(
      'SELECT user_id FROM `user` WHERE username = ? OR email = ? LIMIT 1',
      [uLower, eLower]
    );
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Username or email already in use',
        code: 'DUPLICATE_USER',
      });
    }

    // Hash password (replicates Mongoose pre('save') hook).
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    await execute(
      `INSERT INTO \`user\`
         (user_id, organization_id, branch_id, username, email, password_hash,
          role, name, qualifications, registration_number, specialization, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        userId,
        organizationId || null,
        branchId || null,
        uLower,
        eLower,
        passwordHash,
        role,
        name,
        qualifications || null,
        registrationNumber || null,
        specialization || null,
      ]
    );

    return res.status(201).json({
      success: true,
      data: { userId, username: uLower, email: eLower, name, role },
      message: 'User registered successfully',
    });

  } catch (error) {
    next(error);
  }
};
