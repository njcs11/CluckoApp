import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  Alert,
} from 'react-native';
import { FontAwesome5, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useDarkMode } from '@/context/DarkModeContext';
import { router } from 'expo-router';

interface FlockLimitModalProps {
  visible: boolean;
  onClose: () => void;
  onDontShowAgain?: () => void;
  scansRemaining?: number;
  currentChickens?: number;
  maxChickens?: number;
  farmName?: string;
  planName?: string;
  isCaretaker?: boolean;
}

export default function FlockLimitModal({
  visible,
  onClose,
  onDontShowAgain,
  scansRemaining = 9,
  currentChickens = 20,
  maxChickens = 20,
  farmName = 'this farm',
  planName = 'Free Trial',
  isCaretaker = false,
}: FlockLimitModalProps) {
  const { colors, isDarkMode } = useDarkMode();
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0.9);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleUpgrade = () => {
    onClose();
    router.push('/subscription');
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: isDarkMode ? '#1a1d26' : '#ffffff',
              borderColor: isDarkMode ? '#2d3345' : '#e2e8f0',
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Top Close Button */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Icon Badge */}
          <View style={[styles.iconContainer, { backgroundColor: isDarkMode ? 'rgba(245, 158, 11, 0.15)' : '#fef3c7' }]}>
            <MaterialCommunityIcons name="crown-outline" size={30} color="#f59e0b" />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.text }]}>Flock Capacity Reached</Text>

          {/* Scan Balance Callout */}
          <View style={[styles.scanBadge, { backgroundColor: isDarkMode ? 'rgba(34, 197, 94, 0.14)' : '#dcfce7' }]}>
            <Ionicons name="checkmark-circle" size={15} color="#22c55e" />
            <Text style={[styles.scanBadgeText, { color: isDarkMode ? '#4ade80' : '#16a34a' }]}>
              {scansRemaining > 0 ? `${scansRemaining} AI Disease Scans Left` : 'AI Disease Scans Ready'}
            </Text>
          </View>

          {/* Description */}
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            Your farm <Text style={{ fontWeight: '700', color: colors.text }}>{farmName}</Text> has reached its maximum flock capacity of{' '}
            <Text style={{ fontWeight: '700', color: '#f59e0b' }}>{currentChickens}/{maxChickens} chickens</Text> on the {planName} plan.
          </Text>

          <Text style={[styles.subDescription, { color: colors.textSecondary }]}>
            {isCaretaker
              ? "As a caretaker, your account is managed by your Farm Owner. Please contact your Farm Owner to upgrade the farm's subscription plan to register more chickens."
              : "Upgrade to Pro (60 chickens) or Premium (unlimited) to register more gamefowl and expand your farm."}
          </Text>

          {/* Action Buttons */}
          <View style={styles.actions}>
            {isCaretaker ? (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={onClose}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>I Understand</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                  onPress={handleUpgrade}
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons name="lightning-bolt" size={17} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.primaryBtnText}>View Plans & Upgrade</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
                  <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}

            {onDontShowAgain && (
              <TouchableOpacity style={styles.dontShowAgainBtn} onPress={onDontShowAgain} activeOpacity={0.7}>
                <Text style={[styles.dontShowAgainText, { color: colors.textLight }]}>
                  Don't show this reminder again
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 390,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 14,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.35,
        shadowRadius: 20,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 6,
    borderRadius: 12,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  scanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 14,
    gap: 6,
  },
  scanBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 8,
  },
  subDescription: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 18,
    opacity: 0.85,
  },
  actions: {
    width: '100%',
    gap: 8,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    width: '100%',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  cancelBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  dontShowAgainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    marginTop: 2,
  },
  dontShowAgainText: {
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
