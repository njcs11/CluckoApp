import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet } from 'react-native';

interface AnimatedChickenWalkProps {
  color?: string;
  size?: number;
  onTakeoffComplete?: () => void;
}

/**
 * Pixel2Motion Choreographed Avian Strut, Center Halt & Flight-to-Upper-Right.
 * Applied Disney Principles:
 *  1. Staging: Struts into center horizon line.
 *  2. Timing: 1000ms travel stride, 1000ms center halt (proud perk), 600ms flight exit.
 *  3. Secondary Action: Avian head/body bobbing and rhythmic swagger tilt.
 *  4. Anticipation: Downward crouch compression before takeoff launch.
 *  5. Arcs: Parabolic flight arc ascending towards the upper right (+260px X, -80px Y).
 *  6. Solid Silhouette: Uses the unified official chicken mark with static legs and static wing.
 */
export default function AnimatedChickenWalk({
  color = '#22C55E',
  size = 145,
  onTakeoffComplete,
}: AnimatedChickenWalkProps) {
  // Motion transforms
  const moveX = useRef(new Animated.Value(-80)).current;
  const bobY = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.95)).current;
  const scaleY = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 1: Strut Travel into Center (0ms - 1000ms)
    // Smooth glide from left into exact center with natural avian body bobbing
    // ═══════════════════════════════════════════════════════════════════════════
    const walkIn = Animated.parallel([
      // Smooth travel from left into center stage
      Animated.timing(moveX, {
        toValue: 0,
        duration: 1000,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      // Avian rhythmic body bobbing
      Animated.sequence([
        Animated.timing(bobY, { toValue: -8, duration: 160, useNativeDriver: true }),
        Animated.timing(bobY, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(bobY, { toValue: -8, duration: 160, useNativeDriver: true }),
        Animated.timing(bobY, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(bobY, { toValue: -6, duration: 180, useNativeDriver: true }),
        Animated.timing(bobY, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]),
      // Rooster swagger tilt
      Animated.sequence([
        Animated.timing(tilt, { toValue: -3, duration: 250, useNativeDriver: true }),
        Animated.timing(tilt, { toValue: 3, duration: 250, useNativeDriver: true }),
        Animated.timing(tilt, { toValue: -2, duration: 250, useNativeDriver: true }),
        Animated.timing(tilt, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]),
      // Scale settling cleanly to 1.0
      Animated.spring(scale, {
        toValue: 1.0,
        friction: 6,
        useNativeDriver: true,
      }),
    ]);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 2: Center Halt / 1-Second Pause (1000ms - 2000ms)
    // Chicken stops squarely in center stage with proud alert perk
    // ═══════════════════════════════════════════════════════════════════════════
    const centerPause = Animated.sequence([
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1.05,
          duration: 480,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(tilt, {
          toValue: -2,
          duration: 480,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1.0,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(tilt, {
          toValue: 0,
          duration: 520,
          useNativeDriver: true,
        }),
      ]),
    ]);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 3: Anticipation & Flight to Upper Right (2000ms - 2750ms)
    // Crouches down, then springs up and glides towards the upper right
    // Wings and legs remain static as requested.
    // ═══════════════════════════════════════════════════════════════════════════
    const flightRight = Animated.sequence([
      // A. Anticipation crouch (180ms)
      Animated.parallel([
        Animated.timing(bobY, {
          toValue: 10,
          duration: 180,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scaleY, {
          toValue: 0.92,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.04,
          duration: 180,
          useNativeDriver: true,
        }),
      ]),
      // B. Spring takeoff and flight arc towards the upper right (570ms)
      Animated.parallel([
        // Flies off towards upper right screen edge (+260px X)
        Animated.timing(moveX, {
          toValue: 260,
          duration: 570,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          useNativeDriver: true,
        }),
        // Arcs upward (-80px Y)
        Animated.timing(bobY, {
          toValue: -80,
          duration: 570,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        // Aerodynamic flight tilt forward pointing upper right (+16deg)
        Animated.timing(tilt, {
          toValue: 16,
          duration: 400,
          useNativeDriver: true,
        }),
        // Release crouch compression
        Animated.timing(scaleY, {
          toValue: 1.0,
          duration: 200,
          useNativeDriver: true,
        }),
        // Dissolves smoothly as it exits the screen
        Animated.sequence([
          Animated.delay(350),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 220,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]);

    // Master Timeline Choreography
    const masterSequence = Animated.sequence([
      walkIn,
      centerPause,
      flightRight,
    ]);

    masterSequence.start(() => {
      if (onTakeoffComplete) {
        onTakeoffComplete();
      }
    });

    return () => {
      masterSequence.stop();
    };
  }, []);

  const tiltInterpolate = tilt.interpolate({
    inputRange: [-18, 18],
    outputRange: ['-18deg', '18deg'],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          opacity: opacity,
          transform: [
            { translateX: moveX },
            { translateY: bobY },
            { rotate: tiltInterpolate },
            { scale: scale },
            { scaleY: scaleY },
          ],
        },
      ]}
    >
      {/* ─── Solid Silhouette Chicken Mark (Static Legs & Static Wing) ─── */}
      <Image
        source={require('../assets/images/chicken-icon.png')}
        style={[styles.chickenImage, { tintColor: color }]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  chickenImage: {
    width: '100%',
    height: '100%',
  },
});
