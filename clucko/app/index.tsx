import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { width, height } = Dimensions.get('window');

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
  const [isNavigating, setIsNavigating] = useState(false);
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      const seen = await AsyncStorage.getItem('hasSeenOnboarding');
      if (seen === 'true') {
        // Already seen onboarding, check auth and go to appropriate screen
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

  const handleNext = async () => {
    if (isNavigating) return;
    setIsNavigating(true);
    
    if (currentIndex < onboardingData.length - 1) {
      flatListRef.current?.scrollToIndex({ 
        index: currentIndex + 1, 
        animated: true 
      });
      setCurrentIndex(currentIndex + 1);
      setTimeout(() => setIsNavigating(false), 500);
    } else {
      await completeOnboarding();
      router.replace('/login');
    }
  };

  const handleSkip = async () => {
    if (isNavigating) return;
    setIsNavigating(true);
    await completeOnboarding();
    router.replace('/login');
  };

  const onScrollEnd = (e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setCurrentIndex(index);
    setIsNavigating(false);
  };

  const renderItem = ({ item }: any) => (
    <LinearGradient colors={item.bgGradient} style={styles.slide}>
      <View style={styles.iconContainer}>
        <View style={styles.iconCircle}>{item.icon}</View>
      </View>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.description}>{item.description}</Text>
      <View style={styles.featureContainer}>
        {item.features.map((feature: string, idx: number) => (
          <View key={idx} style={styles.featureItem}>
            <Ionicons name="checkmark-circle" size={20} color="#2e7d32" />
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>
    </LinearGradient>
  );

  const renderPagination = () => {
    const dots = [];
    for (let i = 0; i < onboardingData.length; i++) {
      const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
      const dotWidth = scrollX.interpolate({
        inputRange,
        outputRange: [8, 24, 8],
        extrapolate: 'clamp',
      });
      const opacity = scrollX.interpolate({
        inputRange,
        outputRange: [0.3, 1, 0.3],
        extrapolate: 'clamp',
      });
      dots.push(
        <Animated.View
          key={i}
          style={[styles.paginationDot, { width: dotWidth, opacity }]}
        />
      );
    }
    return <View style={styles.paginationContainer}>{dots}</View>;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2e7d32" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <TouchableOpacity style={styles.skipButton} onPress={handleSkip} disabled={isNavigating}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <FlatList
        ref={flatListRef}
        data={onboardingData}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: false,
        })}
        onMomentumScrollEnd={onScrollEnd}
        scrollEnabled={!isNavigating}
        style={styles.flatList}
      />

      {renderPagination()}

      <TouchableOpacity 
        style={styles.nextButton} 
        onPress={handleNext}
        disabled={isNavigating}
        activeOpacity={0.8}
      >
        <LinearGradient colors={['#2e7d32', '#1b5e20']} style={styles.nextButtonGradient}>
          <Text style={styles.nextButtonText}>
            {currentIndex === onboardingData.length - 1 ? 'Get Started' : 'Next'}
          </Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  skipButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  skipText: {
    fontSize: 16,
    color: '#2e7d32',
    fontWeight: '600',
  },
  flatList: {
    flex: 1,
  },
  slide: {
    width: width,
    height: height,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingTop: 80,
    paddingBottom: 120,
  },
  iconContainer: {
    marginBottom: 40,
  },
  iconCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
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
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2e7d32',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  featureContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 20,
  },
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
  featureText: {
    fontSize: 14,
    color: '#2e7d32',
    fontWeight: '500',
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
  },
  paginationDot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2e7d32',
    marginHorizontal: 4,
  },
  nextButton: {
    position: 'absolute',
    bottom: 40,
    left: 30,
    right: 30,
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  nextButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});