import { useDarkMode } from '@/context/DarkModeContext';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
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

interface GuestBlockModalProps {
  visible: boolean;
  onClose: () => void;
  featureLabel?: string;
}

// Restriction tint — mirrors the amber "warning" badge color used by
// NotificationDetailModal's getBadge(), since guest mode is a soft
// restriction rather than an error.
const RESTRICTION_COLOR = '#FF9800';

// Rebuilt to visually match NotificationDetailModal: a top-aligned banner
// that slides down + fades in, same "CLUCKO" app-icon header with a badge
// dot, same title/message/divider/action-row structure — instead of the
// old centered dialog card. Message + Sign Up / Login actions are kept
// from the original GuestBlockModal, just restyled into this shape.
export default function GuestBlockModal({ visible, onClose, featureLabel = 'this feature' }: GuestBlockModalProps) {
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

  const handleLogin = () => {
    onClose();
    router.push('/login');
  };

  const handleSignup = () => {
    onClose();
    router.push('/signup');
  };

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
                      { backgroundColor: RESTRICTION_COLOR, borderColor: isDarkMode ? colors.card : '#fff' },
                    ]}
                  >
                    <Ionicons name="lock-closed" size={9} color="#fff" />
                  </View>
                </View>

                <Text style={[styles.appName, { color: colors.textLight }]} numberOfLines={1}>
                  CLUCKO
                </Text>

                <View style={styles.headerRight}>
                  <Text style={[styles.restrictedTag, { color: RESTRICTION_COLOR }]}>GUEST MODE</Text>
                </View>
              </View>

              <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                You're browsing as a guest
              </Text>
              <Text style={[styles.message, { color: colors.textSecondary }]}>
                You are in guest mode, some functions may not be accessed or used. Sign up or log in to unlock{' '}
                {featureLabel}.
              </Text>

              <View
                style={[
                  styles.restrictionStrip,
                  { backgroundColor: RESTRICTION_COLOR + '12', borderColor: RESTRICTION_COLOR + '30' },
                ]}
              >
                <View style={[styles.restrictionStripIcon, { backgroundColor: RESTRICTION_COLOR + '20' }]}>
                  <Ionicons name="lock-closed-outline" size={14} color={RESTRICTION_COLOR} />
                </View>
                <Text style={[styles.restrictionStripText, { color: RESTRICTION_COLOR }]} numberOfLines={1}>
                  Restricted: {featureLabel}
                </Text>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.divider }]} />

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.dismissButton} onPress={onClose} activeOpacity={0.7}>
                  <Text style={[styles.dismissText, { color: colors.textLight }]}>Not now</Text>
                </TouchableOpacity>

                <View style={styles.actionButtonsRight}>
                  <TouchableOpacity
                    style={[styles.loginButton, { borderColor: colors.primary }]}
                    onPress={handleLogin}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.loginButtonText, { color: colors.primary }]}>Login</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.signupButton, { backgroundColor: colors.primary }]}
                    onPress={handleSignup}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.signupButtonText}>Sign Up</Text>
                  </TouchableOpacity>
                </View>
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
  restrictedTag: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  title: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  message: { fontSize: 13.5, lineHeight: 19 },
  restrictionStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  restrictionStripIcon: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  restrictionStripText: { flex: 1, fontSize: 13, fontWeight: '600' },
  divider: { height: 1, marginTop: 16, marginBottom: 12 },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dismissButton: { paddingVertical: 10, paddingHorizontal: 6 },
  dismissText: { fontSize: 14, fontWeight: '600' },
  actionButtonsRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loginButton: { borderRadius: 22, paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1 },
  loginButtonText: { fontSize: 14, fontWeight: '700' },
  signupButton: { borderRadius: 22, paddingVertical: 10, paddingHorizontal: 18 },
  signupButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});