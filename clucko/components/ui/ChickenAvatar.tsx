import ChickenIcon from './ChickenIcon';
import React from 'react';
import { Image, ImageStyle, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

interface ChickenAvatarProps {
  photo?: string | null;
  size: number;
  backgroundColor?: string;
  iconColor?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Renders a chicken's photo if one is set, otherwise a neutral
 * icon-based placeholder. Never falls back to the app logo — a
 * chicken with no photo should look like "no photo yet", not
 * like a Clucko-branded tile.
 */
export default function ChickenAvatar({
  photo,
  size,
  backgroundColor = '#E8F5E9',
  iconColor = '#4CAF50',
  style,
}: ChickenAvatarProps) {
  if (photo) {
    return (
      <Image
        source={{ uri: photo }}
        style={[
          { width: size, height: size, borderRadius: size / 2, backgroundColor: '#eee' },
          style as StyleProp<ImageStyle>,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.placeholder,
        { width: size, height: size, borderRadius: size / 2, backgroundColor },
        style,
      ]}
    >
      <ChickenIcon size={size * 0.58} color={iconColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});