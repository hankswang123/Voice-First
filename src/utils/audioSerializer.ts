/**
 * Audio serialization utilities for chat history persistence.
 * Handles conversion of audio data between runtime format (Int16Array, Blob URLs)
 * and storage format (base64 strings).
 */

/**
 * Convert Int16Array to base64 string for storage.
 * Used for formatted.audio from Realtime API items.
 */
export function int16ArrayToBase64(array: Int16Array): string {
  if (!array || array.length === 0) return '';

  // Convert Int16Array to Uint8Array for base64 encoding
  const uint8Array = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);

  // Convert to base64
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string back to Int16Array for playback.
 */
export function base64ToInt16Array(base64: string): Int16Array | null {
  if (!base64) return null;

  try {
    const binary = atob(base64);
    const uint8Array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      uint8Array[i] = binary.charCodeAt(i);
    }

    // Ensure proper alignment for Int16Array
    const buffer = uint8Array.buffer;
    return new Int16Array(buffer);
  } catch (e) {
    console.error('Failed to decode base64 to Int16Array:', e);
    return null;
  }
}

/**
 * Convert a Blob URL to base64 data URL.
 * Used for formatted.file.url from Realtime API items.
 */
export async function blobUrlToBase64(blobUrl: string): Promise<string> {
  if (!blobUrl || !blobUrl.startsWith('blob:')) {
    return '';
  }

  try {
    const response = await fetch(blobUrl);
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error('Failed to convert blob URL to base64:', e);
    return '';
  }
}

/**
 * Convert base64 data URL back to an object URL for playback.
 */
export function base64ToObjectUrl(base64DataUrl: string): string {
  if (!base64DataUrl) return '';

  try {
    // Extract the base64 data and MIME type
    const match = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      console.error('Invalid base64 data URL format');
      return '';
    }

    const mimeType = match[1];
    const base64Data = match[2];

    // Decode base64 to binary
    const binary = atob(base64Data);
    const uint8Array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      uint8Array[i] = binary.charCodeAt(i);
    }

    // Create blob and object URL
    const blob = new Blob([uint8Array], { type: mimeType });
    return URL.createObjectURL(blob);
  } catch (e) {
    console.error('Failed to convert base64 to object URL:', e);
    return '';
  }
}

/**
 * Check if a string is a valid base64 encoded string.
 */
export function isValidBase64(str: string): boolean {
  if (!str) return false;
  try {
    return btoa(atob(str)) === str;
  } catch (e) {
    return false;
  }
}

/**
 * Convert Int16Array PCM audio to a WAV blob URL for playback.
 * Used when we have raw audio data but no pre-encoded file URL.
 * @param audioData Int16Array of 16-bit PCM audio samples
 * @param sampleRate Sample rate of the audio (default 24000 for Realtime API)
 * @returns Object URL pointing to a WAV blob, or empty string on failure
 */
export function int16ArrayToWavUrl(audioData: Int16Array, sampleRate: number = 24000): string {
  if (!audioData || audioData.length === 0) return '';

  try {
    // WAV file header parameters
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = audioData.length * (bitsPerSample / 8);
    const headerSize = 44;
    const fileSize = headerSize + dataSize;

    // Create buffer for WAV file
    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);

    // Helper to write string to DataView
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    // RIFF chunk descriptor
    writeString(0, 'RIFF');
    view.setUint32(4, fileSize - 8, true); // File size - 8 bytes for RIFF header
    writeString(8, 'WAVE');

    // fmt sub-chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // Sub-chunk size (16 for PCM)
    view.setUint16(20, 1, true); // Audio format (1 = PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data sub-chunk
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Write audio data
    const dataView = new Int16Array(buffer, headerSize);
    dataView.set(audioData);

    // Create blob and URL
    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  } catch (e) {
    console.error('Failed to convert Int16Array to WAV URL:', e);
    return '';
  }
}
