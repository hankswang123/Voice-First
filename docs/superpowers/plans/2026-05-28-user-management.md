# User Management Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user registration, login, JWT auth, email verification, admin role, and per-user chat history binding to Voice-First.

**Architecture:** Extend existing SQLite database with 3 new tables (users, email_verifications, refresh_tokens). Add auth middleware + routes as separate files. Modify chat history to scope by user_id. Extract chat routes from local-server.js into routes/chat.js.

**Tech Stack:** Node.js, Express 5, better-sqlite3, bcrypt, jsonwebtoken, uuid

---

## File Structure

```
db/
  chatHistory.js       # MODIFY: add user_id to sessions, update query functions
  auth.js              # CREATE: users, email_verifications, refresh_tokens CRUD

middleware/
  auth.js              # CREATE: authenticate, requireAdmin middleware

routes/
  auth.js              # CREATE: /api/auth/* endpoints
  chat.js              # CREATE: extracted chat routes with auth

local-server.js        # MODIFY: mount auth + chat routes, update CORS
.env                   # MODIFY: add JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
package.json           # MODIFY: add bcrypt dependency
```

---

### Task 1: Install bcrypt

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install bcrypt**

```bash
cd C:\Users\I058700\Repo\Voice-First
npm install bcrypt
```

- [ ] **Step 2: Verify installation**

```bash
node -e "import('bcrypt').then(b => console.log('bcrypt OK'))"
```

Expected: `bcrypt OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add bcrypt for password hashing"
```

---

### Task 2: Create db/auth.js — Database Layer

**Files:**
- Create: `db/auth.js`

This module handles all user-related database operations. It shares the same SQLite connection as chatHistory.js via `getDb()`.

- [ ] **Step 1: Create db/auth.js with schema initialization**

```javascript
// db/auth.js
import { getDb } from './chatHistory.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 10;

// ==================== SCHEMA ====================

export function initAuthSchema() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      email_verified INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS email_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      code TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT 'register',
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      device_info TEXT,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
  `);
}

// ==================== USER OPERATIONS ====================

export async function createUser(email, password, displayName = null) {
  const db = getDb();
  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name)
    VALUES (?, ?, ?, ?)
  `).run(id, email.toLowerCase(), passwordHash, displayName);

  return { id, email: email.toLowerCase(), displayName, role: 'user', emailVerified: false };
}

export function getUserByEmail(email) {
  const db = getDb();
  return db.prepare(`
    SELECT id, email, password_hash as passwordHash, display_name as displayName,
           role, email_verified as emailVerified, created_at as createdAt
    FROM users WHERE email = ?
  `).get(email.toLowerCase());
}

export function getUserById(id) {
  const db = getDb();
  return db.prepare(`
    SELECT id, email, display_name as displayName, role,
           email_verified as emailVerified, created_at as createdAt
    FROM users WHERE id = ?
  `).get(id);
}

export async function verifyPassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

export function setEmailVerified(userId) {
  const db = getDb();
  db.prepare(`
    UPDATE users SET email_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(userId);
}

