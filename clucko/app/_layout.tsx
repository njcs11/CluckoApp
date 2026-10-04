// app/_layout.tsx
import { DarkModeProvider } from '@/context/DarkModeContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';

export default function RootLayout() {
  return (
    <DarkModeProvider>
      <NotificationProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login" />
          <Stack.Screen name="signup" />
          <Stack.Screen name="forgot-password" />
          <Stack.Screen name="chicken/[id]" />
          <Stack.Screen name="farm/[id]" />
          <Stack.Screen name="tasks/index" />
          <Stack.Screen name="subscription" />
          <Stack.Screen name="server-settings" />
        </Stack>
      </NotificationProvider>
    </DarkModeProvider>
  );
}