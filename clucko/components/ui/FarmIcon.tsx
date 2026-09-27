import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';

interface FarmIconProps {
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Uniform Chicken Pen / Coop Icon matching the reference design:
 * Gable roof with overhang, coop body, 4-pane window, elevated stilts,
 * and an angled entrance ladder on the left.
 */
export default function FarmIcon({ size = 20, color = '#2D5541', style }: FarmIconProps) {
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
        {/* Roof Overhang / Fascia */}
        <Path
          d="M 19 22 L 38 6 L 57 22"
          stroke={color}
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M 23 25 L 38 13 L 53 25"
          stroke={color}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Coop Body */}
        <Rect
          x="24"
          y="24"
          width="28"
          height="21"
          stroke={color}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* 4-Pane Center Window */}
        <Rect x="33" y="28" width="10" height="10" stroke={color} strokeWidth="2" />
        <Line x1="38" y1="28" x2="38" y2="38" stroke={color} strokeWidth="1.8" />
        <Line x1="33" y1="33" x2="43" y2="33" stroke={color} strokeWidth="1.8" />

        {/* Stilts / Legs */}
        <Rect x="27" y="45" width="4.5" height="10" stroke={color} strokeWidth="2" />
        <Rect x="44.5" y="45" width="4.5" height="10" stroke={color} strokeWidth="2" />

        {/* Angled Ramp / Ladder on the left */}
        <Line x1="7" y1="55" x2="24" y2="37" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
        {/* Ladder Rungs */}
        <Line x1="7" y1="52" x2="11.5" y2="56.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <Line x1="11.5" y1="47.5" x2="16" y2="52" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <Line x1="16" y1="43" x2="20.5" y2="47.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <Line x1="20.5" y1="38.5" x2="25" y2="43" stroke={color} strokeWidth="2" strokeLinecap="round" />
      </Svg>
    </View>
  );
}
