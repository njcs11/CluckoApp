import { useDarkMode } from '@/context/DarkModeContext';
import { scaleFont } from '@/utils/responsive';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  isDestructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  visible,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  icon,
  iconColor,
  isDestructive = true,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { colors, isDarkMode } = useDarkMode();

  const activeIcon = icon || (isDestructive ? 'trash-outline' : 'help-circle-outline');
  const activeColor = iconColor || (isDestructive ? '#E53935' : colors.primary);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={loading ? undefined : onCancel}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              shadowColor: '#000',
              borderColor: colors.border,
            },
          ]}
        >
          {/* Icon Circle */}
          <View style={[styles.iconCircle, { backgroundColor: activeColor + '18' }]}>
            <Ionicons name={activeIcon} size={36} color={activeColor} />
          </View>

          {/* Title */}
          <Text
            style={[
              styles.title,
              {
                color: colors.text,
                fontSize: scaleFont(18),
              },
            ]}
          >
            {title}
          </Text>

          {/* Message */}
          <Text
            style={[
              styles.message,
              {
                color: colors.textSecondary,
                fontSize: scaleFont(13.5),
              },
            ]}
          >
            {message}
          </Text>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[
                styles.cancelButton,
                {
                  borderColor: colors.border,
                  backgroundColor: isDarkMode ? '#2A2A2A' : '#F5F5F5',
                },
              ]}
              onPress={onCancel}
              activeOpacity={0.75}
              disabled={loading}
            >
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
                {cancelText}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.confirmButton,
                {
                  backgroundColor: activeColor,
                  opacity: loading ? 0.7 : 1,
                },
              ]}
              onPress={onConfirm}
              activeOpacity={0.85}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.confirmText}>{confirmText}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 350,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    borderRadius: 25,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    borderRadius: 25,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  confirmText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
