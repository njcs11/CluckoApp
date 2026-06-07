import { Dimensions, PixelRatio } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Base dimensions from your original design (iPhone 14/15 typical)
const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

// Scale functions
export const scaleWidth = (size: number) => (SCREEN_WIDTH / BASE_WIDTH) * size;
export const scaleHeight = (size: number) => (SCREEN_HEIGHT / BASE_HEIGHT) * size;
export const scaleFont = (size: number) => {
  const scale = Math.min(SCREEN_WIDTH / BASE_WIDTH, 1.2); // Cap at 1.2x
  return Math.round(size * scale);
};

// Check device type
export const isTablet = () => {
  const pixelDensity = PixelRatio.get();
  const adjustedWidth = SCREEN_WIDTH * pixelDensity;
  const adjustedHeight = SCREEN_HEIGHT * pixelDensity;
  return (adjustedWidth >= 768 && adjustedHeight >= 1024) || 
         (adjustedHeight >= 768 && adjustedWidth >= 1024);
};

export const isSmallDevice = () => SCREEN_WIDTH < 375;