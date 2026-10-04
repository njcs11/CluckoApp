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
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3.5" />
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
      <path d="M4 14.5c1.5-5 5.5-9.5 13-10.5 1.5-.2 3.5.5 3.5 2 0 3-2 6-4 8.5" />
      <path d="M7 17.5c1.8-3.5 4.5-6.5 9.5-7.5" />
      <path d="M3.5 14.5c.5 3 2.5 5.5 6 6 3 .4 6-1 7.5-3" />
      <path d="M12 7.5c2 1 4 3 4.5 5" />
    </svg>
  );
}

/**
 * CombModuleIcon: Stylized 3-lobed rooster crown comb icon matching Photo 2.
 * Features 3 curved droplet petals fanning upward and outward.
 */
export function CombModuleIcon({ size = 18, color = 'currentColor', className = '', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      className={`module-svg-icon ${className}`}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Top Left Droplet Lobe */}
      <path d="M7 13.8 C6.2 12 4.2 7.8 5.6 3.6 C6.8 0.5 10.5 0.8 11.2 4.2 C11.6 6.8 10 10.8 7 13.8 Z" />
      {/* Center Droplet Lobe */}
      <path d="M8.8 14.8 C10.4 13.2 13.6 9.8 17.2 9 C20.2 8.3 21.6 11.8 19.2 13.8 C16.8 15.6 12.8 15.5 8.8 14.8 Z" />
      {/* Bottom Right Droplet Lobe */}
      <path d="M10.8 16.2 C12.8 15.3 16.8 14.2 19.8 16.6 C22 18.2 20 21.4 17 20.6 C14.2 19.8 12.2 17.6 10.8 16.2 Z" />
    </svg>
  );
}

/**
 * FeetModuleIcon: Chicken footprint tracks icon matching Photo 1.
 * Features 3-claw slender toes meeting at an acute tapered heel.
 */
export function FeetModuleIcon({ size = 18, color = 'currentColor', className = '', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      className={`module-svg-icon ${className}`}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Track 1 (Left / Lower) */}
      <path d="M6 21.5 C5.6 20 4.2 17.5 2.5 15.8 C1.2 14.5 0.5 13.8 0.4 13.5 C0.6 13.2 1.4 13.5 2.8 14.6 L4.6 16.2 C4.9 14.5 5 11.5 5.2 8.2 C5.3 7 5.7 6.2 6 6.2 C6.3 6.2 6.7 7 6.8 8.2 C7 11.5 7.1 14.5 7.4 16.2 L9.2 14.6 C10.6 13.5 11.4 13.2 11.6 13.5 C11.5 13.8 10.8 14.5 9.5 15.8 C7.8 17.5 6.4 20 6 21.5 Z" />
      {/* Track 2 (Right / Upper, Slightly Advanced) */}
      <path d="M17.5 16.5 C17.1 15 15.7 12.5 14 10.8 C12.7 9.5 12 8.8 11.9 8.5 C12.1 8.2 12.9 8.5 14.3 9.6 L16.1 11.2 C16.4 9.5 16.5 6.5 16.7 3.2 C16.8 2 17.2 1.2 17.5 1.2 C17.8 1.2 18.2 2 18.3 3.2 C18.5 6.5 18.6 9.5 18.9 11.2 L20.7 9.6 C22.1 8.5 22.9 8.2 23.1 8.5 C23 8.8 22.3 9.5 21 10.8 C19.3 12.5 17.9 15 17.5 16.5 Z" />
    </svg>
  );
}

/**
 * GenericAnatomyIcon: Anatomical crosshair node for any custom chicken body part.
 */
export function GenericAnatomyIcon({ size = 18, color = 'currentColor', className = '', style = {} }) {
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
      <circle cx="12" cy="12" r="8" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      <circle cx="12" cy="12" r="2.5" fill={color} stroke="none" />
    </svg>
  );
}

/**
 * DynamicModuleIcon: Automatically renders the appropriate icon based on the module id or icon key.
 */
export function DynamicModuleIcon({ module = '', icon = '', size = 18, color = 'currentColor', className = '', style = {} }) {
  const key = (icon || module || '').toLowerCase();
  if (key === 'eye' || key.includes('eye') || key.includes('ocular')) {
    return <EyeModuleIcon size={size} color={color} className={className} style={style} />;
  }
  if (key === 'wing' || key.includes('wing') || key.includes('posture')) {
    return <WingModuleIcon size={size} color={color} className={className} style={style} />;
  }
  if (key === 'comb' || key.includes('comb') || key.includes('wattle') || key.includes('head')) {
    return <CombModuleIcon size={size} color={color} className={className} style={style} />;
  }
  if (key === 'feet' || key.includes('foot') || key.includes('leg') || key.includes('shank') || key.includes('spur') || key.includes('claw')) {
    return <FeetModuleIcon size={size} color={color} className={className} style={style} />;
  }
  return <GenericAnatomyIcon size={size} color={color} className={className} style={style} />;
}
