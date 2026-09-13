import { isSmallDevice, scaleFont, scaleHeight, scaleWidth } from '@/utils/responsive';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// Same responsive cap used across the rest of the app (capture.tsx,
// chickens.tsx) so onboarding reads as a phone column on tablets/desktop
// instead of stretching — or worse, misaligning its paged slides — edge to
// edge.
const MAX_PHONE_WIDTH = 460;

const onboardingData = [
  {
    id: '1',
    title: 'AI-Powered Health Monitoring',
    description: 'Detect early signs of illness in your gamefowls using advanced AI technology with 95% accuracy.',
    icon: 'medkit-outline' as const,
    accent: '#2E7D32',
    bgGradient: ['#EAF7EC', '#CFEBD3'] as const,
    features: ['Real-time detection', 'Disease prediction'],
  },
  {
    id: '2',
    title: 'Smart QR Scanning',
    description: 'Scan QR codes on your chickens to access complete health profiles, vaccination records, and history instantly.',
    icon: 'qr-code-outline' as const,
    accent: '#1565C0',
    bgGradient: ['#E7F1FC', '#C6E0F7'] as const,
    features: ['Instant access', 'Secure identification'],
  },
  {
    id: '3',
    title: 'Real-Time Alerts',
    description: 'Get instant notifications when your chickens need attention, medical care, or show abnormal behaviors.',
    icon: 'notifications-outline' as const,
    accent: '#E65100',
    bgGradient: ['#FFF3E5', '#FCE0C2'] as const,
    features: ['24/7 monitoring', 'Emergency alerts'],
  },
  {
    id: '4',
    title: 'Complete Records',
    description: 'Track health history, medications, weight trends, and performance analytics all in one place.',
    icon: 'analytics-outline' as const,
    accent: '#6A1B9A',
    bgGradient: ['#F5EAFB', '#E4CDF2'] as const,
    features: ['Data insights', 'Export reports'],
  },
];

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  // Measured from the actual rendered letterbox column via onLayout, NOT
  // from useWindowDimensions, so paging width always matches what's really
  // on screen on any device or embedded frame.
  const [columnWidth, setColumnWidth] = useState(0);
  const [columnHeight, setColumnHeight] = useState(0);

  const small = isSmallDevice() || columnHeight < 700;
  const isWideScreen = columnWidth > 0 && columnWidth >= MAX_PHONE_WIDTH;

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  // First-launch gate: only ever show onboarding when `hasSeenOnboarding`
  // has never been set for this install. A brand-new device/reinstall has
  // no AsyncStorage data at all, so `seen` comes back null and onboarding
  // shows; once completeOnboarding() runs, every future launch on this
  // device skips straight past it.
  const checkOnboardingStatus = async () => {
    try {
      const seen = await AsyncStorage.getItem('hasSeenOnboarding');
      if (seen === 'true') {
        const isLoggedIn = await AsyncStorage.getItem('isLoggedIn');
        if (isLoggedIn === 'true') {
          router.replace('/(tabs)/home');
        } else {
          router.replace('/login');
        }
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error checking onboarding:', error);
      setLoading(false);
    }
  };

  const completeOnboarding = async () => {
    try {
      await AsyncStorage.setItem('hasSeenOnboarding', 'true');
    } catch (error) {
      console.error('Error saving onboarding status:', error);
    }
  };

  // Re-snaps to the current slide whenever the measured width changes
  // (e.g. rotation, browser resize) so paging never drifts out of sync.
  useEffect(() => {
    if (columnWidth > 0) {
      scrollViewRef.current?.scrollTo({ x: currentIndex * columnWidth, animated: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnWidth]);

  const goToSlide = (index: number) => {
    if (columnWidth === 0) return;
    scrollViewRef.current?.scrollTo({ x: index * columnWidth, animated: true });
    setCurrentIndex(index);
  };

  const handleNext = async () => {
    if (currentIndex < onboardingData.length - 1) {
      goToSlide(currentIndex + 1);
    } else {
      await completeOnboarding();
      router.replace('/login');
    }
  };

  const handleSkip = async () => {
    await completeOnboarding();
    router.replace('/login');
  };

  const handleScrollEnd = (e: any) => {
    if (columnWidth === 0) return;
    const index = Math.round(e.nativeEvent.contentOffset.x / columnWidth);
    setCurrentIndex(index);
  };

  const handleColumnLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setColumnWidth(Math.round(width));
    setColumnHeight(Math.round(height));
  };

  const activeAccent = onboardingData[currentIndex].accent;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2e7d32" />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Letterbox backdrop — keeps onboarding phone-shaped on tablets and
          desktop web instead of stretching edge to edge, matching the
          pattern already used in capture.tsx. */}
      <View style={styles.letterbox}>
        <View
          style={[styles.phoneColumn, isWideScreen && styles.phoneColumnElevated]}
          onLayout={handleColumnLayout}
        >
          {/* --- Top bar: segmented progress + Skip --- */}
          <View style={[styles.topBar, { paddingHorizontal: scaleWidth(24), paddingTop: scaleHeight(14) }]}>
            <View style={styles.progressRow}>
              {onboardingData.map((slide, i) => (
                <View key={slide.id} style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: slide.accent,
                        width: i < currentIndex ? '100%' : i === currentIndex ? '55%' : '0%',
                      },
                    ]}
                  />
                </View>
              ))}
            </View>
            <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={[styles.skipText, { color: activeAccent }]}>Skip</Text>
            </TouchableOpacity>
          </View>

          {columnWidth > 0 && (
            <ScrollView
              ref={scrollViewRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handleScrollEnd}
              style={styles.scrollView}
              contentContainerStyle={{ width: columnWidth * onboardingData.length }}
              // snapToInterval backed by the SAME measured width as paging
              // math above, so momentum scrolling can never land the
              // ScrollView between two slides.
              snapToInterval={columnWidth}
              decelerationRate="fast"
            >
              {onboardingData.map((item) => {
                const slideHeight = columnHeight - scaleHeight(64); // minus top bar
                return (
                  <View key={item.id} style={[styles.slide, { width: columnWidth, height: columnHeight }]}>
                    <LinearGradient colors={item.bgGradient} style={styles.slideGradient}>
                      {/* Decorative accent rings — echoes the ring motif
                          used on Home/Chickens headers, so onboarding
                          feels visually part of the same app instead of a
                          bolted-on intro flow. */}
                      <View pointerEvents="none" style={[styles.decoRingLarge, { borderColor: item.accent + '14' }]} />
                      <View pointerEvents="none" style={[styles.decoRingSmall, { borderColor: item.accent + '10' }]} />

                      <View
                        style={[
                          styles.iconBadge,
                          {
                            width: scaleWidth(isWideScreen ? 116 : small ? 108 : 128),
                            height: scaleWidth(isWideScreen ? 116 : small ? 108 : 128),
                            borderRadius: scaleWidth(isWideScreen ? 58 : small ? 54 : 64),
                            marginTop: scaleHeight(small ? 12 : 28),
                          },
                        ]}
                      >
                        <View style={[styles.iconBadgeRing, { borderColor: item.accent + '30' }]} />
                        <Ionicons
                          name={item.icon}
                          size={scaleFont(isWideScreen ? 52 : small ? 44 : 54)}
                          color={item.accent}
                        />
                      </View>

                      {/* Floating "glass" content card — title, description
                          and feature chips sit on a translucent white
                          card over the gradient instead of directly on
                          the color, giving clearer text contrast and a
                          distinct look from the old flat-gradient slide. */}
                      <View style={[styles.contentCard, { marginTop: scaleHeight(small ? 20 : 30) }]}>
                        <Text
                          style={[
                            styles.title,
                            { color: item.accent, fontSize: scaleFont(isWideScreen ? 26 : small ? 20 : 23) },
                          ]}
                        >
                          {item.title}
                        </Text>
                        <Text style={[styles.description, { fontSize: scaleFont(small ? 13 : 15) }]}>
                          {item.description}
                        </Text>

                        <View style={styles.featureContainer}>
                          {item.features.map((feature, idx) => (
                            <View key={idx} style={[styles.featureItem, { borderColor: item.accent + '30' }]}>
                              <Ionicons name="checkmark-circle" size={scaleFont(16)} color={item.accent} />
                              <Text style={[styles.featureText, { color: item.accent, fontSize: scaleFont(small ? 11 : 13) }]}>
                                {feature}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    </LinearGradient>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.paginationContainer}>
            {onboardingData.map((slide, i) => (
              <TouchableOpacity key={slide.id} onPress={() => goToSlide(i)} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}>
                <View
                  style={[
                    styles.paginationDot,
                    {
                      width: i === currentIndex ? scaleWidth(22) : scaleWidth(7),
                      backgroundColor: i === currentIndex ? slide.accent : '#B0B0B0',
                      opacity: i === currentIndex ? 1 : 0.5,
                    },
                  ]}
                />
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.nextButtonContainer, { paddingHorizontal: scaleWidth(24), paddingBottom: scaleHeight(30) + insets.bottom }]}>
            <TouchableOpacity style={styles.nextButton} onPress={handleNext} activeOpacity={0.85}>
              <LinearGradient colors={[activeAccent, shade(activeAccent)]} style={styles.nextButtonGradient}>
                <Text style={[styles.nextButtonText, { fontSize: scaleFont(small ? 15 : 17) }]}>
                  {currentIndex === onboardingData.length - 1 ? 'Get Started' : 'Next'}
                </Text>
                <Ionicons name="arrow-forward" size={scaleFont(19)} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

// Cheap darken for the button's gradient end color so each slide's "Next"
// button matches that slide's accent instead of a single fixed green.
function shade(hex: string, amount: number = 0.28): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.floor(((num >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.floor(((num >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.floor((num & 0xff) * (1 - amount)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },

  // --- Responsive letterbox / phone column ---
  letterbox: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneColumn: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_PHONE_WIDTH,
  },
  phoneColumnElevated: {
    borderRadius: 24,
    overflow: 'hidden',
    marginVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },

  // --- Top bar: progress + skip ---
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    height: 44,
    zIndex: 10,
    backgroundColor: '#fff',
  },
  progressRow: { flex: 1, flexDirection: 'row', gap: 6 },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#E4E4E4', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  skipText: { fontSize: 14, fontWeight: '700' },

  scrollView: { flex: 1 },
  slide: { alignItems: 'center', justifyContent: 'flex-start' },
  slideGradient: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: scaleWidth(24),
    paddingBottom: scaleHeight(110),
    position: 'relative',
    overflow: 'hidden',
  },

  decoRingLarge: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 30,
  },
  decoRingSmall: {
    position: 'absolute',
    bottom: 40,
    left: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 20,
  },

  iconBadge: {
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 8,
    position: 'relative',
  },
  iconBadgeRing: {
    position: 'absolute',
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    borderRadius: 999,
    borderWidth: 2,
  },

  // Floating "glass" card holding title/description/feature chips —
  // distinct from the old design where everything sat flat on the
  // gradient with no separation.
  contentCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 24,
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    width: '100%',
    flexShrink: 1,
  },
  description: {
    color: '#4A4A4A',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 18,
    width: '100%',
    flexShrink: 1,
  },
  featureContainer: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8 },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  featureText: { fontWeight: '600' },

  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: 96,
    left: 0,
    right: 0,
    gap: 7,
  },
  paginationDot: { height: 7, borderRadius: 3.5 },

  nextButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  nextButton: {
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  nextButtonGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, gap: 10 },
  nextButtonText: { color: '#fff', fontWeight: 'bold' },
});