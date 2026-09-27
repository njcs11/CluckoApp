import { useDarkMode } from '@/context/DarkModeContext';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import ChickenIcon from './ChickenIcon';
import FarmIcon from './FarmIcon';
import {
  Animated,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

interface NotificationDetailModalProps {
  visible: boolean;
  notification: {
    title: string;
    message: string;
    type: 'success' | 'warning' | 'info' | 'alert';
    timestamp: Date;
    chickenId?: string;
    chickenName?: string;
  } | null;
  onClose: () => void;
  onViewChicken?: (chickenId: string) => void;
  onViewProfile?: () => void;
  onViewFarm?: () => void;
  onViewTasks?: () => void;
}

const getBadge = (type: string, primaryColor: string) => {
  switch (type) {
    case 'success':
      return { icon: 'checkmark-circle' as const, color: primaryColor };
    case 'warning':
      return { icon: 'alert-circle' as const, color: '#FF9800' };
    case 'alert':
      return { icon: 'warning' as const, color: '#f44336' };
    default:
      return { icon: 'information-circle' as const, color: primaryColor };
  }
};

const formatRelative = (date: Date) => {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function NotificationDetailModal({
  visible,
  notification,
  onClose,
  onViewChicken,
  onViewProfile,
  onViewFarm,
  onViewTasks,
}: NotificationDetailModalProps) {
  const { colors, isDarkMode } = useDarkMode();
  const translateY = useRef(new Animated.Value(-40)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(-40);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!notification) return null;
  const badge = getBadge(notification.type, colors.primary);

  const titleLower = (notification.title || '').toLowerCase();
  const messageLower = (notification.message || '').toLowerCase();
  const isProfile = titleLower.includes('profile') || messageLower.includes('profile');
  const isFarm = titleLower.includes('farm') || messageLower.includes('farm');
  const isTask = titleLower.includes('task') || messageLower.includes('task');
  const hasChicken = !!notification.chickenId;

  const handleChickenPress = () => {
    onClose();
    if (notification.chickenId) {
      if (onViewChicken) {
        onViewChicken(notification.chickenId);
      } else {
        router.push(`/chicken/${notification.chickenId}`);
      }
    }
  };

  const handleProfilePress = () => {
    onClose();
    if (onViewProfile) {
      onViewProfile();
    } else {
      router.push('/(tabs)/profile');
    }
  };

  const handleFarmPress = () => {
    onClose();
    if (onViewFarm) {
      onViewFarm();
    } else {
      router.push('/farm');
    }
  };

  const handleTasksPress = () => {
    onClose();
    if (onViewTasks) {
      onViewTasks();
    } else {
      router.push('/tasks');
    }
  };

  const handleBannerPress = () => {
    if (hasChicken) {
      handleChickenPress();
    } else if (isProfile) {
      handleProfilePress();
    } else if (isFarm) {
      handleFarmPress();
    } else if (isTask) {
      handleTasksPress();
    }
  };

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={handleBannerPress}>
            <Animated.View
              style={[
                styles.banner,
                {
                  backgroundColor: isDarkMode ? colors.card : '#fff',
                  opacity,
                  transform: [{ translateY }],
                },
              ]}
            >
              {/* Notification-style header */}
              <View style={styles.headerRow}>
                <View style={styles.iconWrap}>
                  <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.appIcon}>
                    <ChickenIcon size={14} color="#fff" />
                  </LinearGradient>
                  <View
                    style={[
                      styles.badgeDot,
                      { backgroundColor: badge.color, borderColor: isDarkMode ? colors.card : '#fff' },
                    ]}
                  >
                    <Ionicons name={badge.icon} size={9} color="#fff" />
                  </View>
                </View>

                <Text style={[styles.appName, { color: colors.textLight }]} numberOfLines={1}>
                  CLUCKO
                </Text>

                <View style={styles.headerRight}>
                  <Text style={[styles.timeText, { color: colors.textLight }]}>
                    {formatRelative(notification.timestamp)}
                  </Text>
                  <TouchableOpacity
                    onPress={onClose}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    style={{ marginLeft: 8, padding: 2 }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={16} color={colors.textLight} />
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                {notification.title}
              </Text>
              <Text style={[styles.message, { color: colors.textSecondary }]}>{notification.message}</Text>

              {/* Contextual Action Strips */}
              {hasChicken && (
                <TouchableOpacity
                  style={[
                    styles.chickenStrip,
                    { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' },
                  ]}
                  onPress={handleChickenPress}
                  activeOpacity={0.75}
                >
                  <View style={[styles.chickenStripIcon, { backgroundColor: colors.primary + '20' }]}>
                    <ChickenIcon size={14} color={colors.primary} />
                  </View>
                  <Text style={[styles.chickenStripText, { color: colors.primary }]} numberOfLines={1}>
                    {notification.chickenName ? `View ${notification.chickenName}'s profile` : 'View chicken profile'}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </TouchableOpacity>
              )}

              {!hasChicken && isProfile && (
                <TouchableOpacity
                  style={[
                    styles.chickenStrip,
                    { backgroundColor: colors.primary + '14', borderColor: colors.primary + '30' },
                  ]}
                  onPress={handleProfilePress}
                  activeOpacity={0.75}
                >
                  <View style={[styles.chickenStripIcon, { backgroundColor: colors.primary + '22' }]}>
                    <Ionicons name="person-outline" size={14} color={colors.primary} />
                  </View>
                  <Text style={[styles.chickenStripText, { color: colors.primary }]} numberOfLines={1}>
                    Go to your Profile
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </TouchableOpacity>
              )}

              {!hasChicken && !isProfile && isFarm && (
                <TouchableOpacity
                  style={[
                    styles.chickenStrip,
                    { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' },
                  ]}
                  onPress={handleFarmPress}
                  activeOpacity={0.75}
                >
                  <View style={[styles.chickenStripIcon, { backgroundColor: colors.primary + '20' }]}>
                    <FarmIcon size={14} color={colors.primary} />
                  </View>
                  <Text style={[styles.chickenStripText, { color: colors.primary }]} numberOfLines={1}>
                    View Farms & Flock
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </TouchableOpacity>
              )}

              {!hasChicken && !isProfile && !isFarm && isTask && (
                <TouchableOpacity
                  style={[
                    styles.chickenStrip,
                    { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' },
                  ]}
                  onPress={handleTasksPress}
                  activeOpacity={0.75}
                >
                  <View style={[styles.chickenStripIcon, { backgroundColor: colors.primary + '20' }]}>
                    <Ionicons name="checkbox-outline" size={14} color={colors.primary} />
                  </View>
                  <Text style={[styles.chickenStripText, { color: colors.primary }]} numberOfLines={1}>
                    View Scheduled Tasks
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </TouchableOpacity>
              )}

              <View style={[styles.divider, { backgroundColor: colors.divider }]} />

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.dismissButton}
                  onPress={onClose}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.dismissText, { color: colors.textLight }]}>Dismiss</Text>
                </TouchableOpacity>

                {hasChicken ? (
                  <TouchableOpacity
                    style={[styles.viewButton, { backgroundColor: colors.primary }]}
                    onPress={handleChickenPress}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.viewButtonText}>View Chicken</Text>
                  </TouchableOpacity>
                ) : isProfile ? (
                  <TouchableOpacity
                    style={[styles.viewButton, { backgroundColor: colors.primary }]}
                    onPress={handleProfilePress}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.viewButtonText}>View Profile</Text>
                  </TouchableOpacity>
                ) : isFarm ? (
                  <TouchableOpacity
                    style={[styles.viewButton, { backgroundColor: colors.primary }]}
                    onPress={handleFarmPress}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.viewButtonText}>View Farm</Text>
                  </TouchableOpacity>
                ) : isTask ? (
                  <TouchableOpacity
                    style={[styles.viewButton, { backgroundColor: colors.primary }]}
                    onPress={handleTasksPress}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.viewButtonText}>View Tasks</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.viewButton, { backgroundColor: colors.primary }]}
                    onPress={onClose}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.viewButtonText}>Got it</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 14,
  },
  banner: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 22,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  iconWrap: { position: 'relative', marginRight: 8 },
  appIcon: { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  badgeDot: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  appName: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  timeText: { fontSize: 12, fontWeight: '500' },
  title: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  message: { fontSize: 13.5, lineHeight: 19 },
  chickenStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  chickenStripIcon: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  chickenStripText: { flex: 1, fontSize: 13, fontWeight: '600' },
  divider: { height: 1, marginTop: 16, marginBottom: 12 },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16 },
  dismissButton: { paddingVertical: 10, paddingHorizontal: 6 },
  dismissText: { fontSize: 14, fontWeight: '600' },
  viewButton: { borderRadius: 22, paddingVertical: 10, paddingHorizontal: 20 },
  viewButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});