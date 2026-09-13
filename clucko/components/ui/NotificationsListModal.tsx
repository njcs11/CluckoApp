import { useDarkMode } from '@/context/DarkModeContext';
import { NotificationItem } from '@/context/NotificationContext';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import ChickenIcon from './ChickenIcon';
import {
    Animated,
    Dimensions,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';

interface NotificationsListModalProps {
  visible: boolean;
  notifications: NotificationItem[];
  onClose: () => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  onDismissOne: (id: string) => void;
  onPressNotification: (notification: NotificationItem) => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

/** Small colored badge that sits on the bottom-right of the main icon,
 *  reflects the notification's severity/type — same language as the toast. */
const getStatusBadge = (type: NotificationItem['type']) => {
  switch (type) {
    case 'success':
      return { icon: 'checkmark' as const, color: '#4CAF50' };
    case 'warning':
      return { icon: 'alert' as const, color: '#FF9800' };
    case 'alert':
      return { icon: 'warning' as const, color: '#f44336' };
    default:
      return { icon: 'information' as const, color: '#2196F3' };
  }
};

/** Main circular icon — inferred from the notification content so existing
 *  notify() calls elsewhere in the app don't need to change. */
const getMainIcon = (notification: NotificationItem) => {
  const title = notification.title.toLowerCase();
  if (title.includes('farm')) {
    return { render: (color: string) => <Ionicons name="home-outline" size={18} color={color} />, bg: '#2E7D32' };
  }
  if (title.includes('profile')) {
    return { render: (color: string) => <Ionicons name="person-outline" size={18} color={color} />, bg: '#2196F3' };
  }
  if (notification.chickenId || title.includes('chicken')) {
    return { render: (color: string) => <ChickenIcon size={16} color={color} />, bg: '#2E7D32' };
  }
  return { render: (color: string) => <Ionicons name="notifications-outline" size={17} color={color} />, bg: '#2E7D32' };
};

const formatRelative = (date: Date) => {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function NotificationsListModal({
  visible,
  notifications,
  onClose,
  onMarkAllAsRead,
  onClearAll,
  onDismissOne,
  onPressNotification,
}: NotificationsListModalProps) {
  const { colors, isDarkMode } = useDarkMode();
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(SCREEN_HEIGHT);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, damping: 18, stiffness: 140, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const [confirmVisible, setConfirmVisible] = useState(false);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const handleClearAllPress = () => {
    if (notifications.length === 0) return;
    setConfirmVisible(true);
  };

  const confirmClearAll = () => {
    setConfirmVisible(false);
    onClearAll();
  };

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={StyleSheet.absoluteFill}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: isDarkMode ? colors.card : '#fff',
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.handleWrap}>
            <View style={[styles.handle, { backgroundColor: colors.divider }]} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.headerIcon, { backgroundColor: colors.primary + '15' }]}>
              <Ionicons name="notifications" size={20} color={colors.primary} />
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
              <Text style={[styles.headerSubtitle, { color: colors.textLight }]}>
                Stay updated with your flock and account activity.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: isDarkMode ? colors.divider : '#F1F1F1' }]}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          {/* Action row */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={onMarkAllAsRead}
              activeOpacity={0.7}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={16}
                color={hasUnread ? '#4CAF50' : colors.textLight}
              />
              <Text style={[styles.actionText, { color: hasUnread ? '#4CAF50' : colors.textLight }]}>
                Mark all as read
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleClearAllPress}
              activeOpacity={0.7}
              disabled={notifications.length === 0}
            >
              <Text
                style={[
                  styles.actionText,
                  { color: notifications.length === 0 ? colors.textLight : '#f44336' },
                ]}
              >
                Clear all
              </Text>
              <Ionicons
                name="trash"
                size={15}
                color={notifications.length === 0 ? colors.textLight : '#f44336'}
              />
            </TouchableOpacity>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          {/* List */}
          {notifications.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="notifications-off-outline" size={32} color={colors.textLight} />
              <Text style={[styles.emptyText, { color: colors.textLight }]}>You're all caught up.</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {notifications.map((notification) => {
                const mainIcon = getMainIcon(notification);
                const badge = getStatusBadge(notification.type);
                return (
                  <TouchableOpacity
                    key={notification.id}
                    style={[
                      styles.card,
                      {
                        backgroundColor: notification.read
                          ? isDarkMode
                            ? colors.card
                            : '#fff'
                          : colors.primary + '0D',
                        borderColor: colors.divider,
                      },
                    ]}
                    activeOpacity={0.75}
                    onPress={() => onPressNotification(notification)}
                  >
                    <View style={styles.cardIconWrap}>
                      <View style={[styles.cardIcon, { backgroundColor: mainIcon.bg }]}>
                        {mainIcon.render('#fff')}
                      </View>
                      <View style={[styles.cardBadge, { backgroundColor: badge.color, borderColor: isDarkMode ? colors.card : '#fff' }]}>
                        <Ionicons name={badge.icon as any} size={8} color="#fff" />
                      </View>
                    </View>

                    <View style={styles.cardBody}>
                      <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                        {notification.title}
                      </Text>
                      <Text style={[styles.cardMessage, { color: colors.textSecondary }]} numberOfLines={2}>
                        {notification.message}
                      </Text>
                    </View>

                    <View style={styles.cardRight}>
                      <Text style={[styles.cardTime, { color: colors.textLight }]}>
                        {formatRelative(notification.timestamp)}
                      </Text>
                      <TouchableOpacity
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={() => onDismissOne(notification.id)}
                      >
                        <Ionicons name="close" size={17} color={colors.textLight} />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: colors.divider }]}>
            <Ionicons name="shield-checkmark-outline" size={14} color={colors.textLight} />
            <Text style={[styles.footerText, { color: colors.textLight }]}>
              We only notify you about important updates.{'\n'}Manage notification preferences in{' '}
              <Text style={[styles.footerLink, { color: colors.primary }]}>settings</Text>.
            </Text>
          </View>
        </Animated.View>

        {confirmVisible && (
          <View style={styles.confirmOverlay}>
            <TouchableWithoutFeedback onPress={() => setConfirmVisible(false)}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>

            <View style={[styles.confirmCard, { backgroundColor: isDarkMode ? colors.card : '#fff' }]}>
              <View style={[styles.confirmIcon, { backgroundColor: '#f4433618' }]}>
                <Ionicons name="trash" size={20} color="#f44336" />
              </View>
              <Text style={[styles.confirmTitle, { color: colors.text }]}>Clear all notifications?</Text>
              <Text style={[styles.confirmMessage, { color: colors.textSecondary }]}>
                This will remove every notification. This can't be undone.
              </Text>

              <View style={styles.confirmActions}>
                <TouchableOpacity
                  style={[styles.confirmCancelButton, { backgroundColor: isDarkMode ? colors.divider : '#F1F1F1' }]}
                  onPress={() => setConfirmVisible(false)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.confirmCancelText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmClearButton}
                  onPress={confirmClearAll}
                  activeOpacity={0.85}
                >
                  <Text style={styles.confirmClearText}>Clear all</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SCREEN_HEIGHT * 0.85,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 10, paddingBottom: 14 },
  headerIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 19, fontWeight: '800' },
  headerSubtitle: { fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  closeButton: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  divider: { height: 1 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  actionText: { fontSize: 13.5, fontWeight: '700' },
  list: { marginTop: 10 },
  listContent: { paddingBottom: 8, gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardIconWrap: { position: 'relative', marginRight: 12 },
  cardIcon: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  cardBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 15,
    height: 15,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  cardBody: { flex: 1, marginRight: 8 },
  cardTitle: { fontSize: 14.5, fontWeight: '700', marginBottom: 2 },
  cardMessage: { fontSize: 12.5, lineHeight: 17 },
  cardRight: { alignItems: 'flex-end', gap: 10 },
  cardTime: { fontSize: 11, fontWeight: '500' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 14, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingTop: 14,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerText: { flex: 1, fontSize: 11.5, lineHeight: 16 },
  footerLink: { fontWeight: '700' },

  confirmOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 16,
  },
  confirmIcon: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  confirmTitle: { fontSize: 16.5, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  confirmMessage: { fontSize: 13.5, lineHeight: 19, textAlign: 'center', marginBottom: 20 },
  confirmActions: { flexDirection: 'row', width: '100%', gap: 10 },
  confirmCancelButton: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  confirmCancelText: { fontSize: 14, fontWeight: '700' },
  confirmClearButton: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f44336' },
  confirmClearText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});