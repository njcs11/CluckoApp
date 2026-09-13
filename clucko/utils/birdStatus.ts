// utils/birdStatus.ts
//
// Single source of truth for reading a bird's health status.
//
// Chicken records have historically carried health info in two different
// fields, in two different casings:
//   - `status: 'HEALTHY' | 'WARNING' | 'CRITICAL'`   (set by chickens.tsx / QR add flow)
//   - `healthStatus: 'Healthy' | 'Warning' | 'Critical'` (set by home.tsx default data / scans)
//
// Screens that only checked one of the two fields would silently miss any
// bird whose record only had the other one populated — e.g. Total: 7,
// Healthy: 6, Warning: 0, Critical: 0 (one bird falls through the crack).
//
// Route every health-status read through these helpers so Home, Chickens,
// and Reports always agree, no matter which field a given record happens
// to have set.

export type NormalizedHealthStatus = 'Healthy' | 'Warning' | 'Critical' | 'Unknown';

export const getHealthStatus = (bird: {
  healthStatus?: string;
  status?: string;
}): NormalizedHealthStatus => {
  const raw = (bird.healthStatus || bird.status || '').toString().toLowerCase();
  if (raw.includes('critical')) return 'Critical';
  if (raw.includes('warning')) return 'Warning';
  if (raw.includes('healthy')) return 'Healthy';
  return 'Unknown';
};

export const getStatusColor = (bird: {
  healthStatus?: string;
  status?: string;
  statusColor?: string;
}): string => {
  if (bird.statusColor) return bird.statusColor;
  const normalized = getHealthStatus(bird);
  if (normalized === 'Healthy') return '#4CAF50';
  if (normalized === 'Warning') return '#FF9800';
  if (normalized === 'Critical') return '#f44336';
  return '#9E9E9E';
};