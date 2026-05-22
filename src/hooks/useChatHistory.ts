/**
 * Custom React hook for managing chat history persistence.
 * Provides loading, saving, and clearing functionality for chat sessions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { type ItemType } from '../lib/realtime/index.js';
import * as chatApi from '../utils/chatHistoryApi';
import { ChatMessage, SerializedItem } from '../utils/chatHistoryApi';

export interface UseChatHistoryOptions {
  magazine: string;
  autoSave?: boolean;  // default: true
}

export interface UseChatHistoryReturn {
  sessionId: string | null;
  isLoading: boolean;
  error: Error | null;

  // Loaded data
  savedMessages: Array<{ role: string; text: string }>;
  savedItems: ItemType[];

  // Actions
  saveMessage: (role: string, text: string) => Promise<void>;
  saveItem: (item: ItemType) => Promise<void>;
  clearHistory: () => Promise<void>;
  reloadHistory: () => Promise<void>;
}

export function useChatHistory(options: UseChatHistoryOptions): UseChatHistoryReturn {
  const { magazine, autoSave = true } = options;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [savedMessages, setSavedMessages] = useState<Array<{ role: string; text: string }>>([]);
  const [savedItems, setSavedItems] = useState<ItemType[]>([]);

  // Track saved item IDs to avoid duplicates
  const savedItemIds = useRef<Set<string>>(new Set());

  // Load session and history on mount or magazine change
  useEffect(() => {
    if (!magazine) return;

    let cancelled = false;

    async function loadHistory() {
      setIsLoading(true);
      setError(null);

      try {
        // Get or create session
        const session = await chatApi.getOrCreateSession(magazine);
        if (cancelled) return;

        setSessionId(session.id);

        // Load messages
        const messages = await chatApi.loadMessages(session.id);
        if (cancelled) return;

        setSavedMessages(messages.map(m => ({
          role: m.role,
          text: m.text
        })));

        // Load items
        const items = await chatApi.loadItems(session.id);
        if (cancelled) return;

        // Deserialize items
        const deserializedItems = chatApi.deserializeItems(items);
        setSavedItems(deserializedItems);

        // Track saved item IDs
        savedItemIds.current = new Set(items.map(i => i.id));

      } catch (e) {
        if (!cancelled) {
          console.error('Failed to load chat history:', e);
          setError(e as Error);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [magazine]);

  // Save a message
  const saveMessage = useCallback(async (role: string, text: string) => {
    if (!sessionId || !autoSave) return;

    try {
      await chatApi.saveMessage(sessionId, role, text);
    } catch (e) {
      console.error('Failed to save message:', e);
      // Don't throw - we don't want to break the chat if saving fails
    }
  }, [sessionId, autoSave]);

  // Save an item (audio conversation item)
  // Note: This will update existing items if they already exist (upsert behavior)
  const saveItem = useCallback(async (item: ItemType) => {
    if (!sessionId || !autoSave) return;

    try {
      await chatApi.saveItem(sessionId, item);
      savedItemIds.current.add(item.id);
    } catch (e) {
      console.error('Failed to save item:', e);
      // Don't throw - we don't want to break the chat if saving fails
    }
  }, [sessionId, autoSave]);

  // Clear history
  const clearHistory = useCallback(async () => {
    if (!sessionId) return;

    try {
      await chatApi.clearSession(sessionId);
      setSavedMessages([]);
      setSavedItems([]);
      savedItemIds.current.clear();
    } catch (e) {
      console.error('Failed to clear history:', e);
      throw e;
    }
  }, [sessionId]);

  // Reload history
  const reloadHistory = useCallback(async () => {
    if (!sessionId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Load messages
      const messages = await chatApi.loadMessages(sessionId);
      setSavedMessages(messages.map(m => ({
        role: m.role,
        text: m.text
      })));

      // Load items
      const items = await chatApi.loadItems(sessionId);
      const deserializedItems = chatApi.deserializeItems(items);
      setSavedItems(deserializedItems);

      // Track saved item IDs
      savedItemIds.current = new Set(items.map(i => i.id));

    } catch (e) {
      console.error('Failed to reload history:', e);
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  return {
    sessionId,
    isLoading,
    error,
    savedMessages,
    savedItems,
    saveMessage,
    saveItem,
    clearHistory,
    reloadHistory
  };
}
