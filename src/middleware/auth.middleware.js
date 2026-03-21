// AUTH DISABLED — all routes are open for development
// TODO: Re-enable JWT auth before production deployment

// import jwt from 'jsonwebtoken';
// import config from '../config/env.js';

export const authenticate = (req, res, next) => {
  // Bypass auth — inject a default dev user
  req.user = {
    userId: 'dev-doctor-001',
    role: 'doctor',
    email: 'doctor@emr.dev',
    name: 'Dr. Dev User',
    organizationId: 'org-001',
    branchId: 'branch-001',
  };
  next();
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    // Bypass authorization — always allow
    next();
  };
};
