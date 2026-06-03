import { useState, useCallback, useRef, useEffect } from 'react';
import { WavRecorder } from '../../lib/wavetools/lib/wav_recorder.js';
import { RealtimeClient } from '../../lib/realtime/index.js';
import { parsePronunciationScore } from './scoreParser.js';

// TEMPORARY: diagnostic logging while we validate the voice-flashcards pipeline
// in the browser. Search the DevTools console for "[voice-fc]" to filter.
// To disable: set VOICE_FC_DEBUG = false (or delete the related logs after validation).
const VOICE_FC_DEBUG = true;
const dlog = (...args: any[]) => { if (VOICE_FC_DEBUG) console.log('[voice-fc]', ...args); };

export interface PronunciationResult {
  score: number;        // 0-100
  feedback: string;     // encouraging message
  stars: number;        // 1-5
}

interface UseVoiceRecognitionOptions {
  realtimeClient?: RealtimeClient;
  expectedText?: string;
  onResult?: (result: PronunciationResult) => void;
  onTranscript?: (text: string) => void;
}

export function useVoiceRecognition({
  realtimeClient,
  expectedText,
  onResult,
  onTranscript,
}: UseVoiceRecognitionOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const wavRecorderRef = useRef<WavRecorder | null>(null);

  // Stable refs for callbacks so the listener-effect doesn't re-subscribe
  // every time the parent re-creates onResult / onTranscript.
  // Re-subscribing under React 18 StrictMode races with the parent's
  // RealtimeClient.reset() in DesktopLayout, which clears all listeners.
  const onResultRef = useRef(onResult);
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  // Initialize WavRecorder
  useEffect(() => {
    const recorder = new WavRecorder({ sampleRate: 24000 });
    wavRecorderRef.current = recorder;
    return () => {
      // Match the codebase convention (DesktopLayout uses the same guard):
      // only operate on the recorder if .begin() actually established a processor.
      // Without this guard, StrictMode's mount→unmount→remount triggers
      // pause() before begin() ever ran, throwing "Session ended".
      if (recorder.processor && recorder.recording) {
        recorder.pause().catch(() => { /* noop: best-effort cleanup */ });
      }
      if (wavRecorderRef.current === recorder) {
        wavRecorderRef.current = null;
      }
    };
  }, []);

  // Listen for AI responses to parse score
  useEffect(() => {
    if (!realtimeClient) return;

    const handleConversationCompleted = ({ item }: any) => {
      // Diagnostic: every assistant reply we see, log shape so we can tell
      // whether the AI is responding in text mode or audio (transcript) mode.
      if (item?.role === 'assistant') {
        dlog('item.completed (assistant):', {
          textLen: item?.formatted?.text?.length ?? 0,
          transcriptLen: item?.formatted?.transcript?.length ?? 0,
          textPreview: (item?.formatted?.text ?? '').slice(0, 120),
          transcriptPreview: (item?.formatted?.transcript ?? '').slice(0, 120),
        });
      }
      // Delegate score extraction to the pure parser. It reads from both
      // `formatted.text` (text-only replies) and `formatted.transcript`
      // (TTS audio replies — the common case in this voice-first app).
      const result = parsePronunciationScore(item);
      if (result) {
        dlog('parsed score → onResult', result);
        onResultRef.current?.(result);
        setIsProcessing(false);
      } else if (item?.role === 'assistant') {
        dlog('parser returned null (no score extracted)');
        // Even when no score parsed (AI replied with prose, magazine
        // persona response, or audio-only output), clear the "Scoring..."
        // badge so it doesn't stick forever. The user has waited; if no
        // valid score arrived, the round is over either way.
        setIsProcessing(false);
      }
    };

    realtimeClient.on('conversation.item.completed', handleConversationCompleted);

    return () => {
      // The parent layout's cleanup may have already called client.reset(),
      // which clears all event handlers. Guard against the resulting
      // "not found as a listener" throw from RealtimeClient.off.
      try {
        realtimeClient.off('conversation.item.completed', handleConversationCompleted);
      } catch {
        /* noop: handler was already cleared by reset()/clearEventHandlers() */
      }
    };
  }, [realtimeClient]);

  const startRecording = useCallback(async () => {
    const recorder = wavRecorderRef.current;
    if (!recorder || !realtimeClient?.isConnected()) {
      dlog('startRecording aborted', { hasRecorder: !!recorder, connected: realtimeClient?.isConnected() });
      return;
    }

    setIsRecording(true);
    setIsProcessing(false);

    // begin() throws if a processor already exists; mirror the guard
    // used in DesktopLayout (only begin if processor is null).
    if (recorder.processor === null) {
      await recorder.begin();
    }
    let chunkCount = 0;
    await recorder.record((data: any) => {
      realtimeClient.appendInputAudio(data.mono);
      chunkCount += 1;
      // Don't log every chunk (would be ~50/sec); just first one to confirm flow.
      if (chunkCount === 1) dlog('first audio chunk appended', { bytes: data.mono?.byteLength });
    });
    dlog('startRecording: recorder.record() resumed');
  }, [realtimeClient]);

  const stopRecording = useCallback(async () => {
    const recorder = wavRecorderRef.current;
    if (!recorder) return;

    setIsRecording(false);

    // Same guard pattern as DesktopLayout: only pause if begin() established
    // a processor and we're actually recording. Otherwise pause() throws.
    if (recorder.processor && recorder.recording) {
      try {
        await recorder.pause();
      } catch {
        /* noop: recorder state changed under us */
      }
    }

    // Send scoring request to AI ONLY if we have everything needed; only
    // then promise the user we're "Scoring..." them. Otherwise the badge
    // would stick on a request that was never sent.
    if (realtimeClient?.isConnected() && expectedText) {
      dlog('sending scoring prompt', { expectedText });
      setIsProcessing(true);
      realtimeClient.sendUserMessageContent([{
        type: 'input_text',
        text: `Pronunciation scoring task. The expected word/phrase is: "${expectedText}".
The child just spoke. Score their pronunciation accuracy from 0-100.
Reply with JSON only: {"score": <number>, "feedback": "<short encouraging message>", "stars": <1-5>}`,
      }]);

      // Safety net: if no parseable score arrives within 10 seconds (e.g.
      // server_vad already consumed the audio for a magazine-reader turn,
      // or the AI silently failed), clear the badge so the UI doesn't
      // appear stuck. The listener-effect normally clears it sooner.
      window.setTimeout(() => {
        setIsProcessing(prev => {
          if (prev) dlog('scoring timeout — clearing isProcessing');
          return false;
        });
      }, 10_000);
    } else {
      dlog('scoring prompt NOT sent', { connected: realtimeClient?.isConnected(), expectedText });
    }
  }, [realtimeClient, expectedText]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return {
    isRecording,
    isProcessing,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}
