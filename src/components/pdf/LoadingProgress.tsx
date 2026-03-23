/**
 * LoadingProgress component - shows PDF document loading progress.
 */

import React from 'react';

interface LoadingProgressProps {
  progress: number;  // 0-100
  isVisible: boolean;
  pagesLoaded?: number;
  totalPages?: number;
}

export const LoadingProgress: React.FC<LoadingProgressProps> = ({
  progress,
  isVisible,
  pagesLoaded,
  totalPages
}) => {
  if (!isVisible) return null;

  return (
    <div
      className="pdf-loading-progress"
      style={{
        position: 'sticky',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        padding: '8px 16px',
        borderBottom: '1px solid #e0e0e0',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}
    >
      {/* Progress bar container */}
      <div
        style={{
          flex: 1,
          height: '4px',
          backgroundColor: '#e0e0e0',
          borderRadius: '2px',
          overflow: 'hidden'
        }}
      >
        {/* Progress bar fill */}
        <div
          style={{
            width: `${Math.min(100, Math.max(0, progress))}%`,
            height: '100%',
            backgroundColor: '#4285f4',
            borderRadius: '2px',
            transition: 'width 0.3s ease-out'
          }}
        />
      </div>

      {/* Page count text */}
      {pagesLoaded !== undefined && totalPages !== undefined && (
        <span
          style={{
            fontSize: '12px',
            color: '#666',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            whiteSpace: 'nowrap'
          }}
        >
          {pagesLoaded} / {totalPages} pages
        </span>
      )}
    </div>
  );
};

export default LoadingProgress;
