import React from 'react';
import './SkeletonLoader.css';

export function SkeletonBox({ width = '100%', height = '16px', borderRadius = '4px', className = '', style = {} }) {
  return (
    <div 
      className={`skeleton-shimmer ${className}`}
      style={{ width, height, borderRadius, ...style }}
    />
  );
}

export function SkeletonCard({ height = '110px', style = {} }) {
  return (
    <div className="skeleton-card" style={{ minHeight: height, ...style }}>
      <SkeletonBox width="40%" height="12px" />
      <SkeletonBox width="65%" height="28px" borderRadius="6px" />
      <SkeletonBox width="50%" height="11px" />
    </div>
  );
}

export function SkeletonTableRows({ rows = 5, cols = 5 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rIdx) => (
        <tr key={rIdx} className="skeleton-tr">
          {Array.from({ length: cols }).map((_, cIdx) => (
            <td key={cIdx} style={{ padding: '14px 18px' }}>
              <SkeletonBox 
                width={cIdx === 0 ? '40px' : cIdx === 1 ? '70%' : cIdx === cols - 1 ? '60px' : '85%'} 
                height="15px"
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function SkeletonLoader({ type = 'table', count = 5, cols = 5 }) {
  if (type === 'cards') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
        {Array.from({ length: count }).map((_, idx) => (
          <SkeletonCard key={idx} />
        ))}
      </div>
    );
  }

  return (
    <div className="skeleton-table-wrapper">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="skeleton-table-row">
          {Array.from({ length: cols }).map((_, cIdx) => (
            <div 
              key={cIdx} 
              className="skeleton-shimmer skeleton-cell" 
              style={{ flex: cIdx === 0 ? 0.5 : cIdx === 1 ? 2 : 1 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
