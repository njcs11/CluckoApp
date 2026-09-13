import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import {
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

const { width } = Dimensions.get('window');

interface DisclaimerModalProps {
  visible: boolean;
  onClose: () => void;
  onAccept?: () => void;
}

export default function DisclaimerModal({ visible, onClose, onAccept }: DisclaimerModalProps) {
  const handleDismiss = async () => {
    try {
      await AsyncStorage.setItem('disclaimer_accepted', 'true');
    } catch (e) {
      console.error('Error saving disclaimer acceptance:', e);
    }
    if (onAccept) onAccept();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <TouchableWithoutFeedback onPress={handleDismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalContainer}>
              <View style={styles.iconContainer}>
                <Ionicons name="alert-circle" size={44} color="#E65100" />
              </View>

              <Text style={styles.title}>Important Medical Disclaimer</Text>

              <View style={styles.contentContainer}>
                <Text style={styles.description}>
                  Clucko is an <Text style={styles.bold}>early detection tool</Text> only.
                </Text>

                <View style={styles.bulletPoints}>
                  <Text style={styles.bullet}>• Identifies possible visual symptoms</Text>
                  <Text style={styles.bullet}>• Does NOT provide medical diagnosis</Text>
                  <Text style={styles.bullet}>• Does NOT replace veterinary consultation</Text>
                </View>

                <View style={styles.noteBox}>
                  <Ionicons name="information-circle" size={18} color="#1565C0" />
                  <Text style={styles.noteText}>
                    For any health concerns, always consult a licensed veterinarian for proper diagnosis and treatment plans.
                  </Text>
                </View>
              </View>

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={handleDismiss}
                  activeOpacity={0.85}
                >
                  <Text style={styles.acceptButtonText}>I Understand</Text>
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
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  iconContainer: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 14,
  },
  contentContainer: {
    width: '100%',
    marginBottom: 20,
  },
  description: {
    fontSize: 15,
    color: '#555',
    textAlign: 'center',
    marginBottom: 14,
  },
  bold: {
    fontWeight: 'bold',
    color: '#E65100',
  },
  bulletPoints: {
    backgroundColor: '#F7F8F9',
    padding: 14,
    borderRadius: 12,
    marginBottom: 14,
  },
  bullet: {
    fontSize: 13,
    color: '#444',
    marginBottom: 6,
    lineHeight: 19,
  },
  noteBox: {
    backgroundColor: '#E8F4FD',
    padding: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  noteText: {
    fontSize: 12,
    color: '#1565C0',
    lineHeight: 17,
    flex: 1,
  },
  buttonContainer: {
    width: '100%',
  },
  acceptButton: {
    backgroundColor: '#2E7D32',
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
    width: '100%',
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});