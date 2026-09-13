import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import {
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

const { width } = Dimensions.get('window');

interface ImageQualityGuideProps {
  visible: boolean;
  onClose: () => void;
  onProceed?: () => void;
  scanType?: 'head' | 'wing' | 'full';
}

const GREEN = '#2E7D32';

export default function ImageQualityGuide({
  visible,
  onClose,
  onProceed,
  scanType = 'full',
}: ImageQualityGuideProps) {
  const generalTips = [
    { icon: 'sunny', iconSet: 'ionic', text: 'Bright, even lighting' },
    { icon: 'camera', iconSet: 'ionic', text: 'Hold steady, avoid blur' },
    { icon: 'water', iconSet: 'material', text: 'Feathers clean & dry' },
  ];

  const headTips = [
    { icon: 'eye', iconSet: 'ionic', text: 'Both eyes visible' },
    { icon: 'body', iconSet: 'ionic', text: 'Nostrils unobstructed' },
    { icon: 'scan', iconSet: 'material', text: 'Head fills 70% of frame' },
  ];

  const wingTips = [
    { icon: 'bird', iconSet: 'material', text: 'Full wing span visible' },
    { icon: 'git-compare', iconSet: 'ionic', text: 'Both wings in frame' },
    { icon: 'arrow-down', iconSet: 'ionic', text: 'Shoot top-down' },
  ];

  const getSpecificTips = () => {
    if (scanType === 'head') return { label: 'Head / Eyes Scan', tips: headTips };
    if (scanType === 'wing') return { label: 'Wing Scan', tips: wingTips };
    return {
      label: 'Full Body Scan',
      tips: [
        ...headTips.slice(0, 1),
        ...wingTips.slice(0, 1),
        { icon: 'body', iconSet: 'ionic', text: 'Whole bird in frame' },
      ],
    };
  };

  const specific = getSpecificTips();

  const renderIcon = (tip: any) => {
    if (tip.iconSet === 'ionic') {
      return <Ionicons name={tip.icon as any} size={17} color={GREEN} />;
    }
    return <MaterialCommunityIcons name={tip.icon as any} size={17} color={GREEN} />;
  };

  const renderTipGrid = (tips: any[]) => (
    <View style={styles.tipGrid}>
      {tips.map((tip, index) => (
        <View key={index} style={styles.tipChip}>
          <View style={styles.tipChipIcon}>{renderIcon(tip)}</View>
          <Text style={styles.tipChipText}>{tip.text}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalContainer}>
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <View style={styles.headerIconCircle}>
                    <Ionicons name="camera" size={20} color={GREEN} />
                  </View>
                  <Text style={styles.title}>Image Quality Guide</Text>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={18} color="#666" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
                {/* Compact good/bad row */}
                <View style={styles.exampleRow}>
                  <View style={[styles.examplePill, styles.goodPill]}>
                    <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                    <View style={styles.examplePillTexts}>
                      <Text style={styles.examplePillTitle}>Good</Text>
                      <Text style={styles.examplePillDesc}>Clear, well-lit</Text>
                    </View>
                  </View>
                  <View style={[styles.examplePill, styles.badPill]}>
                    <Ionicons name="close-circle" size={18} color="#F44336" />
                    <View style={styles.examplePillTexts}>
                      <Text style={[styles.examplePillTitle, { color: '#F44336' }]}>Bad</Text>
                      <Text style={styles.examplePillDesc}>Blurry, dark</Text>
                    </View>
                  </View>
                </View>

                {/* General tips */}
                <Text style={styles.sectionLabel}>GENERAL</Text>
                {renderTipGrid(generalTips)}

                {/* Scan-specific tips */}
                <Text style={styles.sectionLabel}>{specific.label.toUpperCase()}</Text>
                {renderTipGrid(specific.tips)}
              </ScrollView>

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.proceedButton}
                  onPress={onProceed ? onProceed : onClose}
                  activeOpacity={0.85}
                >
                  <Text style={styles.proceedButtonText}>
                    {onProceed ? 'Got it! Start Scan' : 'Got it!'}
                  </Text>
                  <Ionicons
                    name={onProceed ? 'arrow-forward' : 'checkmark-circle-outline'}
                    size={17}
                    color="#FFF"
                  />
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
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    width: '100%',
    maxWidth: 420,
    maxHeight: '82%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#1B5E20' },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollBody: {
    paddingBottom: 4,
  },

  exampleRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  examplePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  goodPill: { backgroundColor: '#E8F5E9', borderColor: '#4CAF50' },
  badPill: { backgroundColor: '#FFEBEE', borderColor: '#F44336' },
  examplePillTexts: { flex: 1 },
  examplePillTitle: { fontSize: 12, fontWeight: '700', color: '#4CAF50' },
  examplePillDesc: { fontSize: 10, color: '#666', marginTop: 1 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#888',
    marginBottom: 8,
    marginTop: 4,
  },
  tipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  tipChip: {
    width: (width - 40 - 8) / 2 - 20,
    minWidth: 130,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F7F9F7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8EFE8',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tipChipIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tipChipText: { fontSize: 11.5, color: '#333', flex: 1, fontWeight: '500' },

  buttonContainer: { marginTop: 12 },
  proceedButton: {
    backgroundColor: GREEN,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  proceedButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});