import { useDarkMode } from '@/context/DarkModeContext';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

interface ErrorModalProps {
  visible: boolean;
  title: string;
  message: string;
  type?: 'error' | 'success' | 'alert';
  onClose: () => void;
}

export default function ErrorModal({
  visible,
  title,
  message,
  type = 'error',
  onClose,
}: ErrorModalProps) {
  const { colors, isDarkMode } = useDarkMode();
  const scale = useRef(new Animated.Value(0.9)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const isSuccess = type === 'success';

  useEffect(() => {
    if (visible) {
      scale.setValue(0.9);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          friction: 8,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <Animated.View
              style={[
                styles.modalCard,
                {
                  backgroundColor: isDarkMode ? colors.card : '#FFFFFF',
                  borderColor: isSuccess
                    ? (isDarkMode ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.25)')
                    : (isDarkMode ? 'rgba(239, 83, 80, 0.3)' : 'rgba(239, 83, 80, 0.25)'),
                  opacity,
                  transform: [{ scale }],
                },
              ]}
            >
              {/* Icon Badge */}
              <View
                style={[
                  styles.iconBadge,
                  isSuccess
                    ? {
                        backgroundColor: isDarkMode ? 'rgba(16, 185, 129, 0.16)' : 'rgba(16, 185, 129, 0.12)',
                        borderColor: isDarkMode ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.25)',
                      }
                    : {
                        backgroundColor: isDarkMode ? 'rgba(239, 83, 80, 0.14)' : 'rgba(239, 83, 80, 0.1)',
                        borderColor: isDarkMode ? 'rgba(239, 83, 80, 0.35)' : 'rgba(239, 83, 80, 0.25)',
                      },
                ]}
              >
                {isSuccess ? (
                  <Ionicons name="checkmark-circle" size={38} color="#10B981" />
                ) : (
                  <Ionicons name="alert-circle" size={38} color="#EF5350" />
                )}
              </View>

              {/* Title */}
              <Text
                style={[
                  styles.title,
                  { color: isDarkMode ? '#F5F5F5' : '#18231E' },
                ]}
              >
                {title}
              </Text>

              {/* Message */}
              <Text
                style={[
                  styles.message,
                  { color: colors.textSecondary },
                ]}
              >
                {message}
              </Text>

              {/* Action Button */}
              <TouchableOpacity
                style={[
                  styles.button,
                  isSuccess
                    ? {
                        backgroundColor: '#10B981',
                        borderColor: '#10B981',
                      }
                    : {
                        backgroundColor: isDarkMode ? colors.surface : '#F3F4F6',
                        borderColor: isDarkMode ? colors.border : '#E5E7EB',
                      },
                ]}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.buttonText,
                    { color: isSuccess ? '#FFFFFF' : (isDarkMode ? '#FFFFFF' : '#18231E') },
                  ]}
                >
                  Dismiss
                </Text>
              </TouchableOpacity>
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
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 20,
  },
  iconBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  button: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
