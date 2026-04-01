import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file location - ensure directory exists
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'chat_history.db');

// Initialize database connection
let db = null;

export function getDb() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

// Initialize database schema
function initSchema() {
  const db = getDb();

  // Sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      magazine_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1
    )
  `);

  // Messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  // Items table (for audio/realtime API items)
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT,
      type TEXT,
      status TEXT,
      formatted_audio TEXT,
      formatted_text TEXT,
      formatted_transcript TEXT,
      formatted_file_data TEXT,
      content_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  // Indexes for efficient queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_magazine ON sessions(magazine_name);
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_items_session ON items(session_id);
  `);
}

// ==================== SESSION OPERATIONS ====================

// List all sessions, optionally filtered by magazine
export function listSessions(magazineName = null) {
  const db = getDb();
  if (magazineName) {
    return db.prepare(`
      SELECT id, magazine_name as magazineName, created_at as createdAt,
             updated_at as updatedAt, is_active as isActive
      FROM sessions
      WHERE magazine_name = ?
      ORDER BY updated_at DESC
    `).all(magazineName);
  }
  return db.prepare(`
    SELECT id, magazine_name as magazineName, created_at as createdAt,
           updated_at as updatedAt, is_active as isActive
    FROM sessions
    ORDER BY updated_at DESC
  `).all();
}

// Get or create active session for a magazine
export function getOrCreateSession(magazineName) {
  const db = getDb();

  // First try to find an active session
  let session = db.prepare(`
    SELECT id, magazine_name as magazineName, created_at as createdAt,
           updated_at as updatedAt, is_active as isActive
    FROM sessions
    WHERE magazine_name = ? AND is_active = 1
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(magazineName);

  if (session) {
    return session;
  }

  // Create a new session
  const id = uuidv4();
  db.prepare(`
    INSERT INTO sessions (id, magazine_name) VALUES (?, ?)
  `).run(id, magazineName);

  return {
    id,
    magazineName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isActive: 1
  };
}

// Delete a session and all its data
export function deleteSession(sessionId) {
  const db = getDb();
  db.prepare('DELETE FROM items WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

// Clear session history but keep the session
export function clearSession(sessionId) {
  const db = getDb();
  db.prepare('DELETE FROM items WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
  db.prepare(`
    UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(sessionId);
}

// ==================== MESSAGE OPERATIONS ====================

// Get all messages for a session
export function getMessages(sessionId) {
  const db = getDb();
  return db.prepare(`
    SELECT id, session_id as sessionId, role, text, created_at as createdAt
    FROM messages
    WHERE session_id = ?
    ORDER BY id ASC
  `).all(sessionId);
}

// Add a message to a session
export function addMessage(sessionId, role, text) {
  const db = getDb();

  const result = db.prepare(`
    INSERT INTO messages (session_id, role, text) VALUES (?, ?, ?)
  `).run(sessionId, role, text);

  // Update session timestamp
  db.prepare(`
    UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(sessionId);

  return {
    id: result.lastInsertRowid,
    sessionId,
    role,
    text,
    createdAt: new Date().toISOString()
  };
}

// ==================== ITEM OPERATIONS ====================

// Get all items for a session
export function getItems(sessionId) {
  const db = getDb();
  return db.prepare(`
    SELECT id, session_id as sessionId, role, type, status,
           formatted_audio as formattedAudio, formatted_text as formattedText,
           formatted_transcript as formattedTranscript,
           formatted_file_data as formattedFileData,
           content_json as contentJson, created_at as createdAt
    FROM items
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).all(sessionId);
}

// Add an item to a session
export function addItem(sessionId, item) {
  const db = getDb();

  // Check if item already exists
  const existing = db.prepare('SELECT id FROM items WHERE id = ?').get(item.id);
  if (existing) {
    // Update existing item
    db.prepare(`
      UPDATE items SET
        role = ?, type = ?, status = ?,
        formatted_audio = ?, formatted_text = ?, formatted_transcript = ?,
        formatted_file_data = ?, content_json = ?
      WHERE id = ?
    `).run(
      item.role || null,
      item.type || null,
      item.status || null,
      item.formattedAudio || null,
      item.formattedText || null,
      item.formattedTranscript || null,
      item.formattedFileData || null,
      item.contentJson || null,
      item.id
    );
  } else {
    // Insert new item
    db.prepare(`
      INSERT INTO items (id, session_id, role, type, status,
                         formatted_audio, formatted_text, formatted_transcript,
                         formatted_file_data, content_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      item.id,
      sessionId,
      item.role || null,
      item.type || null,
      item.status || null,
      item.formattedAudio || null,
      item.formattedText || null,
      item.formattedTranscript || null,
      item.formattedFileData || null,
      item.contentJson || null
    );
  }

  // Update session timestamp
  db.prepare(`
    UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(sessionId);

  return {
    id: item.id,
    sessionId,
    role: item.role,
    type: item.type,
    status: item.status,
    formattedAudio: item.formattedAudio,
    formattedText: item.formattedText,
    formattedTranscript: item.formattedTranscript,
    formattedFileData: item.formattedFileData,
    contentJson: item.contentJson,
    createdAt: new Date().toISOString()
  };
}

// Close database connection (for cleanup)
export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
