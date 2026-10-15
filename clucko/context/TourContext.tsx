import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Dimensions, Platform } from 'react-native';
import { router } from 'expo-router';

const { width: screenWidth } = Dimensions.get('window');

export interface TourStep {
  id: string;
  stepNumber: number;
  totalSteps: number;
  route: string;
  title: string;
  instruction: string;
  spotlight: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    width?: number;
    height?: number;
    borderRadius?: number;
  };
  caretPosition: 'top' | 'bottom';
  tooltipTop?: number;
  tooltipBottom?: number;
}

export const ESSENTIAL_TOUR_STEPS: TourStep[] = [
  {
    id: 'plan_quota',
    stepNumber: 1,
    totalSteps: 4,
    route: '/(tabs)/home',
    title: 'Plan & AI Scans Quota',
    instruction: 'Keep track of your active plan tier and remaining AI disease scans right from your home screen.',
    spotlight: {
      top: Platform.OS === 'android' ? 104 : 96,
      left: 16,
      width: screenWidth - 32,
      height: 38,
      borderRadius: 19,
    },
    caretPosition: 'top',
    tooltipTop: Platform.OS === 'android' ? 154 : 146,
  },
  {
    id: 'ai_scanner',
    stepNumber: 2,
    totalSteps: 4,
    route: '/(tabs)/home',
    title: 'AI Disease Scanner',
    instruction: 'Tap the center camera anytime to take or upload photos of your chicken’s eyes, comb, or head for instant AI detection.',
    spotlight: {
      bottom: Platform.OS === 'android' ? 37 : 39,
      left: screenWidth / 2 - 31,
      width: 62,
      height: 62,
      borderRadius: 31,
    },
    caretPosition: 'bottom',
    tooltipBottom: Platform.OS === 'android' ? 124 : 128,
  },
  {
    id: 'manage_farms_flock',
    stepNumber: 3,
    totalSteps: 4,
    route: '/(tabs)/chickens',
    title: 'Flock & Farm Management',
    instruction: 'Tap "Manage Farms" right here to access your farm details, add coops, and manage your gamefowl chickens.',
    spotlight: {
      top: Platform.OS === 'android' ? 110 : 98,
      left: 18,
      width: 144,
      height: 38,
      borderRadius: 19,
    },
    caretPosition: 'top',
    tooltipTop: Platform.OS === 'android' ? 160 : 148,
  },
  {
    id: 'offline_upload',
    stepNumber: 4,
    totalSteps: 4,
    route: '/(tabs)/capture',
    title: 'Offline Farm Photo Upload',
    instruction: 'No WiFi or signal at the farm? Take photos of your chickens first. Once you have internet connection, tap this gallery button to upload photos one by one and run AI detection.',
    spotlight: {
      bottom: Platform.OS === 'android' ? 120 : 116,
      left: screenWidth / 2 - 122,
      width: 52,
      height: 52,
      borderRadius: 26,
    },
    caretPosition: 'bottom',
    tooltipBottom: Platform.OS === 'android' ? 198 : 194,
  },
];

interface TourContextValue {
  showWelcomeModal: boolean;
  isTourActive: boolean;
  currentStepIndex: number;
  totalSteps: number;
  currentStep: TourStep;
  startTour: () => void;
  beginSteps: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
}

const TOUR_STORAGE_KEY = '@has_seen_product_tour_v3';

const TourContext = createContext<TourContextValue | undefined>(undefined);

export const TourProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [isTourActive, setIsTourActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Check if user has seen tour
  useEffect(() => {
    const checkTourStatus = async () => {
      try {
        const seen = await AsyncStorage.getItem(TOUR_STORAGE_KEY);
        const isLoggedIn = await AsyncStorage.getItem('isLoggedIn');
        if (!seen && isLoggedIn === 'true') {
          setShowWelcomeModal(true);
        }
      } catch (e) {
        console.warn('Error reading tour status:', e);
      }
    };
    checkTourStatus();
  }, []);

  const startTour = useCallback(() => {
    setCurrentStepIndex(0);
    setShowWelcomeModal(true);
    setIsTourActive(false);
  }, []);

  const beginSteps = useCallback(() => {
    setShowWelcomeModal(false);
    setCurrentStepIndex(0);
    setIsTourActive(true);
    router.push('/(tabs)/home');
  }, []);

  const skipTour = useCallback(async () => {
    setShowWelcomeModal(false);
    setIsTourActive(false);
    try {
      await AsyncStorage.setItem(TOUR_STORAGE_KEY, 'true');
    } catch (_) {}
    router.push('/(tabs)/home');
  }, []);

  const nextStep = useCallback(async () => {
    if (currentStepIndex < ESSENTIAL_TOUR_STEPS.length - 1) {
      const nextIdx = currentStepIndex + 1;
      const targetStep = ESSENTIAL_TOUR_STEPS[nextIdx];
      setCurrentStepIndex(nextIdx);
      if (targetStep.route) {
        router.push(targetStep.route as any);
      }
    } else {
      // Completed tour!
      skipTour();
    }
  }, [currentStepIndex, skipTour]);

  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      const prevIdx = currentStepIndex - 1;
      const targetStep = ESSENTIAL_TOUR_STEPS[prevIdx];
      setCurrentStepIndex(prevIdx);
      if (targetStep.route) {
        router.push(targetStep.route as any);
      }
    }
  }, [currentStepIndex]);

  const currentStep = ESSENTIAL_TOUR_STEPS[currentStepIndex] || ESSENTIAL_TOUR_STEPS[0];

  return (
    <TourContext.Provider
      value={{
        showWelcomeModal,
        isTourActive,
        currentStepIndex,
        totalSteps: ESSENTIAL_TOUR_STEPS.length,
        currentStep,
        startTour,
        beginSteps,
        nextStep,
        prevStep,
        skipTour,
      }}
    >
      {children}
    </TourContext.Provider>
  );
};

export const useTour = (): TourContextValue => {
  const ctx = useContext(TourContext);
  if (!ctx) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return ctx;
};
