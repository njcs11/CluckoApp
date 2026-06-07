import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import {
    Dimensions,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const { width, height } = Dimensions.get('window');

interface DisclaimerModalProps {
  visible: boolean;
  onClose: () => void;
  onAccept: () => void;
}

export default function DisclaimerModal({ visible, onClose, onAccept }: DisclaimerModalProps) {
  const [hasAccepted, setHasAccepted] = useState(false);

  useEffect(() => {
    checkIfAccepted();
  }, []);

  const checkIfAccepted = async () => {
    const accepted = await AsyncStorage.getItem('disclaimer_accepted');
    if (accepted === 'true') {
      setHasAccepted(true);
      onAccept();
    }
  };

  const handleAccept = async () => {
    await AsyncStorage.setItem('disclaimer_accepted', 'true');
    setHasAccepted(true);
    onAccept();
  };

  if (hasAccepted) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.iconContainer}>
            <Ionicons name="warning" size={40} color="#FF9800" />
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
              <Ionicons name="information-circle" size={16} color="#1565C0" />
              <Text style={styles.noteText}>
                For any health concerns, always consult a licensed veterinarian for proper diagnosis and treatment plans.
              </Text>
            </View>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.acceptButton} onPress={handleAccept}>
              <Text style={styles.acceptButtonText}>I Understand</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: width * 0.85,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 16,
  },
  contentContainer: {
    width: '100%',
    marginBottom: 24,
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  bold: {
    fontWeight: 'bold',
    color: '#FF6B35',
  },
  bulletPoints: {
    backgroundColor: '#F5F5F5',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  bullet: {
    fontSize: 14,
    color: '#555',
    marginBottom: 8,
    lineHeight: 20,
  },
  noteBox: {
    backgroundColor: '#E8F4FD',
    padding: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noteText: {
    fontSize: 13,
    color: '#1565C0',
    lineHeight: 18,
    flex: 1,
  },
  buttonContainer: {
    width: '100%',
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});