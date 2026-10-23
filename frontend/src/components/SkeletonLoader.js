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

export function AdminDashboardSkeleton() {
  return (
    <div className="admin-dashboard-container animate-in">
      <div className="admin-page-header">
        <div>
          <SkeletonBox width="200px" height="13px" style={{ marginBottom: 8 }} />
          <SkeletonBox width="280px" height="28px" style={{ marginBottom: 8 }} />
          <SkeletonBox width="450px" height="14px" />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <SkeletonBox width="150px" height="36px" borderRadius="6px" />
          <SkeletonBox width="90px" height="36px" borderRadius="6px" />
          <SkeletonBox width="130px" height="36px" borderRadius="6px" />
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: '1.5rem' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton-kpi-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <SkeletonBox width="45%" height="13px" />
              <SkeletonBox width="36px" height="36px" borderRadius="8px" />
            </div>
            <SkeletonBox width="60%" height="32px" borderRadius="6px" />
            <SkeletonBox width="75%" height="14px" />
          </div>
        ))}
      </div>

      <div className="dashboard-grid-row">
        <div className="skeleton-chart-canvas">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <SkeletonBox width="220px" height="18px" style={{ marginBottom: 6 }} />
              <SkeletonBox width="300px" height="13px" />
            </div>
            <SkeletonBox width="140px" height="26px" borderRadius="20px" />
          </div>
          <div className="skeleton-chart-bars">
            {Array.from({ length: 15 }).map((_, i) => (
              <SkeletonBox 
                key={i} 
                width="100%" 
                height={`${30 + ((i * 19) % 65)}%`} 
                borderRadius="4px 4px 0 0" 
              />
            ))}
          </div>
        </div>

        <div className="skeleton-card" style={{ minHeight: '340px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <SkeletonBox width="160px" height="18px" />
            <SkeletonBox width="80px" height="14px" />
          </div>
          <SkeletonBox width="100%" height="16px" style={{ marginBottom: 8 }} />
          <SkeletonBox width="90%" height="16px" style={{ marginBottom: 8 }} />
          <SkeletonBox width="70%" height="16px" style={{ marginBottom: 16 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <SkeletonBox width="32px" height="32px" borderRadius="50%" />
                <div style={{ flex: 1 }}>
                  <SkeletonBox width="60%" height="13px" style={{ marginBottom: 4 }} />
                  <SkeletonBox width="40%" height="11px" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DiseasesSkeleton() {
  return (
    <div className="page diseases-page animate-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <SkeletonBox width="320px" height="28px" style={{ marginBottom: 8 }} />
          <SkeletonBox width="480px" height="14px" />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <SkeletonBox width="160px" height="38px" borderRadius="6px" />
          <SkeletonBox width="120px" height="38px" borderRadius="6px" />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBox key={i} width={i === 0 ? '110px' : '90px'} height="34px" borderRadius="20px" />
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <SkeletonBox width="36px" height="36px" borderRadius="8px" />
              <div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                  <SkeletonBox width="160px" height="18px" />
                  <SkeletonBox width="90px" height="18px" borderRadius="10px" />
                  <SkeletonBox width="70px" height="18px" borderRadius="10px" />
                </div>
                <SkeletonBox width="220px" height="12px" />
              </div>
            </div>
            <SkeletonBox width="28px" height="28px" borderRadius="6px" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DatasetSkeleton() {
  return (
    <div className="page dataset-page animate-in">
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <SkeletonBox width="300px" height="28px" style={{ marginBottom: 8 }} />
        <SkeletonBox width="450px" height="14px" />
      </div>

      <div className="card" style={{ padding: '12px 16px', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <SkeletonBox key={i} height="52px" borderRadius="8px" />
          ))}
        </div>
      </div>

      <div className="dataset-grid">
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <SkeletonBox width="140px" height="18px" />
            <SkeletonBox width="70px" height="18px" borderRadius="10px" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBox key={i} height="48px" borderRadius="6px" />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <SkeletonBox height="140px" borderRadius="12px" />
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <SkeletonBox width="180px" height="18px" />
              <SkeletonBox width="120px" height="32px" borderRadius="6px" />
            </div>
            <div className="skeleton-gallery-grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonBox key={i} height="100px" borderRadius="8px" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TrainSkeleton() {
  return (
    <div className="page train-page animate-in">
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <SkeletonBox width="320px" height="28px" style={{ marginBottom: 8 }} />
        <SkeletonBox width="460px" height="14px" />
      </div>

      <div className="card" style={{ padding: '12px 16px', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <SkeletonBox key={i} height="52px" borderRadius="8px" />
          ))}
        </div>
      </div>

      <div className="train-grid-layout">
        <div className="train-left-col" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card" style={{ padding: '20px' }}>
            <SkeletonBox width="150px" height="18px" style={{ marginBottom: 16 }} />
            <SkeletonBox height="64px" borderRadius="8px" style={{ marginBottom: 16 }} />
            <SkeletonBox width="100%" height="14px" style={{ marginBottom: 8 }} />
            <SkeletonBox width="80%" height="14px" />
          </div>
          <div className="card" style={{ padding: '20px' }}>
            <SkeletonBox width="160px" height="18px" style={{ marginBottom: 16 }} />
            <SkeletonBox height="36px" borderRadius="6px" style={{ marginBottom: 12 }} />
            <SkeletonBox height="36px" borderRadius="6px" style={{ marginBottom: 16 }} />
            <SkeletonBox height="42px" borderRadius="8px" />
          </div>
        </div>

        <div className="train-right-col" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card" style={{ padding: '20px' }}>
            <SkeletonBox width="180px" height="18px" style={{ marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonBox key={i} height="40px" borderRadius="6px" style={{ flex: 1 }} />
              ))}
            </div>
            <SkeletonBox height="180px" borderRadius="8px" />
          </div>
        </div>
      </div>
    </div>
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
