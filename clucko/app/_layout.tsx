import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DarkModeProvider } from '../context/DarkModeContext';

// Root layout with auth check
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <DarkModeProvider>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="signup" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="chicken/[id]" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="auto" />
      </DarkModeProvider>
    </SafeAreaProvider>
  );
}