export async function updatePassword(userId, newPassword) {
  const db = getDb();
  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  db.prepare(`
    UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(hash, userId);
}

// ==================== EMAIL VERIFICATION ====================

function generateSixDigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function createVerificationCode(userId, purpose = 'register') {
  const db = getDb();
  const code = generateSixDigitCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

  // Invalidate previous unused codes for same purpose
  db.prepare(`
    UPDATE email_verifications SET used = 1
    WHERE user_id = ? AND purpose = ? AND used = 0
  `).run(userId, purpose);

  db.prepare(`
    INSERT INTO email_verifications (user_id, code, purpose, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(userId, code, purpose, expiresAt);

  return code;
}

export function verifyCode(email, code, purpose = 'register') {
  const db = getDb();
  const user = getUserByEmail(email);
  if (!user) return { valid: false, error: 'User not found' };

  const now = new Date().toISOString();
  const record = db.prepare(`
    SELECT id FROM email_verifications
    WHERE user_id = ? AND code = ? AND purpose = ? AND used = 0 AND expires_at > ?
    ORDER BY id DESC LIMIT 1
  `).get(user.id, code, purpose, now);

  if (!record) return { valid: false, error: 'Invalid or expired code' };

  db.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?').run(record.id);
  return { valid: true, userId: user.id };
}

// ==================== REFRESH TOKENS ====================

export async function createRefreshToken(userId, deviceInfo = null) {
  const db = getDb();
  const id = uuidv4();
  const rawToken = uuidv4() + uuidv4(); // 64 hex chars
  const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

  db.prepare(`
    INSERT INTO refresh_tokens (id, user_id, token_hash, device_info, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, tokenHash, deviceInfo, expiresAt);

  return { id, rawToken, expiresAt };
}

export async function verifyRefreshToken(rawToken) {
  const db = getDb();
  const now = new Date().toISOString();

  // Get all non-expired tokens
  const tokens = db.prepare(`
    SELECT id, user_id as userId, token_hash as tokenHash, expires_at as expiresAt
    FROM refresh_tokens WHERE expires_at > ?
  `).all(now);

  for (const token of tokens) {
    const match = await bcrypt.compare(rawToken, token.tokenHash);
    if (match) {
      // Delete this token (single-use rotation)
      db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(token.id);
      return { valid: true, userId: token.userId };
    }
  }

  return { valid: false };
}

export function deleteRefreshToken(tokenId) {
  const db = getDb();
  db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(tokenId);
}

export function deleteAllRefreshTokens(userId) {
  const db = getDb();
  db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
}
```

- [ ] **Step 2: Verify module loads without errors**

```bash
node -e "import('./db/auth.js').then(m => console.log('auth.js exports:', Object.keys(m))).catch(e => console.error(e))"
```

Expected: exports list with createUser, getUserByEmail, etc.

- [ ] **Step 3: Commit**

```bash
git add db/auth.js
git commit -m "feat: add auth database layer (users, email_verifications, refresh_tokens)"
```

---

### Task 3: Create middleware/auth.js — JWT Middleware

**Files:**
- Create: `middleware/auth.js`

- [ ] **Step 1: Create middleware/auth.js**

```javascript
// middleware/auth.js
import jwt from 'jsonwebtoken';

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || 'voice-first-dev-secret';

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
    req.user = { userId: decoded.userId, email: decoded.email, role: decoded.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Optional auth: sets req.user if token present, but doesn't fail if missing
export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
    req.user = { userId: decoded.userId, email: decoded.email, role: decoded.role };
  } catch {
    req.user = null;
  }
  next();
}
```

- [ ] **Step 2: Commit**

```bash
mkdir -p middleware
git add middleware/auth.js
git commit -m "feat: add JWT auth middleware (authenticate, requireAdmin, optionalAuth)"
```

---

### Task 4: Create routes/auth.js — Auth Endpoints

**Files:**
- Create: `routes/auth.js`

- [ ] **Step 1: Create routes/auth.js**

```javascript
// routes/auth.js
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import * as authDb from '../db/auth.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || 'voice-first-dev-secret';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_DAYS = 30;

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
    // We don't have the refresh token id here, but we can delete all for user
    // In a more refined version, the client would send the refresh token id
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

export default router;
```

- [ ] **Step 2: Commit**

```bash
mkdir -p routes
git add routes/auth.js
git commit -m "feat: add auth routes (register, login, logout, verify, refresh, forgot-password, reset-password)"
```

---

### Task 5: Modify db/chatHistory.js — Add user_id

**Files:**
- Modify: `db/chatHistory.js`

- [ ] **Step 1: Add migration logic and update schema**

In `initSchema()`, after the existing `CREATE TABLE IF NOT EXISTS sessions`, add migration for old databases and update query functions.

Add this migration block after the sessions table creation (after line 40):

```javascript
  // Migration: add user_id to sessions if missing (old database)
  const sessionColumns = db.prepare("PRAGMA table_info(sessions)").all();
  const hasUserId = sessionColumns.some(c => c.name === 'user_id');
  if (!hasUserId) {
    db.exec(`ALTER TABLE sessions ADD COLUMN user_id TEXT NOT NULL DEFAULT 'anonymous'`);
  }
```

Add this index after the existing indexes (line 77):

```javascript
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
```

- [ ] **Step 2: Update getOrCreateSession to accept userId**

Replace the `getOrCreateSession` function (lines 103-133):

```javascript
export function getOrCreateSession(magazineName, userId = 'anonymous') {
  const db = getDb();

  let session = db.prepare(`
    SELECT id, magazine_name as magazineName, user_id as userId,
           created_at as createdAt, updated_at as updatedAt, is_active as isActive
    FROM sessions
    WHERE magazine_name = ? AND user_id = ? AND is_active = 1
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(magazineName, userId);

  if (session) {
    return session;
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO sessions (id, magazine_name, user_id) VALUES (?, ?, ?)
  `).run(id, magazineName, userId);

  return {
    id,
    magazineName,
    userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isActive: 1
  };
}
```

- [ ] **Step 3: Update listSessions to support userId filtering**

Replace the `listSessions` function (lines 83-100):

```javascript
export function listSessions(magazineName = null, userId = null) {
  const db = getDb();

  if (magazineName && userId) {
    return db.prepare(`
      SELECT id, magazine_name as magazineName, user_id as userId,
             created_at as createdAt, updated_at as updatedAt, is_active as isActive
      FROM sessions
      WHERE magazine_name = ? AND user_id = ?
      ORDER BY updated_at DESC
    `).all(magazineName, userId);
  }

  if (userId) {
    return db.prepare(`
      SELECT id, magazine_name as magazineName, user_id as userId,
             created_at as createdAt, updated_at as updatedAt, is_active as isActive
      FROM sessions
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `).all(userId);
  }

  if (magazineName) {
    return db.prepare(`
      SELECT id, magazine_name as magazineName, user_id as userId,
             created_at as createdAt, updated_at as updatedAt, is_active as isActive
    FROM sessions
      WHERE magazine_name = ?
      ORDER BY updated_at DESC
    `).all(magazineName);
  }

  return db.prepare(`
    SELECT id, magazine_name as magazineName, user_id as userId,
           created_at as createdAt, updated_at as updatedAt, is_active as isActive
    FROM sessions
    ORDER BY updated_at DESC
  `).all();
}
```

- [ ] **Step 4: Add session ownership check function**

Add this new function after `deleteSession`:

```javascript
export function getSessionUserId(sessionId) {
  const db = getDb();
  const session = db.prepare('SELECT user_id as userId FROM sessions WHERE id = ?').get(sessionId);
  return session ? session.userId : null;
}
```

- [ ] **Step 5: Commit**

```bash
git add db/chatHistory.js
git commit -m "feat: add user_id to sessions, update query functions for per-user scoping"
```

---

### Task 6: Create routes/chat.js — Extract Chat Routes

**Files:**
- Create: `routes/chat.js`
- Modify: `local-server.js` (remove chat routes, mount new router)

- [ ] **Step 1: Create routes/chat.js with auth middleware**

```javascript
// routes/chat.js
import { Router } from 'express';
import * as chatDb from '../db/chatHistory.js';
import { authenticate, requireAdmin, optionalAuth } from '../middleware/auth.js';

const router = Router();

// All chat routes require authentication
router.use(authenticate);

// List sessions for current user (admin can use ?all=true)
router.get('/sessions', (req, res) => {
  try {
    const { magazine, all } = req.query;

    if (all === 'true' && req.user.role === 'admin') {
      const sessions = chatDb.listSessions(magazine || null, null);
      return res.json({ sessions });
    }

    const sessions = chatDb.listSessions(magazine || null, req.user.userId);
    res.json({ sessions });
  } catch (error) {
    console.error("Error listing sessions:", error);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// Get or create active session for a magazine (scoped to current user)
router.get('/sessions/:magazine', (req, res) => {
  try {
    const { magazine } = req.params;
    const session = chatDb.getOrCreateSession(magazine, req.user.userId);
    res.json(session);
  } catch (error) {
    console.error("Error getting/creating session:", error);
    res.status(500).json({ error: 'Failed to get/create session' });
  }
});

// Delete a session (ownership check or admin)
router.delete('/sessions/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionUserId = chatDb.getSessionUserId(sessionId);

    if (!sessionUserId) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (sessionUserId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    chatDb.deleteSession(sessionId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting session:", error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// Clear session history (ownership check)
router.post('/sessions/:sessionId/clear', (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionUserId = chatDb.getSessionUserId(sessionId);

    if (!sessionUserId) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (sessionUserId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    chatDb.clearSession(sessionId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error clearing session:", error);
    res.status(500).json({ error: 'Failed to clear session' });
  }
});

// Get messages (ownership check)
router.get('/sessions/:sessionId/messages', (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionUserId = chatDb.getSessionUserId(sessionId);

    if (!sessionUserId) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (sessionUserId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = chatDb.getMessages(sessionId);
    res.json({ messages });
  } catch (error) {
    console.error("Error getting messages:", error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Add message (ownership check)
router.post('/sessions/:sessionId/messages', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { role, text } = req.body;

    if (!role || text === undefined) {
      return res.status(400).json({ error: 'Missing required fields: role and text' });
    }

    const sessionUserId = chatDb.getSessionUserId(sessionId);
    if (!sessionUserId) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (sessionUserId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const message = chatDb.addMessage(sessionId, role, text);
    res.json(message);
  } catch (error) {
    console.error("Error adding message:", error);
    res.status(500).json({ error: 'Failed to add message' });
  }
});

// Get items (ownership check)
router.get('/sessions/:sessionId/items', (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionUserId = chatDb.getSessionUserId(sessionId);

    if (!sessionUserId) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (sessionUserId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const items = chatDb.getItems(sessionId);
    res.json({ items });
  } catch (error) {
    console.error("Error getting items:", error);
    res.status(500).json({ error: 'Failed to get items' });
  }
});

// Add/update item (ownership check)
router.post('/sessions/:sessionId/items', (req, res) => {
  try {
    const { sessionId } = req.params;
    const item = req.body;

    if (!item.id) {
      return res.status(400).json({ error: 'Missing required field: id' });
    }

    const sessionUserId = chatDb.getSessionUserId(sessionId);
    if (!sessionUserId) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (sessionUserId !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const savedItem = chatDb.addItem(sessionId, item);
    res.json(savedItem);
  } catch (error) {
    console.error("Error adding item:", error);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add routes/chat.js
git commit -m "feat: extract chat routes with auth middleware and ownership checks"
```

---

### Task 7: Modify local-server.js — Mount New Routes

**Files:**
- Modify: `local-server.js`

- [ ] **Step 1: Add imports and mount routes**

After the existing imports (after line 17), add:

```javascript
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import { initAuthSchema } from './db/auth.js';
```

After the chatDb import block (after line 34), add:

```javascript
// Initialize auth schema
if (dbAvailable) {
  try {
    initAuthSchema();
    console.log('Auth schema initialized');
  } catch (error) {
    console.warn('Auth schema initialization failed:', error.message);
  }
}
```

After the CORS settings (after line 57), update CORS to include DELETE method and add routes:

```javascript
app.use(cors({
    origin: ['http://localhost:3000', 'https://hankswang123.github.io/Audio-Copilot/'],
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
```

Before the SPA fallback (before line 1002), mount the new routes:

```javascript
// Auth routes (public)
app.use('/api/auth', authRoutes);

// Chat routes (authenticated)
app.use('/api/chat', chatRoutes);
```

- [ ] **Step 2: Remove old chat routes from local-server.js**

Remove all the old chat route handlers from local-server.js (lines 873-1000 — all the `app.get/delete/post("/api/chat/...")` blocks).

- [ ] **Step 3: Update .env with JWT secrets**

Add to `.env`:

```
JWT_ACCESS_SECRET=your-random-secret-here-change-in-production
JWT_REFRESH_SECRET=your-other-random-secret-here-change-in-production
```

- [ ] **Step 4: Verify server starts**

```bash
cd C:\Users\I058700\Repo\Voice-First
node local-server.js
```

Expected: Server starts on port 3001, no errors.

- [ ] **Step 5: Commit**

```bash
git add local-server.js .env
git commit -m "feat: mount auth and chat routes, update CORS, add JWT env vars"
```

---

### Task 8: Manual Integration Test

**Files:** None (testing only)

- [ ] **Step 1: Start the server**

```bash
cd C:\Users\I058700\Repo\Voice-First
node local-server.js
```

- [ ] **Step 2: Test registration**

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234","displayName":"Test User"}'
```

Expected: `{ "message": "Verification code sent to your email" }` (check server logs for the code)

- [ ] **Step 3: Test email verification**

Replace `CODE` with the 6-digit code from server logs:

```bash
curl -X POST http://localhost:3001/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","code":"CODE"}'
```

Expected: `{ "message": "Email verified successfully" }`

- [ ] **Step 4: Test login**

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234"}'
```

Expected: returns `accessToken`, `refreshToken`, and `user` object

- [ ] **Step 5: Test authenticated chat access**

Save the accessToken from login, then:

```bash
curl -X GET http://localhost:3001/api/chat/sessions/test-magazine \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Expected: returns session object with `userId` matching the registered user

- [ ] **Step 6: Test unauthorized access (no token)**

```bash
curl -X GET http://localhost:3001/api/chat/sessions
```

Expected: `401 { "error": "No token provided" }`

- [ ] **Step 7: Test token refresh**

```bash
curl -X POST http://localhost:3001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'
```

Expected: returns new `accessToken` and `refreshToken`

- [ ] **Step 8: Stop server and commit**

```bash
# Ctrl+C to stop server
git add -A
git commit -m "feat: user management module complete - auth, per-user chat scoping"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Install bcrypt | package.json |
| 2 | Auth database layer | db/auth.js (create) |
| 3 | JWT middleware | middleware/auth.js (create) |
| 4 | Auth routes | routes/auth.js (create) |
| 5 | Chat DB user_id | db/chatHistory.js (modify) |
| 6 | Chat routes extraction | routes/chat.js (create) |
| 7 | Server integration | local-server.js (modify) |
| 8 | Integration test | manual testing |
