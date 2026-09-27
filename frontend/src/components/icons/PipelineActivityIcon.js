import React from 'react';

/**
 * PipelineActivityIcon: Crisp vector SVG icon specifically engineered for the
 * Training Execution Pipeline. Features smooth 60fps vector pulse animations,
 * dynamic glowing nodes, and clean scalable strokes without raster pixelation.
 */
export default function PipelineActivityIcon({
  size = 18,
  active = false,
  color = null,
  className = '',
  style = {}
}) {
  const strokeColor = color || (active ? '#22c55e' : '#8f949a');

  return (
    <span
      className={`pipeline-activity-icon-wrap ${active ? 'is-active' : ''} ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        width: size,
        height: size,
        ...style
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`pipeline-activity-svg ${active ? 'svg-anim-pulse' : ''}`}
        style={{
          overflow: 'visible',
          filter: active ? 'drop-shadow(0 0 6px rgba(34, 197, 94, 0.65))' : 'none'
        }}
      >
        {/* Ambient background track for the pipeline */}
        <path
          d="M2 12h4.5l2.5-6 4 13 3-9 2 4H22"
          stroke={active ? 'rgba(34, 197, 94, 0.25)' : 'rgba(143, 148, 154, 0.2)'}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dynamic foreground animated pulse line */}
        <path
          className={active ? 'pipeline-live-trace' : ''}
          d="M2 12h4.5l2.5-6 4 13 3-9 2 4H22"
          stroke={strokeColor}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Real-time telemetry beacon dot at pulse peak */}
        {active && (
          <circle
            cx="11"
            cy="19"
            r="2"
            fill="#4ade80"
            className="pipeline-peak-beacon"
          />
        )}
      </svg>
    </span>
  );
}
