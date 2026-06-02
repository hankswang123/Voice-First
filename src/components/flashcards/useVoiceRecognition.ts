import { useState, useCallback, useRef, useEffect } from 'react';
import { WavRecorder } from '../../lib/wavetools/lib/wav_recorder.js';
import { RealtimeClient } from '../../lib/realtime/index.js';

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

  // Initialize WavRecorder
  useEffect(() => {
    wavRecorderRef.current = new WavRecorder({ sampleRate: 24000 });
    return () => {
      if (wavRecorderRef.current) {
        wavRecorderRef.current.pause();
      }
    };
  }, []);

  // Listen for AI responses to parse score
  useEffect(() => {
    if (!realtimeClient) return;

    const handleConversationCompleted = ({ item }: any) => {
      if (item?.role === 'assistant' && item?.formatted?.text) {
        const text = item.formatted.text;
        try {
          // Try to parse JSON response from AI
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (typeof parsed.score === 'number') {
              onResult?.({
                score: Math.min(100, Math.max(0, parsed.score)),
                feedback: parsed.feedback || 'Good job!',
                stars: Math.min(5, Math.max(1, parsed.stars || 3)),
              });
            }
          }
        } catch (e) {
          // If JSON parse fails, try to extract score from text
          const scoreMatch = text.match(/(\d{1,3})/);
          if (scoreMatch) {
            const score = Math.min(100, parseInt(scoreMatch[1], 10));
            onResult?.({
              score,
              feedback: text.slice(0, 100),
              stars: score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : 1,
            });
          }
        }
        setIsProcessing(false);
      }
    };

    realtimeClient.on('conversation.item.completed', handleConversationCompleted);

    return () => {
      realtimeClient.off('conversation.item.completed', handleConversationCompleted);
    };
  }, [realtimeClient, onResult]);

  const startRecording = useCallback(async () => {
    if (!wavRecorderRef.current || !realtimeClient?.isConnected()) return;

    setIsRecording(true);
    setIsProcessing(false);

    await wavRecorderRef.current.begin();
    await wavRecorderRef.current.record((data) => {
      realtimeClient.appendInputAudio(data.mono);
    });
  }, [realtimeClient]);

  const stopRecording = useCallback(async () => {
    if (!wavRecorderRef.current) return;

    setIsRecording(false);
    setIsProcessing(true);

    await wavRecorderRef.current.pause();

    // Send scoring request to AI
    if (realtimeClient?.isConnected() && expectedText) {
      realtimeClient.sendUserMessageContent([{
        type: 'input_text',
        text: `Pronunciation scoring task. The expected word/phrase is: "${expectedText}".
The child just spoke. Score their pronunciation accuracy from 0-100.
Reply with JSON only: {"score": <number>, "feedback": "<short encouraging message>", "stars": <1-5>}`,
      }]);
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
