import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface SignupSuccessModalProps {
  visible: boolean;
  onProceed: () => void;
}

export default function SignupSuccessModal({ visible, onProceed }: SignupSuccessModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onProceed}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="checkmark-circle" size={48} color="#2e7d32" />
          </View>
          <Text style={styles.title}>Account Created!</Text>
          <Text style={styles.message}>
            Your account has been successfully created. Please proceed to login.
          </Text>
          <TouchableOpacity style={styles.button} onPress={onProceed} activeOpacity={0.8}>
            <Text style={styles.buttonText}>Proceed to Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  iconCircle: { marginBottom: 12 },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#2e7d32',
    borderRadius: 30,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});