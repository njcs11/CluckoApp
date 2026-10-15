import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useDarkMode } from '@/context/DarkModeContext';
import { LinearGradient } from 'expo-linear-gradient';

interface ProfileEditInProgressModalProps {
  visible: boolean;
  onStay: () => void;
  onDiscard?: () => void;
  message?: string;
}

export default function ProfileEditInProgressModal({
  visible,
  onStay,
  onDiscard,
  message,
}: ProfileEditInProgressModalProps) {
  const { colors, isDarkMode } = useDarkMode();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onStay}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: isDarkMode ? '#374151' : '#E5E7EB',
            },
          ]}
        >
          {/* Animated Warning Icon Wrap */}
          <View style={styles.iconContainer}>
            <View style={styles.iconOuterRing}>
              <View style={styles.iconInnerCircle}>
                <MaterialCommunityIcons
                  name="account-edit-outline"
                  size={32}
                  color="#F59E0B"
                />
              </View>
            </View>
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.text }]}>
            Profile Edit in Progress
          </Text>

          {/* Description */}
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {message ||
              'You have unsaved changes in your profile. Please save your changes or cancel edit mode before navigating away.'}
          </Text>

          {/* Quick Notice Badge */}
          <View
            style={[
              styles.noticeBadge,
              {
                backgroundColor: isDarkMode ? '#1E293B' : '#FEF3C7',
                borderColor: '#F59E0B',
              },
            ]}
          >
            <Ionicons name="information-circle" size={18} color="#D97706" />
            <Text style={[styles.noticeText, { color: isDarkMode ? '#FCD34D' : '#92400E' }]}>
              Unsaved edits will be lost if you leave without saving.
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            {/* Primary Button: Keep Editing */}
            <TouchableOpacity
              style={styles.stayButton}
              onPress={onStay}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={['#2D5541', '#1B3528']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.stayGradient}
              >
                <Ionicons name="create-outline" size={18} color="#fff" />
                <Text style={styles.stayText}>Keep Editing Profile</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Optional Discard Button */}
            {onDiscard && (
              <TouchableOpacity
                style={[
                  styles.discardButton,
                  {
                    borderColor: isDarkMode ? '#374151' : '#E5E7EB',
                    backgroundColor: isDarkMode ? '#1F2937' : '#F9FAFB',
                  },
                ]}
                onPress={onDiscard}
                activeOpacity={0.8}
              >
                <Ionicons name="close-circle-outline" size={18} color="#EF4444" />
                <Text style={styles.discardText}>Discard Changes & Leave</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    marginBottom: 16,
  },
  iconOuterRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconInnerCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(245, 158, 11, 0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  noticeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
    width: '100%',
  },
  noticeText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
    lineHeight: 16,
  },
  actions: {
    width: '100%',
    gap: 10,
  },
  stayButton: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  stayGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
  },
  stayText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  discardButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
  },
  discardText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
});
