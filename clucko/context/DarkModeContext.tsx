import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

type ThemeColors = {
  background: string;
  card: string;
  text: string;
  textSecondary: string;
  textLight: string;
  primary: string;
  primaryDark: string;
  error: string;
  success: string;
  warning: string;
  border: string;
  divider: string;
  surface: string;
  headerText: string;
  headerSubtext: string;
  statCard: string;
  statCardWarning: string;
  cardShadow: string;
  modalBackground: string;
  badgeBackground: string;
};

const lightColors: ThemeColors = {
  background: '#F0F4F1',
  card: '#FFFFFF',
  text: '#131A16',
  textSecondary: '#495E53',
  textLight: '#7F9489',
  primary: '#2D5541',
  primaryDark: '#1E3D2D',
  error: '#DC2626',
  success: '#2D5541',
  warning: '#D97706',
  border: '#DCE5DF',
  divider: '#E4EDE8',
  surface: '#E8EFEA',
  headerText: '#FFFFFF',
  headerSubtext: '#D5E5DC',
  statCard: '#FFFFFF',
  statCardWarning: '#FFF3EC',
  cardShadow: '#000000',
  modalBackground: '#FFFFFF',
  badgeBackground: '#DEEAE2',
};

const darkColors: ThemeColors = {
  background: '#0E1210',
  card: '#181E1B',
  text: '#EBF2EE',
  textSecondary: '#A3B5AA',
  textLight: '#6C8074',
  primary: '#8FE0B0',
  primaryDark: '#62B887',
  error: '#F87171',
  success: '#8FE0B0',
  warning: '#FBBF24',
  border: '#26322B',
  divider: '#1F2722',
  surface: '#202824',
  headerText: '#EBF2EE',
  headerSubtext: '#A3B5AA',
  statCard: '#181E1B',
  statCardWarning: '#2B1D1A',
  cardShadow: '#000000',
  modalBackground: '#141A17',
  badgeBackground: 'rgba(143, 224, 176, 0.14)',
};

interface DarkModeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  loadDarkModePreference: (overrideUserId?: string) => Promise<void>;
  colors: ThemeColors;
}

const DarkModeContext = createContext<DarkModeContextType | undefined>(undefined);

export const useDarkMode = () => {
  const context = useContext(DarkModeContext);
  if (!context) {
    throw new Error('useDarkMode must be used within a DarkModeProvider');
  }
  return context;
};

const getDarkModeStorageKey = async (overrideUserId?: string): Promise<string> => {
  try {
    if (overrideUserId) {
      return `darkMode_${overrideUserId}`;
    }
    const isGuest = await AsyncStorage.getItem('isGuestMode');
    if (isGuest === 'true') {
      return 'darkMode_guest';
    }
    const userId = await AsyncStorage.getItem('user_id');
    if (userId) {
      return `darkMode_${userId}`;
    }
    const lastEmail = await AsyncStorage.getItem('last_login_email');
    if (lastEmail) {
      return `darkMode_${lastEmail.trim().toLowerCase()}`;
    }
  } catch (e) {
    console.error('Error resolving dark mode key:', e);
  }
  return 'darkMode_default';
};

export const DarkModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  const loadDarkModePreference = async (overrideUserId?: string) => {
    try {
      const key = await getDarkModeStorageKey(overrideUserId);
      const saved = await AsyncStorage.getItem(key);
      if (saved !== null) {
        setIsDarkMode(saved === 'true');
      } else {
        // Default to false (Light Mode) so unconfigured or new accounts
        // always start in Light Mode and never inherit another account's dark mode
        setIsDarkMode(false);
      }
    } catch (error) {
      console.error('Error loading dark mode:', error);
    }
  };

  const toggleDarkMode = async () => {
    const newValue = !isDarkMode;
    setIsDarkMode(newValue);
    try {
      const key = await getDarkModeStorageKey();
      await AsyncStorage.setItem(key, newValue.toString());
    } catch (error) {
      console.error('Error saving dark mode:', error);
    }
  };

  useEffect(() => {
    loadDarkModePreference();

    // Periodically detect account / user_id changes in AsyncStorage
    let currentAccountKey: string | null = null;
    const interval = setInterval(async () => {
      try {
        const isGuest = await AsyncStorage.getItem('isGuestMode');
        const userId = await AsyncStorage.getItem('user_id');
        const accountKey = isGuest === 'true' ? 'guest' : (userId || 'none');
        if (currentAccountKey !== null && currentAccountKey !== accountKey) {
          loadDarkModePreference();
        }
        currentAccountKey = accountKey;
      } catch {}
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const colors = isDarkMode ? darkColors : lightColors;

  return (
    <DarkModeContext.Provider value={{ isDarkMode, toggleDarkMode, loadDarkModePreference, colors }}>
      {children}
    </DarkModeContext.Provider>
  );
};