/**
 * Frontend API client for chat history operations.
 * Handles communication with the server's chat history endpoints.
 */

import { type ItemType } from '../lib/realtime/index.js';
import {
  int16ArrayToBase64,
  base64ToInt16Array,
  blobUrlToBase64,
  base64ToObjectUrl,
  int16ArrayToWavUrl
} from './audioSerializer';

// ==================== TYPES ====================

export interface ChatSession {
  id: string;
  magazineName: string;
  createdAt: string;
  updatedAt: string;
  isActive: number;
}

export interface ChatMessage {
  id: number;
  sessionId: string;
  role: "user" | "assistant" | "code" | "audio" | "read_aloud";
  text: string;
  createdAt: string;
}

export interface SerializedItem {
  id: string;
  sessionId: string;
  role?: string;
  type?: string;
  status?: string;
  formattedAudio?: string;  // base64
  formattedText?: string;
  formattedTranscript?: string;
  formattedFileData?: string;  // base64 data URL
  contentJson?: string;
  createdAt: string;
}

// ==================== SESSION OPERATIONS ====================

/**
 * Get or create an active session for a magazine.
 */
export async function getOrCreateSession(magazine: string): Promise<ChatSession> {
  const response = await fetch(`/api/chat/sessions/${encodeURIComponent(magazine)}`);
  if (!response.ok) {
    throw new Error(`Failed to get/create session: ${response.statusText}`);
  }
  return response.json();
}

/**
 * List all sessions, optionally filtered by magazine.
 */
export async function listSessions(magazine?: string): Promise<ChatSession[]> {
  const url = magazine
    ? `/api/chat/sessions?magazine=${encodeURIComponent(magazine)}`
    : '/api/chat/sessions';
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to list sessions: ${response.statusText}`);
  }
  const data = await response.json();
  return data.sessions;
}

/**
 * Delete a session and all its data.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const response = await fetch(`/api/chat/sessions/${sessionId}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    throw new Error(`Failed to delete session: ${response.statusText}`);
  }
}

/**
 * Clear session history but keep the session.
 */
export async function clearSession(sessionId: string): Promise<void> {
  const response = await fetch(`/api/chat/sessions/${sessionId}/clear`, {
    method: 'POST'
  });
  if (!response.ok) {
    throw new Error(`Failed to clear session: ${response.statusText}`);
  }
}

// ==================== MESSAGE OPERATIONS ====================

/**
 * Load all messages for a session.
 */
export async function loadMessages(sessionId: string): Promise<ChatMessage[]> {
  const response = await fetch(`/api/chat/sessions/${sessionId}/messages`);
  if (!response.ok) {
    throw new Error(`Failed to load messages: ${response.statusText}`);
  }
  const data = await response.json();
  return data.messages;
}

/**
 * Save a message to a session.
 */
