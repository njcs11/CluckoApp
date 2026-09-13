import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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
import ChickenIcon from './ChickenIcon';

const { height } = Dimensions.get('window');

interface AboutUsModalProps {
  visible: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
}

export default function AboutUsModal({ visible, onClose, isDarkMode = false }: AboutUsModalProps) {
  const bgCard = isDarkMode ? '#1E1E1E' : '#FFFFFF';
  const textPrimary = isDarkMode ? '#FFFFFF' : '#1A1A1A';
  const textSecondary = isDarkMode ? '#CCCCCC' : '#555555';
  const textMuted = isDarkMode ? '#888888' : '#777777';
  const cardSectionBg = isDarkMode ? '#282828' : '#F7F9F7';
  const borderCol = isDarkMode ? '#383838' : '#E8ECE8';

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={[styles.modalCard, { backgroundColor: bgCard }]}>
              {/* Header */}
              <View style={[styles.headerRow, { borderBottomColor: borderCol }]}>
                <View style={styles.headerLeft}>
                  <View style={styles.appBadge}>
                    <ChickenIcon size={24} color="#2E7D32" />
                  </View>
                  <View>
                    <Text style={[styles.appTitle, { color: textPrimary }]}>About Clucko</Text>
                    <Text style={[styles.appVersion, { color: textMuted }]}>Version 1.0.0 · Gamefowl Health</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={[styles.closeCircle, { backgroundColor: isDarkMode ? '#333' : '#F0F0F0' }]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={20} color={textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.scrollBody}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 20 }}
              >
                {/* Mission & Overview */}
                <View style={[styles.sectionBox, { backgroundColor: cardSectionBg, borderColor: borderCol }]}>
                  <Text style={[styles.sectionTitle, { color: '#2E7D32' }]}>
                    <Ionicons name="sparkles-outline" size={16} color="#2E7D32" /> App Mission & Overview
                  </Text>
                  <Text style={[styles.bodyText, { color: textSecondary }]}>
                    Clucko is an intelligent mobile platform engineered specifically for poultry farmers, gamefowl breeders, and caretakers.
                    By uniting computer-vision AI, digital bird records, and multi-farm coordination, Clucko empowers you to detect early symptoms of distress and keep your flock in championship condition.
                  </Text>
                </View>

                {/* Core Features */}
                <View style={[styles.sectionBox, { backgroundColor: cardSectionBg, borderColor: borderCol }]}>
                  <Text style={[styles.sectionTitle, { color: textPrimary }]}>
                    <Ionicons name="grid-outline" size={16} color="#2E7D32" /> Key Capabilities
                  </Text>

                  <View style={styles.featureItem}>
                    <View style={styles.featureIconWrap}>
                      <Ionicons name="camera-outline" size={16} color="#2E7D32" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.featureHeading, { color: textPrimary }]}>AI Symptom Scanner</Text>
                      <Text style={[styles.featureDesc, { color: textMuted }]}>
                        Targeted scans for Head/Eyes, Wings, and Full Body to detect early visual abnormalities.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.featureItem}>
                    <View style={styles.featureIconWrap}>
                      <ChickenIcon size={16} color="#2E7D32" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.featureHeading, { color: textPrimary }]}>Flock Management</Text>
                      <Text style={[styles.featureDesc, { color: textMuted }]}>
                        Digital tagging, vaccination logs, weight records, and permanent photo profiles.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.featureItem}>
                    <View style={styles.featureIconWrap}>
                      <Ionicons name="home-outline" size={16} color="#2E7D32" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.featureHeading, { color: textPrimary }]}>Multi-Farm & Caretakers</Text>
                      <Text style={[styles.featureDesc, { color: textMuted }]}>
                        Assign specific farms and chickens to caretakers with role-based access.
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.featureItem, { marginBottom: 0 }]}>
                    <View style={styles.featureIconWrap}>
                      <Ionicons name="stats-chart-outline" size={16} color="#2E7D32" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.featureHeading, { color: textPrimary }]}>Health Analytics & Reports</Text>
                      <Text style={[styles.featureDesc, { color: textMuted }]}>
                        Period trend charts, disease distribution, and exportable flock health reports.
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Important Medical Disclaimer */}
                <View style={[styles.disclaimerBox, { borderColor: '#FFA726' }]}>
                  <View style={styles.disclaimerTitleRow}>
                    <Ionicons name="alert-circle" size={22} color="#E65100" />
                    <Text style={styles.disclaimerHeading}>Important Medical Disclaimer</Text>
                  </View>
                  <Text style={[styles.disclaimerIntro, { color: textSecondary }]}>
                    Clucko is designed strictly as an <Text style={{ fontWeight: 'bold', color: '#E65100' }}>early visual screening tool</Text>:
                  </Text>
                  <View style={styles.bulletList}>
                    <Text style={[styles.bulletItem, { color: textSecondary }]}>
                      • It identifies visible abnormalities and symptoms from photos.
                    </Text>
                    <Text style={[styles.bulletItem, { color: textSecondary }]}>
                      • It does <Text style={{ fontWeight: 'bold' }}>NOT</Text> provide veterinary clinical diagnosis.
                    </Text>
                    <Text style={[styles.bulletItem, { color: textSecondary }]}>
                      • It does <Text style={{ fontWeight: 'bold' }}>NOT</Text> replace professional veterinary consultation or laboratory testing.
                    </Text>
                  </View>
                  <View style={styles.vetAdviceBox}>
                    <Ionicons name="medical" size={16} color="#1565C0" />
                    <Text style={styles.vetAdviceText}>
                      For any unwell, lethargic, or critical birds, isolate them immediately in a biosecure coop and consult a licensed avian veterinarian.
                    </Text>
                  </View>
                </View>

                {/* Biosecurity Tips */}
                <View style={[styles.sectionBox, { backgroundColor: cardSectionBg, borderColor: borderCol }]}>
                  <Text style={[styles.sectionTitle, { color: textPrimary }]}>
                    <Ionicons name="shield-checkmark-outline" size={16} color="#2E7D32" /> Farm Biosecurity Best Practices
                  </Text>
                  <Text style={[styles.bulletItem, { color: textSecondary }]}>
                    ✓ Always quarantine newly acquired or arriving birds for 14–21 days.
                  </Text>
                  <Text style={[styles.bulletItem, { color: textSecondary }]}>
                    ✓ Disinfect footwear, feeders, and coops on a consistent weekly schedule.
                  </Text>
                  <Text style={[styles.bulletItem, { color: textSecondary }]}>
                    ✓ Provide clean, cool drinking water enriched with electrolytes during stress periods.
                  </Text>
                </View>

                {/* Footer Copyright */}
                <View style={styles.footerWrap}>
                  <Text style={[styles.copyrightText, { color: textMuted }]}>
                    Clucko · AI Gamefowl Health System © 2026
                  </Text>
                </View>
              </ScrollView>

              {/* Bottom Done Button */}
              <View style={[styles.bottomBar, { borderTopColor: borderCol }]}>
                <TouchableOpacity
                  style={styles.doneBtn}
                  onPress={onClose}
                  activeOpacity={0.85}
                >
                  <Text style={styles.doneBtnText}>Close</Text>
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
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: height * 0.85,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
    display: 'flex',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  appBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  appTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  appVersion: {
    fontSize: 12,
    marginTop: 2,
  },
  closeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sectionBox: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 19,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  featureIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  featureHeading: {
    fontSize: 13,
    fontWeight: '600',
  },
  featureDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  disclaimerBox: {
    backgroundColor: '#FFF9E6',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1.5,
  },
  disclaimerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  disclaimerHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: '#D84315',
  },
  disclaimerIntro: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  bulletList: {
    gap: 4,
    marginBottom: 10,
  },
  bulletItem: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  vetAdviceBox: {
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  vetAdviceText: {
    fontSize: 12,
    color: '#1565C0',
    lineHeight: 16,
    flex: 1,
  },
  footerWrap: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  copyrightText: {
    fontSize: 11,
    textAlign: 'center',
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  doneBtn: {
    backgroundColor: '#2E7D32',
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
