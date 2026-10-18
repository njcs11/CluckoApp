import React from 'react';
import cluckoLogo from '../../assets/logo.png';

/**
 * CluckoBrandBadge: The signature glowing brand badge displaying
 * the official Clucko green rooster logo.
 */
export default function CluckoBrandBadge({
  size = 40,
  iconSize = 24,
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
        background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(21, 128, 61, 0.25) 100%)',
        border: '1px solid rgba(34, 197, 94, 0.45)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: glow
          ? '0 0 20px rgba(34, 197, 94, 0.35), inset 0 1px 1px rgba(255, 255, 255, 0.2)'
          : '0 2px 8px rgba(0, 0, 0, 0.3)',
        position: 'relative',
        overflow: 'hidden',
        padding: Math.max(3, Math.round(size * 0.1)),
        ...style
      }}
    >
      <img
        src={cluckoLogo}
        alt="Clucko"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block'
        }}
      />
    </div>
  );
}
