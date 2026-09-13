import { useDarkMode } from '@/context/DarkModeContext';
import { Feather, FontAwesome5, Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from "expo-router/react-navigation";
import { Tabs, router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Dimensions, StyleSheet, View } from 'react-native';
import ChickenIcon from '../../components/ui/ChickenIcon';
import GuestBlockModal from '../../components/ui/GuestBlockModal';
import { useRole } from '../../hooks/useRole';

const { width } = Dimensions.get('window');
const isTablet = width >= 768;

export default function TabLayout() {
  const { colors, isDarkMode } = useDarkMode();
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [guestModalVisible, setGuestModalVisible] = useState(false);
  const [guestFeature, setGuestFeature] = useState('this feature');
  // NEW: gate rendering of the tabs until we've confirmed the person is
  // actually authenticated (logged in) or explicitly browsing as a guest.
  // Without this, (tabs) routes were reachable directly — e.g. stale
  // AsyncStorage/localStorage from a previous session, or just typing the
  // URL — with no redirect back to /login.
  const [checkingAuth, setCheckingAuth] = useState(true);
  const { isCaretaker } = useRole();

  // Runs once on mount: the actual access-control check for this whole
  // route group. If neither flag is true, bounce to /login before anything
  // under (tabs) ever renders.
  useEffect(() => {
    const verifyAccess = async () => {
      try {
        const [loggedIn, guestFlag] = await Promise.all([
          AsyncStorage.getItem('isLoggedIn'),
          AsyncStorage.getItem('isGuestMode'),
        ]);

        const isLoggedIn = loggedIn === 'true';
        const isGuest = guestFlag === 'true';

        if (!isLoggedIn && !isGuest) {
          router.replace('/login');
          return;
        }

        setIsGuestMode(isGuest);
      } catch (error) {
        console.error('Error verifying auth/guest status:', error);
        // Fail closed — if we can't confirm access, send them to login
        // rather than silently letting them through.
        router.replace('/login');
        return;
      } finally {
        setCheckingAuth(false);
      }
    };

    verifyAccess();
  }, []);

  // Refresh guest status every time the tab bar regains focus
  // (e.g. after logging in from a guest-triggered login prompt)
  useFocusEffect(
    useCallback(() => {
      const checkGuestStatus = async () => {
        try {
          const guestFlag = await AsyncStorage.getItem('isGuestMode');
          setIsGuestMode(guestFlag === 'true');
        } catch (error) {
          console.error('Error checking guest status:', error);
        }
      };
      checkGuestStatus();
    }, [])
  );

  const blockIfGuest = (e: any, featureLabel: string) => {
    if (isGuestMode) {
      // Prevent the default tab navigation
      e.preventDefault();
      setGuestFeature(featureLabel);
      setGuestModalVisible(true);
    }
  };

  // While we're confirming access, render nothing rather than flashing the
  // tab bar/home screen before a possible redirect fires.
  if (checkingAuth) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textLight,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: isTablet ? 75 : 65,
          paddingBottom: isTablet ? 12 : 10,
          paddingTop: isTablet ? 10 : 8,
        },
        tabBarLabelStyle: {
          fontSize: isTablet ? 13 : 11,
          fontWeight: '500',
          marginTop: isTablet ? 6 : 4,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused, color }) => (
            <View style={[styles.iconContainer, focused && { backgroundColor: colors.badgeBackground }, isTablet && styles.iconContainerTablet]}>
              <Ionicons name="home-outline" size={isTablet ? 26 : 22} color={color} />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="chickens"
        options={{
          title: 'Chickens',
          tabBarIcon: ({ focused, color }) => (
            <View style={[styles.iconContainer, focused && { backgroundColor: colors.badgeBackground }, isTablet && styles.iconContainerTablet]}>
              <ChickenIcon size={isTablet ? 25 : 21} color={color} />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="capture"
        options={{
          title: '',
          tabBarIcon: ({ focused }) => (
            <View style={[styles.centerIconContainer, { backgroundColor: colors.primary }, isTablet && styles.centerIconContainerTablet]}>
              <Feather name="camera" size={isTablet ? 32 : 28} color="#fff" />
            </View>
          ),
        }}
        listeners={{
          tabPress: (e) => blockIfGuest(e, 'Scan & Detect'),
        }}
      />

      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarIcon: ({ focused, color }) => (
            <View style={[styles.iconContainer, focused && { backgroundColor: colors.badgeBackground }, isTablet && styles.iconContainerTablet]}>
              <Ionicons name="stats-chart-outline" size={isTablet ? 25 : 21} color={color} />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused, color }) => (
            <View style={[styles.iconContainer, focused && { backgroundColor: colors.badgeBackground }, isTablet && styles.iconContainerTablet]}>
              <Ionicons name="person-outline" size={isTablet ? 26 : 22} color={color} />
            </View>
          ),
        }}
        listeners={{
          tabPress: (e) => blockIfGuest(e, 'your Profile'),
        }}
      />
    </Tabs>
    <GuestBlockModal
      visible={guestModalVisible}
      onClose={() => setGuestModalVisible(false)}
      featureLabel={guestFeature}
    />
    </>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  iconContainerTablet: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  centerIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 55,
    height: 55,
    borderRadius: 27.5,
    marginTop: -12,
    marginBottom: -8,
    shadowColor: '#2e7d32',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  centerIconContainerTablet: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
    marginTop: -16,
    marginBottom: -10,
  },
});