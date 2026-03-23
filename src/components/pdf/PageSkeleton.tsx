/**
 * PageSkeleton component - placeholder for unloaded PDF pages.
 * Maintains scroll position integrity while pages load.
 */

import React from 'react';

interface PageSkeletonProps {
  width: number;
  height?: number;
  pageNumber: number;
  isLoading?: boolean;
}

const PDF_ASPECT_RATIO = 1.29; // Standard PDF page aspect ratio (height/width)

export const PageSkeleton: React.FC<PageSkeletonProps> = ({
  width,
  height,
  pageNumber,
  isLoading = false
}) => {
  const calculatedHeight = height || width * PDF_ASPECT_RATIO;

  return (
    <div
      data-page-number={pageNumber}
      className={`pdf-page-skeleton ${isLoading ? 'loading' : ''}`}
      style={{
        width: `${width}px`,
        height: `${calculatedHeight}px`,
        backgroundColor: '#f5f5f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid #e0e0e0',
        borderRadius: '2px',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Page number indicator */}
      <span style={{
        color: '#999',
        fontSize: '14px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        zIndex: 1
      }}>
        {isLoading ? `Loading page ${pageNumber}...` : `Page ${pageNumber}`}
      </span>

      {/* Shimmer effect overlay when loading */}
      {isLoading && (
        <div
          className="shimmer-overlay"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite'
          }}
        />
      )}
    </div>
  );
};

export default PageSkeleton;
