import React from 'react';
import CluckoIcon from './CluckoIcon';

/**
 * CluckoBrandBadge: The signature glowing green squircle tile
 * featured in modern AI interfaces (as seen in the design reference photo).
 */
export default function CluckoBrandBadge({
  size = 40,
  iconSize = 22,
  glow = true,
  pulse = false,
  className = '',
  style = {}
}) {
  return (
    <div
      className={`clucko-brand-badge ${glow ? 'badge-glow' : ''} ${pulse ? 'badge-pulse' : ''} ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ffffff',
        flexShrink: 0,
        boxShadow: glow
          ? '0 0 24px rgba(34, 197, 94, 0.35), inset 0 1px 1px rgba(255, 255, 255, 0.4)'
          : '0 2px 8px rgba(0, 0, 0, 0.4)',
        position: 'relative',
        ...style
      }}
    >
      <CluckoIcon size={iconSize} color="#ffffff" />
    </div>
  );
}
