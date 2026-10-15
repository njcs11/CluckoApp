import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle, TouchableOpacity, TouchableOpacityProps } from 'react-native';

interface AnimatedEntranceProps {
  children: React.ReactNode;
  index?: number;
  delay?: number;
  duration?: number;
  direction?: 'up' | 'scale' | 'fade';
  style?: ViewStyle;
}

/**
 * 60fps Organic Motion & Staggered Entrance Component (ssgoi.dev inspired)
 * Uses native driver spring physics for fluid 60fps presentation.
 */
export function AnimatedEntrance({
  children,
  index = 0,
  delay,
  direction = 'up',
  style,
}: AnimatedEntranceProps) {
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const transformAnim = useRef(new Animated.Value(direction === 'scale' ? 0.92 : 14)).current;

  useEffect(() => {
    const computedDelay = delay !== undefined ? delay : Math.min(index * 45, 300);

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.spring(transformAnim, {
          toValue: direction === 'scale' ? 1 : 0,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }),
      ]).start();
    }, computedDelay);

    return () => clearTimeout(timer);
  }, [index, delay, direction]);

  const transformStyle =
    direction === 'scale'
      ? { scale: transformAnim }
      : { translateY: transformAnim };

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: opacityAnim,
          transform: [transformStyle],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * 60fps Spring Card / Pressable with tactile spring physics feedback
 */
export function InteractivePressable({
  children,
  style,
  onPress,
  disabled,
  activeOpacity = 0.92,
  ...props
}: TouchableOpacityProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.975,
      friction: 7,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 90,
      useNativeDriver: true,
    }).start();
  };

  return (
    <TouchableOpacity
      activeOpacity={activeOpacity}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      disabled={disabled}
      {...props}
    >
      <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
}