export async function saveMessage(
  sessionId: string,
  role: string,
  text: string
): Promise<ChatMessage> {
  const response = await fetch(`/api/chat/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, text })
  });
  if (!response.ok) {
    throw new Error(`Failed to save message: ${response.statusText}`);
  }
  return response.json();
}

// ==================== ITEM OPERATIONS ====================

/**
 * Load all items for a session.
 */
export async function loadItems(sessionId: string): Promise<SerializedItem[]> {
  const response = await fetch(`/api/chat/sessions/${sessionId}/items`);
  if (!response.ok) {
    throw new Error(`Failed to load items: ${response.statusText}`);
  }
  const data = await response.json();
  return data.items;
}

/**
 * Serialize and save an item to a session.
 * Converts audio data to base64 for storage.
 */
export async function saveItem(
  sessionId: string,
  item: ItemType
): Promise<SerializedItem> {
  // Serialize the item for storage
  const serialized: Partial<SerializedItem> = {
    id: item.id,
    role: item.role,
    type: item.type,
    status: (item as any).status,  // status may not exist on all ItemType variants
    formattedText: item.formatted?.text || undefined,
    formattedTranscript: item.formatted?.transcript || undefined
  };

  // Debug logging
  console.log('[ChatHistory] Saving item:', {
    id: item.id,
    role: item.role,
    status: (item as any).status,
    hasAudio: item.formatted?.audio?.length > 0,
    hasFile: !!item.formatted?.file,
    fileUrl: item.formatted?.file?.url?.substring(0, 50),
    transcript: item.formatted?.transcript?.substring(0, 30)
  });

  // Serialize audio data (Int16Array -> base64)
  if (item.formatted?.audio && item.formatted.audio.length > 0) {
    serialized.formattedAudio = int16ArrayToBase64(item.formatted.audio);
    console.log('[ChatHistory] Serialized audio, length:', serialized.formattedAudio?.length);
  }

  // Serialize audio file (Blob URL -> base64 data URL)
  if (item.formatted?.file?.url) {
    try {
      console.log('[ChatHistory] Converting file URL:', item.formatted.file.url.substring(0, 50));
      serialized.formattedFileData = await blobUrlToBase64(item.formatted.file.url);
      console.log('[ChatHistory] Serialized file data, length:', serialized.formattedFileData?.length);
    } catch (e) {
      console.warn('[ChatHistory] Failed to serialize audio file URL:', e);
    }
  }

  // Serialize content array as JSON
  const itemContent = (item as any).content;
  if (itemContent && itemContent.length > 0) {
    // Don't include raw audio in content JSON to save space
    const contentForStorage = itemContent.map((c: any) => {
      if (c.type === 'input_audio' || c.type === 'audio') {
        return { ...c, audio: undefined };
      }
      return c;
    });
    serialized.contentJson = JSON.stringify(contentForStorage);
  }

  const response = await fetch(`/api/chat/sessions/${sessionId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serialized)
  });
  if (!response.ok) {
    throw new Error(`Failed to save item: ${response.statusText}`);
  }
  return response.json();
}

// ==================== DESERIALIZATION ====================

/**
 * Deserialize a stored item back to ItemType format.
 * Converts base64 back to audio data.
 */
export function deserializeItem(serialized: SerializedItem): ItemType {
  const item: any = {
    id: serialized.id,
    object: 'realtime.item',
    role: serialized.role as 'user' | 'assistant' | 'system' | undefined,
    type: serialized.type as 'message' | 'function_call' | 'function_call_output' | undefined,
    status: serialized.status as 'in_progress' | 'completed' | 'incomplete' | undefined,
    formatted: {
      text: serialized.formattedText || '',
      transcript: serialized.formattedTranscript || '',
      audio: undefined,
      tool: undefined,
      output: undefined,
      file: undefined
    },
    content: []
  };

  // Deserialize audio data (base64 -> Int16Array)
  let audioArray: Int16Array | null = null;
  if (serialized.formattedAudio) {
    audioArray = base64ToInt16Array(serialized.formattedAudio);
    if (audioArray) {
      item.formatted!.audio = audioArray;
    }
  }

  // Deserialize audio file (base64 data URL -> Object URL)
  if (serialized.formattedFileData) {
    const objectUrl = base64ToObjectUrl(serialized.formattedFileData);
    if (objectUrl) {
      item.formatted!.file = { url: objectUrl };
    }
  }

  // If we have audio data but no file URL, create one from the audio data
  // This handles cases where the original blob URL wasn't saved (e.g., user audio)
  if (audioArray && audioArray.length > 0 && !item.formatted?.file?.url) {
    const wavUrl = int16ArrayToWavUrl(audioArray, 24000);
    if (wavUrl) {
      item.formatted!.file = { url: wavUrl };
      console.log('[ChatHistory] Created WAV URL from audio data for item:', serialized.id);
    }
  }

  // Deserialize content JSON
  if (serialized.contentJson) {
    try {
      item.content = JSON.parse(serialized.contentJson);
    } catch (e) {
      console.warn('Failed to parse content JSON:', e);
    }
  }

  return item as ItemType;
}

/**
 * Deserialize an array of stored items.
 */
export function deserializeItems(items: SerializedItem[]): ItemType[] {
  return items.map(deserializeItem);
}
