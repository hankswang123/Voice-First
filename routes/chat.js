// routes/chat.js
import { Router } from 'express';
import * as chatDb from '../db/chatHistory.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

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
