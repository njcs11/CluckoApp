import { DarkModeProvider } from '@/context/DarkModeContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { TourProvider } from '@/context/TourContext';
import InteractiveProductTour from '../components/ui/InteractiveProductTour';
import AccountSuspendedModal from '../components/ui/AccountSuspendedModal';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { apiCheckHeartbeatStatus } from '../lib/api';

export default function RootLayout() {
  useEffect(() => {
    // Proactively verify session status every 5 seconds to instantly lock out and show appeal modal if account is suspended
    const interval = setInterval(() => {
      apiCheckHeartbeatStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, []);
  return (
    <DarkModeProvider>
      <NotificationProvider>
        <TourProvider>
          <StatusBar style="auto" />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'ios_from_right',
              animationDuration: 280,
              gestureEnabled: true,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
            <Stack.Screen name="login" options={{ animation: 'fade', animationDuration: 220 }} />
            <Stack.Screen name="signup" options={{ animation: 'ios_from_right', animationDuration: 280 }} />
            <Stack.Screen name="forgot-password" options={{ animation: 'ios_from_right', animationDuration: 280 }} />
            <Stack.Screen name="chicken/[id]" options={{ animation: 'ios_from_right', animationDuration: 280 }} />
            <Stack.Screen name="farm/[id]" options={{ animation: 'ios_from_right', animationDuration: 280 }} />
            <Stack.Screen name="tasks/index" options={{ animation: 'fade_from_bottom', animationDuration: 280 }} />
            <Stack.Screen
              name="subscription"
              options={{
                presentation: 'modal',
                animation: 'fade_from_bottom',
                animationDuration: 280,
              }}
            />
            <Stack.Screen name="server-settings" options={{ animation: 'ios_from_right', animationDuration: 280 }} />
          </Stack>
          <InteractiveProductTour />
          <AccountSuspendedModal />
        </TourProvider>
      </NotificationProvider>
    </DarkModeProvider>
  );
}