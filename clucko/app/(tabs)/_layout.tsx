import { useDarkMode } from '@/context/DarkModeContext';
import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from "expo-router/react-navigation";
import { Tabs, router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import ChickenIcon from '../../components/ui/ChickenIcon';
import GuestBlockModal from '../../components/ui/GuestBlockModal';
import { useRole } from '../../hooks/useRole';

const { width } = Dimensions.get('window');
const isTablet = width >= 768;

interface AnimatedTabIconProps {
  focused: boolean;
  color: any;
  iconName: string;
  focusedIconName?: string;
  iconType?: 'ionicons' | 'chicken';
  isTablet: boolean;
}

function AnimatedTabIcon({
  focused,
  color,
  iconName,
  focusedIconName,
  iconType = 'ionicons',
  isTablet,
}: AnimatedTabIconProps) {
  const { colors, isDarkMode } = useDarkMode();
  const scaleAnim = useRef(new Animated.Value(focused ? 1.08 : 1)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: focused ? 1.08 : 1,
      friction: 6,
      tension: 120,
      useNativeDriver: true,
    }).start();
  }, [focused]);

  const activeName = focused && focusedIconName ? focusedIconName : iconName;

  return (
    <View style={[styles.tabIconWrapper, isTablet && styles.tabIconWrapperTablet]}>
      <Animated.View
        style={[
          styles.iconContainer,
          isTablet && styles.iconContainerTablet,
          {
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {iconType === 'chicken' ? (
          <ChickenIcon size={isTablet ? 24 : 21} color={color} />
        ) : (
          <Ionicons name={activeName as any} size={isTablet ? 25 : 22} color={color} />
        )}
      </Animated.View>
    </View>
  );
}

function CurvedTabBarBackground({
  width: barWidth,
  height = 66,
  isDarkMode,
}: {
  width: number;
  height?: number;
  isDarkMode: boolean;
}) {
  const cx = barWidth / 2;
  const scoopW = 42;
  const scoopDepth = 30;

  const d = `
    M 0 0
    L ${cx - scoopW} 0
    C ${cx - scoopW + 15} 0, ${cx - 22} ${scoopDepth}, ${cx} ${scoopDepth}
    C ${cx + 22} ${scoopDepth}, ${cx + scoopW - 15} 0, ${cx + scoopW} 0
    L ${barWidth} 0
    L ${barWidth} ${height}
    L 0 ${height}
    Z
  `;

  const fillColor = isDarkMode ? '#131A16' : '#FFFFFF';
  const strokeColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  return (
    <View style={styles.tabBarBackgroundWrap} pointerEvents="none">
      <Svg width={barWidth} height={height} viewBox={`0 0 ${barWidth} ${height}`}>
        <Path d={d} fill={fillColor} stroke={strokeColor} strokeWidth={1} />
      </Svg>
    </View>
  );
}

function AnimatedCenterButton({ isTablet }: { isTablet: boolean }) {
  const { isDarkMode } = useDarkMode();
  // Darkest green in our palette (#1E3D2D)
  const darkestGreen = isDarkMode ? '#172E22' : '#1E3D2D';

  return (
    <View
      style={[
        styles.centerButtonOuter,
        {
          backgroundColor: darkestGreen,
        },
        isTablet && styles.centerButtonOuterTablet,
      ]}
    >
      <View style={styles.centerIconWrap}>
        <Feather name="camera" size={isTablet ? 28 : 23} color="#FFFFFF" />
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { colors, isDarkMode } = useDarkMode();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [guestModalVisible, setGuestModalVisible] = useState(false);
  const [guestFeature, setGuestFeature] = useState('this feature');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const { isCaretaker } = useRole();

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
        router.replace('/login');
        return;
      } finally {
        setCheckingAuth(false);
      }
    };

    verifyAccess();
  }, []);

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
      e.preventDefault();
      setGuestFeature(featureLabel);
      setGuestModalVisible(true);
    }
  };

  const barWidth = screenWidth;
  const barHeight = (isTablet ? 72 : 64) + (Platform.OS === 'ios' ? insets.bottom : 0);
  const paddingBottom = Platform.OS === 'ios' ? Math.max(insets.bottom, 6) : 6;

  if (checkingAuth) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: isDarkMode ? '#6C7F74' : '#8A9990',
          tabBarStyle: {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: barHeight,
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            elevation: 0,
            shadowColor: 'transparent',
            paddingBottom: paddingBottom,
            paddingTop: 6,
          },
          tabBarBackground: () => (
            <CurvedTabBarBackground
              width={barWidth}
              height={barHeight}
              isDarkMode={isDarkMode}
            />
          ),
          tabBarLabelStyle: {
            fontSize: isTablet ? 12 : 10.5,
            fontWeight: '600',
            marginTop: 1,
          },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            tabBarIcon: ({ focused, color }) => (
              <AnimatedTabIcon
                focused={focused}
                color={color}
                iconName="home-outline"
                focusedIconName="home"
                isTablet={isTablet}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="chickens"
          options={{
            title: 'Chickens',
            tabBarIcon: ({ focused, color }) => (
              <AnimatedTabIcon
                focused={focused}
                color={color}
                iconName="egg-outline"
                iconType="chicken"
                isTablet={isTablet}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="capture"
          options={{
            title: '',
            tabBarIcon: ({ focused }) => (
              <AnimatedCenterButton isTablet={isTablet} />
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
              <AnimatedTabIcon
                focused={focused}
                color={color}
                iconName="stats-chart-outline"
                focusedIconName="stats-chart"
                isTablet={isTablet}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ focused, color }) => (
              <AnimatedTabIcon
                focused={focused}
                color={color}
                iconName="person-outline"
                focusedIconName="person"
                isTablet={isTablet}
              />
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
  tabIconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabIconWrapperTablet: {
    paddingTop: 2,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  iconContainerTablet: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  tabBarBackgroundWrap: {
    ...StyleSheet.absoluteFill,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 8,
  },
  centerButtonOuter: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginTop: -20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButtonOuterTablet: {
    width: 62,
    height: 62,
    borderRadius: 31,
    marginTop: -24,
  },
  centerIconWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});