import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState } from 'react';
import {
    Dimensions,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const { width } = Dimensions.get('window');

interface ImageQualityGuideProps {
  visible: boolean;
  onClose: () => void;
  onProceed: () => void;
  scanType?: 'head' | 'wing' | 'full';
}

export default function ImageQualityGuide({ 
  visible, 
  onClose, 
  onProceed,
  scanType = 'full' 
}: ImageQualityGuideProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleDontShowAgain = async () => {
    setDontShowAgain(!dontShowAgain);
    if (!dontShowAgain) {
      await AsyncStorage.setItem('hide_quality_guide', 'true');
    } else {
      await AsyncStorage.removeItem('hide_quality_guide');
    }
  };

  const getTips = () => {
    const commonTips = [
      { icon: 'sunny', iconSet: 'ionic', text: 'Ensure bright, even lighting' },
      { icon: 'camera', iconSet: 'ionic', text: 'Hold camera steady (avoid motion blur)' },
      { icon: 'water', iconSet: 'material', text: 'Make sure feathers are clean and dry' },
    ];

    const headTips = [
      { icon: 'eye', iconSet: 'ionic', text: 'Both eyes should be clearly visible' },
      { icon: 'body', iconSet: 'ionic', text: 'Nostril area should be unobstructed' },
      { icon: 'camera-outline', iconSet: 'ionic', text: 'Chicken head should fill 70% of frame' },
    ];

    const wingTips = [
      { icon: 'expand-outline', iconSet: 'ionic', text: 'Full wing span should be visible' },
      { icon: 'git-compare', iconSet: 'ionic', text: 'Both wings in frame for comparison' },
      { icon: 'arrow-down', iconSet: 'ionic', text: 'Capture from top-down angle' },
    ];

    if (scanType === 'head') return [...commonTips, ...headTips];
    if (scanType === 'wing') return [...commonTips, ...wingTips];
    return [...commonTips, ...headTips, ...wingTips];
  };

  const tips = getTips();

  const renderIcon = (tip: any) => (
  <Ionicons name={tip.icon as any} size={20} color="#4CAF50" />
);

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="camera" size={24} color="#4CAF50" />
              <Text style={styles.title}>Image Quality Guide</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.exampleContainer}>
              <View style={styles.exampleBox}>
                <View style={[styles.exampleImage, styles.goodExample]}>
                  <Ionicons name="checkmark-circle" size={32} color="#4CAF50" />
                  <Text style={styles.exampleLabel}>Good</Text>
                  <Text style={styles.exampleDesc}>Clear, well-lit, in focus</Text>
                </View>
              </View>
              <View style={styles.exampleBox}>
                <View style={[styles.exampleImage, styles.badExample]}>
                  <Ionicons name="close-circle" size={32} color="#F44336" />
                  <Text style={styles.exampleLabel}>Bad</Text>
                  <Text style={styles.exampleDesc}>Blurry, dark, obstructed</Text>
                </View>
              </View>
            </View>

            <View style={styles.tipsContainer}>
              <Text style={styles.tipsTitle}>For Best Results:</Text>
              {tips.map((tip, index) => (
                <View key={index} style={styles.tipRow}>
                  <View style={styles.tipIcon}>{renderIcon(tip)}</View>
                  <Text style={styles.tipText}>{tip.text}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity 
              style={styles.dontShowContainer}
              onPress={handleDontShowAgain}
            >
              <View style={[
                styles.checkbox, 
                dontShowAgain && styles.checkboxChecked
              ]}>
                {dontShowAgain && <Ionicons name="checkmark" size={12} color="#FFF" />}
              </View>
              <Text style={styles.dontShowText}>Don't show this again</Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.proceedButton} onPress={onProceed}>
              <Text style={styles.proceedButtonText}>Got it! Start Scan</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFF" />
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exampleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  exampleBox: {
    width: (width - 60) / 2,
  },
  exampleImage: {
    height: 120,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  goodExample: {
    backgroundColor: '#E8F5E9',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  badExample: {
    backgroundColor: '#FFEBEE',
    borderWidth: 2,
    borderColor: '#F44336',
  },
  exampleLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  exampleDesc: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
  },
  tipsContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  tipIcon: {
    width: 32,
    marginRight: 12,
  },
  tipText: {
    fontSize: 14,
    color: '#555',
    flex: 1,
  },
  dontShowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#4CAF50',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#4CAF50',
  },
  dontShowText: {
    fontSize: 14,
    color: '#666',
  },
  buttonContainer: {
    marginTop: 8,
  },
  proceedButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  proceedButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});