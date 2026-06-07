import { Feather, FontAwesome5, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { useDarkMode } from '../../context/DarkModeContext';

const { width } = Dimensions.get('window');
const isTablet = width >= 768;

export default function TabLayout() {
  const { colors, isDarkMode } = useDarkMode();

  return (
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
              <FontAwesome5 name="drumstick-bite" size={isTablet ? 24 : 20} color={color} />
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
      />

      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarIcon: ({ focused, color }) => (
            <View style={[styles.iconContainer, focused && { backgroundColor: colors.badgeBackground }, isTablet && styles.iconContainerTablet]}>
              <MaterialIcons name="bar-chart" size={isTablet ? 26 : 22} color={color} />
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
      />
    </Tabs>
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