// routes/auth.js
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import * as authDb from '../db/auth.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || 'voice-first-dev-secret';
const ACCESS_TOKEN_EXPIRY = '15m';

// Simple email format check
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Password policy: min 8 chars, at least 1 letter and 1 digit
function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
}

function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters with letters and numbers' });
    }

    const existing = authDb.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user = await authDb.createUser(email, password, displayName || null);
    const code = authDb.createVerificationCode(user.id, 'register');

    // TODO: send email with code (for now, log it)
    console.log(`[AUTH] Verification code for ${email}: ${code}`);

    res.status(201).json({ message: 'Verification code sent to your email' });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/verify-email
router.post('/verify-email', (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code are required' });
    }

    const result = authDb.verifyCode(email, code, 'register');
    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }

    authDb.setEmailVerified(result.userId);
    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// POST /api/auth/resend-code
router.post('/resend-code', (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = authDb.getUserByEmail(email);
    if (!user) {
      // Don't reveal whether email exists
      return res.json({ message: 'If the email exists, a new code has been sent' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    const code = authDb.createVerificationCode(user.id, 'register');
    console.log(`[AUTH] Verification code for ${email}: ${code}`);

    res.json({ message: 'If the email exists, a new code has been sent' });
  } catch (error) {
    console.error('Resend code error:', error);
    res.status(500).json({ error: 'Failed to resend code' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = authDb.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await authDb.verifyPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.emailVerified) {
      return res.status(403).json({ error: 'Please verify your email first' });
    }

    const accessToken = generateAccessToken(user);
    const refresh = await authDb.createRefreshToken(user.id, req.headers['user-agent']);

    res.json({
      accessToken,
      refreshToken: refresh.rawToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const result = await authDb.verifyRefreshToken(refreshToken);
    if (!result.valid) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const user = authDb.getUserById(result.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const accessToken = generateAccessToken(user);
    const refresh = await authDb.createRefreshToken(user.id, req.headers['user-agent']);

    res.json({ accessToken, refreshToken: refresh.rawToken });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, (req, res) => {
  try {
    authDb.deleteAllRefreshTokens(req.user.userId);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = authDb.getUserByEmail(email);
    if (user) {
      const code = authDb.createVerificationCode(user.id, 'reset_password');
      console.log(`[AUTH] Password reset code for ${email}: ${code}`);
    }

    // Always return same message to prevent email enumeration
    res.json({ message: 'If the email exists, a reset code has been sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, code, and new password are required' });
    }
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters with letters and numbers' });
    }

    const result = authDb.verifyCode(email, code, 'reset_password');
    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }

    await authDb.updatePassword(result.userId, newPassword);
    authDb.setEmailVerified(result.userId); // Also verify email on password reset
    authDb.deleteAllRefreshTokens(result.userId); // Invalidate all sessions

    res.json({ message: 'Password reset successful. Please login with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  try {
    const user = authDb.getUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// GET /api/auth/preferences
router.get('/preferences', authenticate, (req, res) => {
  try {
    const prefs = authDb.getAllUserPreferences(req.user.userId);
    res.json({ preferences: prefs });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

// PUT /api/auth/preferences
router.put('/preferences', authenticate, (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) {
      return res.status(400).json({ error: 'Preference key is required' });
    }
    authDb.setUserPreference(req.user.userId, key, value);
    res.json({ message: 'Preference saved' });
  } catch (error) {
    console.error('Set preference error:', error);
    res.status(500).json({ error: 'Failed to save preference' });
  }
});

export default router;
