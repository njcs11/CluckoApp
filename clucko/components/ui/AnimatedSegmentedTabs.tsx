import { useDarkMode } from '@/context/DarkModeContext';
import { scaleFont } from '@/utils/responsive';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export interface TabItem {
  key: string;
  label: string;
  icon?: string;
  iconType?: 'ionicons' | 'feather' | 'material';
  badge?: number | string;
}

interface AnimatedSegmentedTabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChangeTab: (key: string) => void;
  activeColor?: string;
  activeTextColor?: string;
  containerStyle?: any;
}

export default function AnimatedSegmentedTabs({
  tabs,
  activeTab,
  onChangeTab,
  activeColor,
  activeTextColor,
  containerStyle,
}: AnimatedSegmentedTabsProps) {
  const { colors, isDarkMode } = useDarkMode();
  const [containerWidth, setContainerWidth] = useState(0);

  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.key === activeTab)
  );

  const slideAnim = useRef(new Animated.Value(activeIndex)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: activeIndex,
      useNativeDriver: true,
      friction: 8,
      tension: 65,
    }).start();
  }, [activeIndex]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    if (width > 0 && width !== containerWidth) {
      setContainerWidth(width);
    }
  };

  const tabWidth = containerWidth > 0 ? (containerWidth - 8) / tabs.length : 0;
  const pillColor = activeColor || colors.primary;
  const activeLabelColor = activeTextColor || (isDarkMode ? '#0E1210' : '#FFFFFF');

  const translateX = slideAnim.interpolate({
    inputRange: tabs.map((_, i) => i),
    outputRange: tabs.map((_, i) => i * tabWidth),
  });

  const renderIcon = (tab: TabItem, isActive: boolean) => {
    if (!tab.icon) return null;
    const iconColor = isActive ? activeLabelColor : colors.textSecondary;
    const size = 16;

    if (tab.iconType === 'feather') {
      return <Feather name={tab.icon as any} size={size} color={iconColor} style={styles.iconStyle} />;
    }
    if (tab.iconType === 'material') {
      return <MaterialCommunityIcons name={tab.icon as any} size={size} color={iconColor} style={styles.iconStyle} />;
    }
    return <Ionicons name={tab.icon as any} size={size} color={iconColor} style={styles.iconStyle} />;
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDarkMode ? '#1B231F' : '#E8EFEA',
          borderColor: isDarkMode ? '#2D3A33' : '#D0DDD4',
        },
        containerStyle,
      ]}
      onLayout={handleLayout}
    >
      {/* Animated Sliding Pill */}
      {tabWidth > 0 && (
        <Animated.View
          style={[
            styles.animatedPill,
            {
              width: tabWidth,
              backgroundColor: pillColor,
              transform: [{ translateX }],
              shadowColor: pillColor,
            },
          ]}
        />
      )}

      {/* Tab Buttons */}
      {tabs.map((tab, index) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tabButton}
            onPress={() => onChangeTab(tab.key)}
            activeOpacity={0.75}
          >
            <View style={styles.tabContentRow}>
              {renderIcon(tab, isActive)}
              <Text
                style={[
                  styles.tabText,
                  {
                    color: isActive ? activeLabelColor : colors.textSecondary,
                    fontWeight: isActive ? '700' : '600',
                    fontSize: scaleFont(13.5),
                  },
                ]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
              {tab.badge != null && (
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: isActive
                        ? isDarkMode
                          ? 'rgba(0,0,0,0.2)'
                          : 'rgba(255,255,255,0.3)'
                        : colors.primary + '20',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      {
                        color: isActive ? activeLabelColor : colors.primary,
                      },
                    ]}
                  >
                    {tab.badge}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 26,
    borderWidth: 1,
    padding: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  animatedPill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 22,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  tabContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  iconStyle: {
    marginRight: 1,
  },
  tabText: {
    letterSpacing: 0.2,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
    marginLeft: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
