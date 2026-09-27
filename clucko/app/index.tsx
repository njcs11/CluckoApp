import { isSmallDevice, scaleFont } from '@/utils/responsive';
import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDarkMode } from '../context/DarkModeContext';

const MAX_PHONE_WIDTH = 460;

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDarkMode } = useDarkMode();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const columnWidth = Math.min(windowWidth, MAX_PHONE_WIDTH);

  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);

  const scrollRef = useRef<ScrollView>(null);

  // ===================== CHICKEN ANIMATIONS (Screen 1) =====================
  const roosterBobY = useRef(new Animated.Value(0)).current;
  const roosterTilt = useRef(new Animated.Value(0)).current;
  const roosterScale = useRef(new Animated.Value(0.95)).current;
  const wingFlap = useRef(new Animated.Value(0)).current;
  const roosterOpacity = useRef(new Animated.Value(1)).current;

  const glowScale = useRef(new Animated.Value(0.2)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  const logoScale = useRef(new Animated.Value(0.4)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;

  const contentFade = useRef(new Animated.Value(0)).current;
  const contentSlideY = useRef(new Animated.Value(24)).current;

  // Real-time carousel scroll offset for smooth progress line sliding
  const scrollX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      const isLoggedIn = await AsyncStorage.getItem('isLoggedIn');
      if (isLoggedIn === 'true') {
        router.replace('/(tabs)/home');
      } else {
        setLoading(false);
        setTimeout(() => {
          runChickenAnimation();
        }, 80);
      }
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      setLoading(false);
      setTimeout(() => {
        runChickenAnimation();
      }, 80);
    }
  };

  const completeOnboarding = async () => {
    try {
      await AsyncStorage.setItem('hasSeenOnboarding', 'true');
    } catch (error) {
      console.error('Error saving onboarding flag:', error);
    }
  };

  const runChickenAnimation = () => {
    // Reset values centered
    roosterBobY.setValue(0);
    roosterTilt.setValue(0);
    wingFlap.setValue(0);
    roosterOpacity.setValue(1);
    roosterScale.setValue(0.95);
    glowScale.setValue(0.2);
    glowOpacity.setValue(0);
    logoScale.setValue(0.4);
    logoOpacity.setValue(0);
    contentFade.setValue(0);
    contentSlideY.setValue(24);

    // 1. Proud rooster perk & strut centered on screen
    Animated.sequence([
      Animated.parallel([
        Animated.spring(roosterScale, {
          toValue: 1.05,
          friction: 6,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(roosterBobY, { toValue: -12, duration: 160, useNativeDriver: true }),
          Animated.timing(roosterBobY, { toValue: 0, duration: 160, useNativeDriver: true }),
          Animated.timing(roosterBobY, { toValue: -8, duration: 140, useNativeDriver: true }),
          Animated.timing(roosterBobY, { toValue: 0, duration: 140, useNativeDriver: true }),
        ]),
        Animated.loop(
          Animated.sequence([
            Animated.timing(wingFlap, { toValue: 1, duration: 90, useNativeDriver: true }),
            Animated.timing(wingFlap, { toValue: -1, duration: 90, useNativeDriver: true }),
          ]),
          { iterations: 4 }
        ),
        Animated.loop(
          Animated.sequence([
            Animated.timing(roosterTilt, { toValue: 1, duration: 180, useNativeDriver: true }),
            Animated.timing(roosterTilt, { toValue: -1, duration: 180, useNativeDriver: true }),
          ]),
          { iterations: 2 }
        ),
      ]),

      // 2. Morph into official Clucko Logo with radiant glow
      Animated.parallel([
        Animated.timing(roosterOpacity, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(glowOpacity, { toValue: 0.85, duration: 200, useNativeDriver: true }),
          Animated.timing(glowOpacity, { toValue: 0, duration: 380, useNativeDriver: true }),
        ]),
        Animated.timing(glowScale, {
          toValue: 2.2,
          duration: 550,
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 6,
          tension: 70,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 320,
          useNativeDriver: true,
        }),
      ]),

      // 3. Reveal brand text and CTA buttons
      Animated.parallel([
        Animated.timing(contentFade, {
          toValue: 1,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.spring(contentSlideY, {
          toValue: 0,
          friction: 7,
          tension: 70,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(offsetX / (columnWidth || 1));
    if (pageIndex !== currentPage && pageIndex >= 0 && pageIndex <= 2) {
      setCurrentPage(pageIndex);
    }
  };

  const goToPage = (pageIndex: number) => {
    scrollRef.current?.scrollTo({ x: pageIndex * columnWidth, animated: true });
    setCurrentPage(pageIndex);
  };

  const handleSkip = async () => {
    await completeOnboarding();
    router.replace('/login');
  };

  const handleStartNow = async () => {
    await completeOnboarding();
    router.replace('/login');
  };

  if (loading) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: isDarkMode ? '#0E1210' : '#FFFFFF' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Tilt and wing-flap interpolations
  const roosterTiltInterpolate = roosterTilt.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-6deg', '0deg', '6deg'],
  });

  const wingFlapInterpolate = wingFlap.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-16deg', '0deg', '16deg'],
  });

  // Top bar fixed progress line interpolations
  const topBarOpacity = scrollX.interpolate({
    inputRange: [0, columnWidth * 0.4, columnWidth],
    outputRange: [0, 0.2, 1],
    extrapolate: 'clamp',
  });

  const topBarTranslateY = scrollX.interpolate({
    inputRange: [0, columnWidth],
    outputRange: [-10, 0],
    extrapolate: 'clamp',
  });

  // Smooth slide expansion from 50% (45px) on Screen 2 to 100% (90px) on Screen 3
  const progressWidth = scrollX.interpolate({
    inputRange: [columnWidth, columnWidth * 2],
    outputRange: [45, 90],
    extrapolate: 'clamp',
  });

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: isDarkMode ? '#0E1210' : '#FFFFFF' },
      ]}
    >
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      <View style={[styles.mainColumn, { width: columnWidth }]}>
        {/* Floating Top Bar for Walkthrough (Screens 2 & 3) with smooth sliding progress line */}
        <Animated.View
          style={[
            styles.fixedTopBar,
            {
              opacity: topBarOpacity,
              transform: [{ translateY: topBarTranslateY }],
            },
          ]}
          pointerEvents={currentPage >= 1 ? 'auto' : 'none'}
        >
          {/* Progress Bar Track */}
          <View style={[styles.progressBarTrack, { backgroundColor: isDarkMode ? '#23332A' : '#E5E7EB' }]}>
            <Animated.View
              style={[
                styles.progressBarFill,
                {
                  width: progressWidth,
                  backgroundColor: isDarkMode ? colors.primary : '#111827',
                },
              ]}
            />
          </View>

          {/* Skip Button */}
          <TouchableOpacity
            onPress={handleSkip}
            style={styles.skipBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.skipBtnText, { color: colors.textSecondary }]}>Skip</Text>
          </TouchableOpacity>
        </Animated.View>

        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: false, listener: handleScroll }
          )}
          onMomentumScrollEnd={handleScroll}
          scrollEventThrottle={16}
          style={styles.carousel}
          contentContainerStyle={{ width: columnWidth * 3 }}
        >
          {/* ==================== SCREEN 1: ANIMATED ROOSTER INTRO ==================== */}
          <View style={[styles.slide, { width: columnWidth }]}>
            <View style={styles.screen1Hero}>
              {/* Animation Stage: Centered with bigger Chicken and Clucko Logo */}
              <View style={styles.animStage}>
                {/* Radiant Glow Burst */}
                <Animated.View
                  style={[
                    styles.glowAura,
                    {
                      backgroundColor: colors.primary,
                      opacity: glowOpacity,
                      transform: [{ scale: glowScale }],
                    },
                  ]}
                />

                {/* Animated Gamefowl Chicken - Centered & Enlarged */}
                <Animated.View
                  style={[
                    styles.roosterBox,
                    {
                      opacity: roosterOpacity,
                      transform: [
                        { translateY: roosterBobY },
                        { scale: roosterScale },
                        { rotate: wingFlapInterpolate },
                      ],
                    },
                  ]}
                >
                  <Image
                    source={require('../assets/images/chicken-icon.png')}
                    style={[styles.roosterImage, { tintColor: colors.primary }]}
                    resizeMode="contain"
                  />
                </Animated.View>

                {/* Clucko Logo Revealed at Center - Enlarged */}
                <Animated.View
                  style={[
                    styles.logoBox,
                    {
                      opacity: logoOpacity,
                      transform: [{ scale: logoScale }],
                    },
                  ]}
                >
                  <Image
                    source={require('../assets/images/logo.png')}
                    style={styles.brandLogo}
                    resizeMode="contain"
                  />
                </Animated.View>
              </View>

              {/* Text & Action Revealed After Animation */}
              <Animated.View
                style={[
                  styles.screen1Content,
                  {
                    opacity: contentFade,
                    transform: [{ translateY: contentSlideY }],
                  },
                ]}
              >
                <View style={styles.titleWrap}>
                  <Text style={[styles.brandName, { color: isDarkMode ? '#F0FDF4' : '#111827' }]}>
                    CLUCKO
                  </Text>
                  <Text style={[styles.mainTagline, { color: isDarkMode ? '#9CA3AF' : '#1F2937' }]}>
                    The Future of Gamefowl Care
                  </Text>
                </View>

                {/* Get Started Button */}
                <TouchableOpacity
                  style={[
                    styles.solidPrimaryBtn,
                    { backgroundColor: isDarkMode ? '#22C55E' : '#111827' },
                  ]}
                  activeOpacity={0.88}
                  onPress={() => goToPage(1)}
                >
                  <Text
                    style={[
                      styles.solidPrimaryBtnText,
                      { color: isDarkMode ? '#0E1210' : '#FFFFFF' },
                    ]}
                  >
                    Get Started
                  </Text>
                </TouchableOpacity>

                {/* Already have an account? Log in */}
                <View style={styles.alreadyAccountRow}>
                  <Text style={[styles.alreadyAccountText, { color: colors.textSecondary }]}>
                    Already have an account?{' '}
                  </Text>
                  <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[styles.loginLinkText, { color: colors.primary }]}>
                      Log in
                    </Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            </View>
          </View>

          {/* ==================== SCREEN 2: WELCOME TO CLUCKO ==================== */}
          <View style={[styles.slide, styles.walkthroughSlide, { width: columnWidth }]}>
            {/* Visual Card */}
            <View style={styles.visualCardContainer}>
              <View
                style={[
                  styles.visualCard,
                  {
                    backgroundColor: isDarkMode ? '#17221C' : '#F3F4F6',
                    borderColor: isDarkMode ? '#23332A' : '#E5E7EB',
                  },
                ]}
              >
                <Image
                  source={require('../assets/images/slide_farm_golden_hour.jpg')}
                  style={styles.cardImage}
                  resizeMode="cover"
                />
                <LinearGradient
                  colors={['transparent', isDarkMode ? 'rgba(14,18,16,0.85)' : 'rgba(0,0,0,0.55)']}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.cardOverlayBadge}>
                  <Feather name="shield" size={15} color="#FFFFFF" />
                  <Text style={styles.cardOverlayBadgeText}>Farm Protection</Text>
                </View>
              </View>
            </View>

            {/* Title & Copy */}
            <View style={styles.slideCopyBlock}>
              <Text style={[styles.slideTitle, { color: isDarkMode ? '#F0FDF4' : '#111827' }]}>
                Welcome to Clucko
              </Text>
              <Text style={[styles.slideDescription, { color: colors.textSecondary }]}>
                Clucko is an all-in-one AI health monitoring and gamefowl management platform designed specifically for Philippine breeders, owners, and caretakers.
              </Text>
            </View>

            {/* Bottom Navigation */}
            <View style={styles.bottomNavRow}>
              <TouchableOpacity
                style={[
                  styles.circleBackBtn,
                  {
                    borderColor: isDarkMode ? '#2B3830' : '#E5E7EB',
                    backgroundColor: isDarkMode ? '#1A231E' : '#F9FAFB',
                  },
                ]}
                onPress={() => goToPage(0)}
                activeOpacity={0.8}
              >
                <Feather name="arrow-left" size={20} color={isDarkMode ? '#F0FDF4' : '#111827'} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.navNextBtn,
                  { backgroundColor: isDarkMode ? '#22C55E' : '#111827' },
                ]}
                activeOpacity={0.88}
                onPress={() => goToPage(2)}
              >
                <Text
                  style={[
                    styles.navNextBtnText,
                    { color: isDarkMode ? '#0E1210' : '#FFFFFF' },
                  ]}
                >
                  Continue
                </Text>
                <Feather name="arrow-right" size={18} color={isDarkMode ? '#0E1210' : '#FFFFFF'} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ==================== SCREEN 3: WHAT CLUCKO CAN DO ==================== */}
          <View style={[styles.slide, styles.walkthroughSlide, { width: columnWidth }]}>
            {/* Feature Visual */}
            <View style={styles.visualCardContainer}>
              <View
                style={[
                  styles.visualCard,
                  {
                    backgroundColor: isDarkMode ? '#17221C' : '#F3F4F6',
                    borderColor: isDarkMode ? '#23332A' : '#E5E7EB',
                  },
                ]}
              >
                <Image
                  source={require('../assets/images/slide_sparring.jpg')}
                  style={styles.cardImage}
                  resizeMode="cover"
                />
                <LinearGradient
                  colors={['transparent', isDarkMode ? 'rgba(14,18,16,0.85)' : 'rgba(0,0,0,0.55)']}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.cardOverlayBadge}>
                  <Ionicons name="scan-outline" size={15} color="#FFFFFF" />
                  <Text style={styles.cardOverlayBadgeText}>AI Disease Scanning</Text>
                </View>
              </View>
            </View>

            {/* Title & Copy */}
            <View style={styles.slideCopyBlock}>
              <Text style={[styles.slideTitle, { color: isDarkMode ? '#F0FDF4' : '#111827' }]}>
                What Clucko Can Do
              </Text>
              <View style={styles.featuresList}>
                <View style={styles.featureItemRow}>
                  <View style={[styles.featureDot, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.featureItemText, { color: colors.textSecondary }]}>
                    <Text style={{ fontWeight: '700', color: isDarkMode ? '#F0FDF4' : '#111827' }}>Instant Disease Detection: </Text>
                    Identify Coryza, Fowl Pox & Newcastle with live camera models.
                  </Text>
                </View>

                <View style={styles.featureItemRow}>
                  <View style={[styles.featureDot, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.featureItemText, { color: colors.textSecondary }]}>
                    <Text style={{ fontWeight: '700', color: isDarkMode ? '#F0FDF4' : '#111827' }}>Rooster QR Verification: </Text>
                    Generate digital tags for each bird with instant health records.
                  </Text>
                </View>

                <View style={styles.featureItemRow}>
                  <View style={[styles.featureDot, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.featureItemText, { color: colors.textSecondary }]}>
                    <Text style={{ fontWeight: '700', color: isDarkMode ? '#F0FDF4' : '#111827' }}>Farm Collaboration: </Text>
                    Coordinate daily feeding, pen logs, and medication with caretakers.
                  </Text>
                </View>
              </View>
            </View>

            {/* Bottom Navigation: Back & Start Now */}
            <View style={styles.bottomNavRow}>
              <TouchableOpacity
                style={[
                  styles.circleBackBtn,
                  {
                    borderColor: isDarkMode ? '#2B3830' : '#E5E7EB',
                    backgroundColor: isDarkMode ? '#1A231E' : '#F9FAFB',
                  },
                ]}
                onPress={() => goToPage(1)}
                activeOpacity={0.8}
              >
                <Feather name="arrow-left" size={20} color={isDarkMode ? '#F0FDF4' : '#111827'} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.navNextBtn,
                  { backgroundColor: isDarkMode ? '#22C55E' : '#111827' },
                ]}
                activeOpacity={0.88}
                onPress={handleStartNow}
              >
                <Text
                  style={[
                    styles.navNextBtnText,
                    { color: isDarkMode ? '#0E1210' : '#FFFFFF' },
                  ]}
                >
                  Start Now
                </Text>
                <Feather name="check" size={18} color={isDarkMode ? '#0E1210' : '#FFFFFF'} />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
  },
  mainColumn: {
    flex: 1,
  },
  carousel: {
    flex: 1,
  },
  slide: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingBottom: 24,
  },

  // ===================== SCREEN 1 STYLES =====================
  screen1Hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 24,
  },
  animStage: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minHeight: 280,
  },
  glowAura: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
  },
  roosterBox: {
    position: 'absolute',
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roosterImage: {
    width: 140,
    height: 140,
  },
  logoBox: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLogo: {
    width: 140,
    height: 140,
  },
  screen1Content: {
    width: '100%',
    alignItems: 'center',
  },
  titleWrap: {
    alignItems: 'center',
    marginBottom: 36,
  },
  brandName: {
    fontSize: scaleFont(26),
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 8,
  },
  mainTagline: {
    fontSize: scaleFont(20),
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  solidPrimaryBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  solidPrimaryBtnText: {
    fontSize: scaleFont(16),
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  alreadyAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  alreadyAccountText: {
    fontSize: scaleFont(14),
  },
  loginLinkText: {
    fontSize: scaleFont(14),
    fontWeight: '700',
  },

  // ===================== SCREEN 2 & 3 STYLES =====================
  fixedTopBar: {
    position: 'absolute',
    top: 10,
    left: 24,
    right: 24,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  walkthroughSlide: {
    paddingTop: 52,
  },
  progressBarTrack: {
    width: 90,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  skipBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  skipBtnText: {
    fontSize: scaleFont(14),
    fontWeight: '600',
  },

  visualCardContainer: {
    width: '100%',
    height: 240,
    marginVertical: 10,
  },
  visualCard: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardOverlayBadge: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    gap: 6,
  },
  cardOverlayBadgeText: {
    color: '#FFFFFF',
    fontSize: scaleFont(12),
    fontWeight: '600',
  },

  slideCopyBlock: {
    width: '100%',
    marginVertical: 10,
  },
  slideTitle: {
    fontSize: scaleFont(22),
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 12,
  },
  slideDescription: {
    fontSize: scaleFont(14.5),
    lineHeight: 22,
  },
  featuresList: {
    gap: 12,
  },
  featureItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
  },
  featureItemText: {
    flex: 1,
    fontSize: scaleFont(13.5),
    lineHeight: 20,
  },

  bottomNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    gap: 16,
  },
  circleBackBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navNextBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  navNextBtnText: {
    fontSize: scaleFont(15.5),
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});