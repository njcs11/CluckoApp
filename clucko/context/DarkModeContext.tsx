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
  background: '#F5F5F5',
  card: '#FFFFFF',
  text: '#333333',
  textSecondary: '#666666',
  textLight: '#999999',
  primary: '#2E7D32',
  primaryDark: '#1B5E20',
  error: '#f44336',
  success: '#4CAF50',
  warning: '#FF9800',
  border: '#E0E0E0',
  divider: '#EEEEEE',
  surface: '#FFFFFF',
  headerText: '#FFFFFF',
  headerSubtext: '#C8E6C9',
  statCard: '#FFFFFF',
  statCardWarning: '#FFF3E0',
  cardShadow: '#000000',
  modalBackground: '#FFFFFF',
  badgeBackground: '#E8F5E9',
};

const darkColors: ThemeColors = {
  background: '#121212',
  card: '#1E1E1E',
  text: '#FFFFFF',
  textSecondary: '#B0B0B0',
  textLight: '#808080',
  primary: '#4CAF50',
  primaryDark: '#388E3C',
  error: '#ff6b6b',
  success: '#66BB6A',
  warning: '#FFB74D',
  border: '#333333',
  divider: '#2C2C2C',
  surface: '#2C2C2C',
  headerText: '#FFFFFF',
  headerSubtext: '#A5D6A7',
  statCard: '#2C2C2C',
  statCardWarning: '#3E2723',
  cardShadow: '#000000',
  modalBackground: '#1E1E1E',
  badgeBackground: '#2E3B2E',
};

interface DarkModeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
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

export const DarkModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    loadDarkModePreference();
  }, []);

  const loadDarkModePreference = async () => {
    try {
      const saved = await AsyncStorage.getItem('darkMode');
      if (saved !== null) {
        setIsDarkMode(saved === 'true');
      } else {
        setIsDarkMode(systemColorScheme === 'dark');
      }
    } catch (error) {
      console.error('Error loading dark mode:', error);
    }
  };

  const toggleDarkMode = async () => {
    const newValue = !isDarkMode;
    setIsDarkMode(newValue);
    try {
      await AsyncStorage.setItem('darkMode', newValue.toString());
    } catch (error) {
      console.error('Error saving dark mode:', error);
    }
  };

  const colors = isDarkMode ? darkColors : lightColors;

  return (
    <DarkModeContext.Provider value={{ isDarkMode, toggleDarkMode, colors }}>
      {children}
    </DarkModeContext.Provider>
  );
};