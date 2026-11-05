import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { apiGoogleAuth } from '../lib/api';

WebBrowser.maybeCompleteAuthSession();

/**
 * Extracts access_token from any OAuth URL (hash # or query ?).
 */
function extractToken(url: string | null): string | null {
  if (!url) return null;
  const hashMatch = url.match(/[#?&]access_token=([^&]+)/);
  if (hashMatch && hashMatch[1]) {
    return decodeURIComponent(hashMatch[1]);
  }
  return null;
}

export default function ExpoAuthSessionScreen() {
  const [statusText, setStatusText] = useState('Completing Google Sign In...');

  useEffect(() => {
    let isMounted = true;

    async function processAuth() {
      try {
        WebBrowser.maybeCompleteAuthSession();
      } catch {}

      // 1. Check if token and session are already saved in AsyncStorage
      const existingToken = await AsyncStorage.getItem('token');
      if (existingToken) {
        try {
          WebBrowser.dismissAuthSession();
        } catch {}
        if (isMounted) {
          router.replace('/(tabs)/home');
        }
        return;
      }

      // 2. Read the deep link URL from Linking
      let incomingUrl: string | null = null;
      try {
        incomingUrl = await Linking.getInitialURL();
      } catch {}

      let accessToken = extractToken(incomingUrl);

      // 3. Fallback: Check window.location if running in web/hybrid
      if (!accessToken && typeof window !== 'undefined' && window.location) {
        accessToken = extractToken(window.location.href);
      }

      if (!accessToken) {
        // Wait briefly in case the auth was handled by openAuthSessionAsync
        await new Promise((r) => setTimeout(r, 800));
        const savedToken = await AsyncStorage.getItem('token');
        if (savedToken) {
          try {
            WebBrowser.dismissAuthSession();
          } catch {}
          if (isMounted) router.replace('/(tabs)/home');
          return;
        }

        // If still no token, redirect to login
        if (isMounted) {
          setStatusText('Returning to login...');
          setTimeout(() => {
            if (isMounted) router.replace('/login');
          }, 600);
        }
        return;
      }

      // 4. We have the access_token! Fetch user profile from Google UserInfo API
      if (isMounted) setStatusText('Fetching Google Profile...');
      const userInfoRes = await fetch('https://www.googleapis.com/userinfo/v2/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userInfoRes.ok) {
        throw new Error('Failed to fetch user profile from Google.');
      }

      const googleUser = await userInfoRes.json();
      if (!googleUser.email) {
        throw new Error('Google account did not return an email address.');
      }

      // 5. Extract name
      let firstName = (googleUser.given_name || '').trim();
      let lastName = (googleUser.family_name || '').trim();
      const fullName = (googleUser.name || '').trim();

      if (!firstName && fullName) {
        const parts = fullName.split(/\s+/);
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || '';
      }

      if (!firstName) {
        firstName = googleUser.email.split('@')[0] || 'User';
      }

      // 6. Authenticate / register with Clucko backend
      if (isMounted) setStatusText('Signing into Clucko...');
      const authPayload = {
        email: googleUser.email,
        name: fullName,
        first_name: firstName,
        last_name: lastName,
        picture: googleUser.picture,
        google_id: googleUser.id,
      };

      await apiGoogleAuth(authPayload);

      try {
        WebBrowser.dismissAuthSession();
      } catch {}

      if (isMounted) {
        setStatusText('Success! Redirecting...');
        router.replace('/(tabs)/home');
      }
    }

    processAuth().catch((err) => {
      console.error('ExpoAuthSessionScreen Error:', err);
      if (isMounted) {
        setStatusText('Error completing login.');
        setTimeout(() => {
          if (isMounted) router.replace('/login');
        }, 1200);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#16a34a" />
      <Text style={styles.text}>{statusText}</Text>
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
