# User Management Module Design

**Date:** 2026-05-28
**Status:** Draft
**Scope:** User registration, login, email verification, JWT auth, admin role, chat history per-user binding

---

## 1. Overview

Add a user management system to Voice-First. Currently, all data is shared across all clients with no user concept. This design introduces user accounts with JWT authentication, email verification, role-based access (user/admin), and per-user chat history scoping.

### Goals
- User registration with email + password
- JWT-based authentication (access + refresh token)
- Email verification (6-digit code)
- Admin role with visibility over all users' data
- Chat history bound to individual users
- Backward compatibility with existing `anonymous` data

### Non-Goals (for now)
- OAuth/social login
- Password recovery via email link (uses same 6-digit code flow)
- Fine-grained RBAC permissions
- Payment integration (future phase, but schema accommodates it)

---

## 2. Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Database | SQLite (existing) | Matches current stack, zero additional deps, Render free-tier friendly |
| Auth | JWT (access + refresh) | Stateless, lightweight, no session store needed |
| Password hashing | bcrypt (salt rounds: 10) | Industry standard, Node.js native support |
| Email verification | 6-digit code, 5-min expiry | Simple, low-friction for education app |
| Refresh token storage | bcrypt hash in DB | Protects against DB leak |

---

## 3. Database Schema

### 3.1 New Tables

#### `users`

```sql
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
```

- `role`: `'user'` or `'admin'`
- `email_verified`: 0 = unverified, 1 = verified
- `password_hash`: bcrypt hash of plaintext password

#### `email_verifications`

```sql
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
```

- `purpose`: `'register'` or `'reset_password'`
- Only the latest unused code per (user_id, purpose) is valid

#### `refresh_tokens`

```sql
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  device_info TEXT,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
```

- `token_hash`: bcrypt hash of the raw refresh token string
- Supports multiple devices (one row per device)

### 3.2 Modified Tables

#### `sessions` (add `user_id`)

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'anonymous',
  magazine_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active INTEGER DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
```

`messages` and `items` tables remain unchanged — they reference `session_id` and inherit user binding indirectly.

### 3.3 Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
```

---

## 4. API Design

### 4.1 Authentication Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | No | Register with email + password |
| POST | `/api/auth/login` | No | Login, returns access + refresh token |
| POST | `/api/auth/logout` | Yes | Revoke refresh token |
| POST | `/api/auth/verify-email` | No | Verify email with 6-digit code |
| POST | `/api/auth/resend-code` | No | Resend verification code |
| POST | `/api/auth/refresh` | No | Exchange refresh token for new access token |
| POST | `/api/auth/forgot-password` | No | Send password reset code |
| POST | `/api/auth/reset-password` | No | Reset password with code |
| GET | `/api/auth/me` | Yes | Get current user info |

### 4.2 Chat History Endpoints (Modified)

All `/api/chat/sessions/*` endpoints require authentication. `user_id` is extracted from JWT.

| Method | Path | Change |
|--------|------|--------|
| GET | `/api/chat/sessions` | Filter by user_id; admin can use `?all=true` |
| GET | `/api/chat/sessions/:magazine` | Include user_id in lookup/creation |
| DELETE | `/api/chat/sessions/:sessionId` | Verify session belongs to user (admin bypass) |
| POST | `/api/chat/sessions/:sessionId/clear` | Verify session belongs to user |
| GET/POST | `/api/chat/sessions/:sessionId/messages` | Verify session belongs to user |
| GET/POST | `/api/chat/sessions/:sessionId/items` | Verify session belongs to user |

### 4.3 Magazine Endpoints (Modified)

| Method | Path | Change |
|--------|------|--------|
| GET | `/api/magazines` | No change (public) |
| GET | `/api/magazines/enriched` | Requires admin role |

---

## 5. Authentication Flow

### 5.1 JWT Token Specs

- **Access Token**: JWT, 15-minute expiry, payload `{ userId, email, role }`
- **Refresh Token**: Random 64-byte hex string, stored as bcrypt hash in DB, 30-day expiry

### 5.2 Flows

#### Register
```
POST /api/auth/register { email, password, displayName }
→ Validate email format
→ Validate password (min 8 chars, letters + digits)
→ bcrypt hash password
→ INSERT INTO users
→ Generate 6-digit code, INSERT INTO email_verifications (purpose='register')
→ Send verification email
→ Return { message: "Verification email sent" }
```

