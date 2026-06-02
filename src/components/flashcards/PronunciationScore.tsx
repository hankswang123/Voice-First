import React, { useEffect } from 'react';
import styles from './PronunciationScore.module.css';
import { PronunciationResult } from './useVoiceRecognition';

interface PronunciationScoreProps {
  result: PronunciationResult;
  onDismiss: () => void;
  autoHideMs?: number;
}

export default function PronunciationScore({
  result,
  onDismiss,
  autoHideMs = 3000,
}: PronunciationScoreProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, autoHideMs);
    return () => clearTimeout(timer);
  }, [onDismiss, autoHideMs]);

  const scoreClass =
    result.score >= 80 ? styles.great :
    result.score >= 60 ? styles.good :
    result.score >= 40 ? styles.fair :
    styles.poor;

  const stars = Array.from({ length: 5 }, (_, i) => i < result.stars);

  return (
    <div className={styles.overlay} onClick={onDismiss}>
      <div className={`${styles.score} ${scoreClass}`}>
        {result.score}
      </div>
      <div className={styles.stars}>
        {stars.map((active, i) => (
          <span key={i} className={`${styles.star} ${active ? styles.active : ''}`}>
            ★
          </span>
        ))}
      </div>
      <div className={styles.feedback}>{result.feedback}</div>
      <div className={styles.hint}>tap to dismiss</div>
    </div>
  );
}
