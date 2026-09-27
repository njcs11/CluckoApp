import React from 'react';

/**
 * EyeModuleIcon: Modern high-tech AI vision / ocular scan icon.
 * Features an anatomical eye profile with optical iris target and scanning reticle.
 */
export function EyeModuleIcon({ size = 18, color = 'currentColor', className = '', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`module-svg-icon ${className}`}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Eye outer contour */}
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      {/* Iris ring */}
      <circle cx="12" cy="12" r="3.5" />
      {/* Pupil center */}
      <circle cx="12" cy="12" r="1.2" fill={color} stroke="none" />
    </svg>
  );
}

/**
 * WingModuleIcon: Stylized rooster wing profile featuring 3-tiered aerodynamic feathers.
 * Clearly symbolizes wing, feather posture, and mobility classification.
 */
export function WingModuleIcon({ size = 18, color = 'currentColor', className = '', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`module-svg-icon ${className}`}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Upper wing bone curve flowing down to primary flight feathers */}
      <path d="M4 14.5c1.5-5 5.5-9.5 13-10.5 1.5-.2 3.5.5 3.5 2 0 3-2 6-4 8.5" />
      {/* Middle secondary feather contour */}
      <path d="M7 17.5c1.8-3.5 4.5-6.5 9.5-7.5" />
      {/* Lower flight feather plume */}
      <path d="M3.5 14.5c.5 3 2.5 5.5 6 6 3 .4 6-1 7.5-3" />
      {/* Feather tip barb detail */}
      <path d="M12 7.5c2 1 4 3 4.5 5" />
    </svg>
  );
}