#### Verify Email
```
POST /api/auth/verify-email { email, code }
→ Find latest unused code where purpose='register' and expires_at > now
→ If valid: UPDATE users SET email_verified=1, UPDATE email_verifications SET used=1
→ Return { message: "Email verified" }
```

#### Login
```
POST /api/auth/login { email, password }
→ Find user by email
→ bcrypt compare password
→ If email_verified=0: reject with 403
→ Generate access token (15min) + refresh token (30 days)
→ Hash refresh token, INSERT INTO refresh_tokens
→ Return { accessToken, refreshToken, user: { id, email, role, displayName } }
```

#### Refresh Token
```
POST /api/auth/refresh { refreshToken }
→ Hash the provided token
→ Find matching row in refresh_tokens where expires_at > now
→ If valid: generate new access token
→ Return { accessToken }
```

#### Logout
```
POST /api/auth/logout (requires auth)
→ DELETE FROM refresh_tokens WHERE id = current token id
→ Return { message: "Logged out" }
```

#### Forgot Password
```
POST /api/auth/forgot-password { email }
→ Find user by email
→ Generate 6-digit code, INSERT INTO email_verifications (purpose='reset_password')
→ Send email
→ Return { message: "If email exists, a reset code has been sent" }
```

#### Reset Password
```
POST /api/auth/reset-password { email, code, newPassword }
→ Find latest unused code where purpose='reset_password' and expires_at > now
→ bcrypt hash new password
→ UPDATE users SET password_hash = ?, email_verified = 1
→ UPDATE email_verifications SET used = 1
→ DELETE FROM refresh_tokens WHERE user_id = ? (invalidate all sessions)
→ Return { message: "Password reset. Please login." }
```

---

## 6. Auth Middleware

```javascript
// authenticate: extracts and verifies JWT, sets req.user
function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
    req.user = { userId: decoded.userId, email: decoded.email, role: decoded.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// requireAdmin: checks role after authenticate
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}
```

### Permission Matrix

| Operation | Unauthenticated | User | Admin |
|-----------|----------------|------|-------|
| Register/Login | Yes | Yes | Yes |
| View own chat history | No | Yes | Yes |
| View all chat history | No | No | Yes (`?all=true`) |
| View enriched magazines | No | No | Yes |
| Delete own session | No | Yes | Yes |
| Delete any session | No | No | Yes |

---

## 7. Data Migration

### Backward Compatibility

The `initSchema()` function handles migration automatically:

```sql
-- Check if user_id column exists (old DB)
-- If not: ALTER TABLE sessions ADD COLUMN user_id TEXT NOT NULL DEFAULT 'anonymous'
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
```

### Anonymous Data

- Existing chat records get `user_id = 'anonymous'`
- Unauthenticated users continue to work, sessions stored under `anonymous`
- No automatic migration of anonymous data to logged-in users (future enhancement)

---

## 8. Security Considerations

- **Password policy**: min 8 chars, at least 1 letter + 1 digit
- **bcrypt salt rounds**: 10
- **Refresh token**: stored as bcrypt hash, never plaintext in DB
- **Rate limiting**: max 1 verification code per minute per purpose per email
- **CORS**: add auth endpoints to allowed origins
- **Token rotation**: refresh token is single-use (new token issued on each refresh)
- **Session invalidation**: password reset deletes all refresh tokens for the user

---

## 9. File Structure (Planned)

```
db/
  chatHistory.js       # Modified: add user_id to sessions schema + migration
  auth.js              # New: users, email_verifications, refresh_tokens CRUD
  migrate.js           # New: schema migration logic

middleware/
  auth.js              # New: authenticate, requireAdmin middleware

routes/
  auth.js              # New: /api/auth/* endpoints
  chat.js              # New: extracted from local-server.js, adds auth middleware
```

---

## 10. Future Considerations

- **Payment integration**: `users` table is ready for subscription/billing fields
- **User preferences**: can add `user_preferences` table linked to user_id
- **Magazine access control**: can add `user_magazine_access` table for paid content
- **Audit logging**: can add `audit_log` table for admin actions
