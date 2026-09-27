import { useDarkMode } from '@/context/DarkModeContext';
import { scaleFont } from '@/utils/responsive';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

export interface PhotoPickerModalProps {
  visible: boolean;
  title?: string;
  message?: string;
  onTakePhoto: () => void;
  onChooseLibrary: () => void;
  onCancel: () => void;
}

export default function PhotoPickerModal({
  visible,
  title = 'Add Photo',
  message = 'Take a new photo or choose one from your gallery.',
  onTakePhoto,
  onChooseLibrary,
  onCancel,
}: PhotoPickerModalProps) {
  const { colors, isDarkMode } = useDarkMode();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              {/* Header Icon Circle */}
              <View style={[styles.iconCircle, { backgroundColor: colors.primary + '18' }]}>
                <Ionicons name="camera" size={32} color={colors.primary} />
              </View>

              {/* Title & Description */}
              <Text
                style={[
                  styles.title,
                  {
                    color: colors.text,
                    fontSize: scaleFont(19),
                  },
                ]}
              >
                {title}
              </Text>

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
              <View style={styles.actionsContainer}>
                {/* Take Photo Button */}
                <TouchableOpacity
                  style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
                  onPress={onTakePhoto}
                  activeOpacity={0.85}
                >
                  <Ionicons name="camera-outline" size={20} color={isDarkMode ? '#0E1210' : '#FFFFFF'} />
                  <Text
                    style={[
                      styles.primaryActionText,
                      { color: isDarkMode ? '#0E1210' : '#FFFFFF', fontSize: scaleFont(15) },
                    ]}
                  >
                    Take Photo
                  </Text>
                </TouchableOpacity>

                {/* Choose from Library Button */}
                <TouchableOpacity
                  style={[
                    styles.secondaryActionBtn,
                    {
                      backgroundColor: isDarkMode ? '#222824' : '#F0FDF4',
                      borderColor: colors.primary + '40',
                    },
                  ]}
                  onPress={onChooseLibrary}
                  activeOpacity={0.85}
                >
                  <Ionicons name="images-outline" size={20} color={colors.primary} />
                  <Text
                    style={[
                      styles.secondaryActionText,
                      { color: colors.primary, fontSize: scaleFont(15) },
                    ]}
                  >
                    Choose from Library
                  </Text>
                </TouchableOpacity>

                {/* Cancel Button */}
                <TouchableOpacity
                  style={[
                    styles.cancelBtn,
                    {
                      borderColor: colors.border,
                      backgroundColor: isDarkMode ? '#1E2421' : '#F5F5F5',
                    },
                  ]}
                  onPress={onCancel}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.cancelBtnText,
                      { color: colors.textSecondary, fontSize: scaleFont(14.5) },
                    ]}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 12,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  message: {
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  actionsContainer: {
    width: '100%',
    gap: 10,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 13,
    borderRadius: 14,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryActionText: {
    fontWeight: '700',
  },
  secondaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    width: '100%',
  },
  secondaryActionText: {
    fontWeight: '700',
  },
  cancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    width: '100%',
    marginTop: 2,
  },
  cancelBtnText: {
    fontWeight: '600',
  },
});
