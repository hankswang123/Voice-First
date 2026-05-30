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
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT NOT NULL,
      pref_key TEXT NOT NULL,
      pref_value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, pref_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id);
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

// ==================== USER PREFERENCES ====================

export function getUserPreference(userId, key) {
  const db = getDb();
  const row = db.prepare(`
    SELECT pref_value FROM user_preferences WHERE user_id = ? AND pref_key = ?
  `).get(userId, key);
  return row ? row.pref_value : null;
}

export function setUserPreference(userId, key, value) {
  const db = getDb();
  db.prepare(`
    INSERT INTO user_preferences (user_id, pref_key, pref_value, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, pref_key) DO UPDATE SET
      pref_value = excluded.pref_value,
      updated_at = CURRENT_TIMESTAMP
  `).run(userId, key, value);
}

export function getAllUserPreferences(userId) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT pref_key, pref_value FROM user_preferences WHERE user_id = ?
  `).all(userId);
  const prefs = {};
  for (const row of rows) {
    prefs[row.pref_key] = row.pref_value;
  }
  return prefs;
}

// ==================== SEED ====================

export async function seedUsers() {
  const db = getDb();

  const existing = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (existing.count > 0) return;

  const adminHash = await bcrypt.hash('admin123', BCRYPT_ROUNDS);
  const testHash = await bcrypt.hash('test1234', BCRYPT_ROUNDS);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name, role, email_verified)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), 'admin@voice-first.app', adminHash, 'Admin', 'admin', 1);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name, role, email_verified)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), 'test@voice-first.app', testHash, 'Test User', 'user', 1);

  console.log('[SEED] Created default users: admin@voice-first.app / admin123, test@voice-first.app / test1234');
}
