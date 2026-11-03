import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export default function ExpoAuthSessionScreen() {
  useEffect(() => {
    // Notify the WebBrowser module that the auth session redirect has completed
    try {
      WebBrowser.maybeCompleteAuthSession();
    } catch (e) {
      console.warn('Error completing auth session:', e);
    }

    // Safety fallback: If not dismissed by the browser session within 1.5 seconds, navigate back or to home
    const timer = setTimeout(() => {
      router.replace('/(tabs)/home');
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#16a34a" />
      <Text style={styles.text}>Completing Google Sign In...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    marginTop: 16,
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
});

