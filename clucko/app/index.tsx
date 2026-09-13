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
    icon: <Ionicons name="medkit-outline" size={80} color="#2e7d32" />,
    bgGradient: ['#E8F5E9', '#C8E6C9'],
    features: ['Real-time detection', 'Disease prediction'],
  },
  {
    id: '2',
    title: 'Smart QR Scanning',
    description: 'Scan QR codes on your chickens to access complete health profiles, vaccination records, and history instantly.',
    icon: <Ionicons name="qr-code-outline" size={80} color="#2e7d32" />,
    bgGradient: ['#E3F2FD', '#BBDEFB'],
    features: ['Instant access', 'Secure identification'],
  },
  {
    id: '3',
    title: 'Real-Time Alerts',
    description: 'Get instant notifications when your chickens need attention, medical care, or show abnormal behaviors.',
    icon: <Ionicons name="notifications-outline" size={80} color="#2e7d32" />,
    bgGradient: ['#FFF3E0', '#FFE0B2'],
    features: ['24/7 monitoring', 'Emergency alerts'],
  },
  {
    id: '4',
    title: 'Complete Records',
    description: 'Track health history, medications, weight trends, and performance analytics all in one place.',
    icon: <Ionicons name="analytics-outline" size={80} color="#2e7d32" />,
    bgGradient: ['#F3E5F5', '#E1BEE7'],
    features: ['Data insights', 'Export reports'],
  },
];

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  // Measured from the actual rendered letterbox column via onLayout, NOT
  // from useWindowDimensions. This is the fix for the cut-off text: paging
  // width now always matches what's really on screen, on any device or
  // embedded frame, instead of trusting a hook value that can be stale
  // before layout settles.
  const [columnWidth, setColumnWidth] = useState(0);
  const [columnHeight, setColumnHeight] = useState(0);

  const small = isSmallDevice() || columnHeight < 700;
  const isWideScreen = columnWidth > 0 && columnWidth >= MAX_PHONE_WIDTH;

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

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
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>

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
              {onboardingData.map((item) => (
                <View key={item.id} style={[styles.slide, { width: columnWidth, height: columnHeight }]}>
                  <LinearGradient colors={item.bgGradient as unknown as readonly [string, string]} style={styles.slideGradient}>
                    <View style={[styles.iconContainer, { marginBottom: scaleHeight(32) }]}>
                      <View
                        style={[
                          styles.iconCircle,
                          {
                            width: scaleWidth(isWideScreen ? 140 : 160),
                            height: scaleHeight(isWideScreen ? 140 : 160),
                            borderRadius: scaleWidth(isWideScreen ? 70 : 80),
                          },
                        ]}
                      >
                        <View
                          style={{
                            width: scaleWidth(isWideScreen ? 100 : 80),
                            height: scaleHeight(isWideScreen ? 100 : 80),
                          }}
                        >
                          {item.icon}
                        </View>
                      </View>
                    </View>

                    {/* No numberOfLines / no fixed single-line width — text
                        wraps naturally to however many lines the column
                        needs, so nothing gets clipped at the edge. */}
                    <Text style={[styles.title, { fontSize: scaleFont(isWideScreen ? 30 : small ? 22 : 26) }]}>
                      {item.title}
                    </Text>
                    <Text style={[styles.description, { fontSize: scaleFont(small ? 14 : 16) }]}>
                      {item.description}
                    </Text>

                    <View style={styles.featureContainer}>
                      {item.features.map((feature, idx) => (
                        <View key={idx} style={styles.featureItem}>
                          <Ionicons name="checkmark-circle" size={scaleFont(20)} color="#2e7d32" />
                          <Text style={[styles.featureText, { fontSize: scaleFont(small ? 12 : 14) }]}>
                            {feature}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </LinearGradient>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.paginationContainer}>
            {onboardingData.map((_, i) => (
              <TouchableOpacity key={i} onPress={() => goToSlide(i)}>
                <View
                  style={[
                    styles.paginationDot,
                    {
                      width: i === currentIndex ? scaleWidth(24) : scaleWidth(8),
                      opacity: i === currentIndex ? 1 : 0.3,
                    },
                  ]}
                />
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.nextButtonContainer, { paddingHorizontal: scaleWidth(30), paddingBottom: scaleHeight(40) + insets.bottom }]}>
            <TouchableOpacity style={styles.nextButton} onPress={handleNext} activeOpacity={0.8}>
              <LinearGradient colors={['#2e7d32', '#1b5e20']} style={styles.nextButtonGradient}>
                <Text style={[styles.nextButtonText, { fontSize: scaleFont(small ? 16 : 18) }]}>
                  {currentIndex === onboardingData.length - 1 ? 'Get Started' : 'Next'}
                </Text>
                <Ionicons name="arrow-forward" size={scaleFont(20)} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
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

  skipButton: {
    position: 'absolute',
    top: 16,
    right: 20,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  skipText: { fontSize: 16, color: '#2e7d32', fontWeight: '600' },
  scrollView: { flex: 1 },
  slide: { alignItems: 'center', justifyContent: 'center' },
  slideGradient: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scaleWidth(30),
    paddingTop: scaleHeight(80),
    paddingBottom: scaleHeight(120),
  },
  iconContainer: {},
  iconCircle: {
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontWeight: 'bold',
    color: '#2e7d32',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    color: '#555',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  featureContainer: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 12, marginTop: 20 },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  featureText: { color: '#2e7d32', fontWeight: '500' },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    gap: 8,
  },
  paginationDot: { height: 8, borderRadius: 4, backgroundColor: '#2e7d32' },
  nextButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  nextButton: {
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  nextButtonGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 10 },
  nextButtonText: { color: '#fff', fontWeight: 'bold' },
});