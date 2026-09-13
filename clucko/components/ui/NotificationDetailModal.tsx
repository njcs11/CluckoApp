import { useDarkMode } from '@/context/DarkModeContext';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import ChickenIcon from './ChickenIcon';
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
  onViewChicken: (chickenId: string) => void;
}

const getBadge = (type: string) => {
  switch (type) {
    case 'success':
      return { icon: 'checkmark-circle' as const, color: '#4CAF50' };
    case 'warning':
      return { icon: 'alert-circle' as const, color: '#FF9800' };
    case 'alert':
      return { icon: 'warning' as const, color: '#f44336' };
    default:
      return { icon: 'information-circle' as const, color: '#2196F3' };
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
  const badge = getBadge(notification.type);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
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
                  <Ionicons name="chevron-down" size={14} color={colors.textLight} style={{ marginLeft: 4 }} />
                </View>
              </View>

              <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                {notification.title}
              </Text>
              <Text style={[styles.message, { color: colors.textSecondary }]}>{notification.message}</Text>

              {notification.chickenId && (
                <TouchableOpacity
                  style={[
                    styles.chickenStrip,
                    { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' },
                  ]}
                  onPress={() => onViewChicken(notification.chickenId!)}
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

              <View style={[styles.divider, { backgroundColor: colors.divider }]} />

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.dismissButton} onPress={onClose} activeOpacity={0.7}>
                  <Text style={[styles.dismissText, { color: colors.textLight }]}>Dismiss</Text>
                </TouchableOpacity>
                {notification.chickenId ? (
                  <TouchableOpacity
                    style={[styles.viewButton, { backgroundColor: colors.primary }]}
                    onPress={() => onViewChicken(notification.chickenId!)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.viewButtonText}>View Chicken</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.viewButton, { backgroundColor: colors.primary }]}
                    onPress={onClose}
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