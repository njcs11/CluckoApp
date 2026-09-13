import React from 'react';
import { ColorValue, Image, ImageStyle, StyleProp } from 'react-native';

interface ChickenIconProps {
  size?: number;
  color?: ColorValue;
  style?: StyleProp<ImageStyle>;
}

export default function ChickenIcon({ size = 22, color, style }: ChickenIconProps) {
  return (
    <Image
      source={require('../../assets/images/chicken-icon.png')}
      style={[
        {
          width: size,
          height: size,
          resizeMode: 'contain',
        },
        color ? { tintColor: color } : null,
        style,
      ]}
    />
  );
}
