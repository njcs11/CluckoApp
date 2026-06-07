import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { DETECTABLE_DISEASES, NON_DETECTABLE } from '../../constants/diseases';

interface DiseaseInfoCardProps {
  compact?: boolean;
}

export default function DiseaseInfoCard({ compact = false }: DiseaseInfoCardProps) {
  const [modalVisible, setModalVisible] = useState(false);

  const getIconName = (icon: string) => {
    switch (icon) {
      case 'alert-circle': return 'alert-circle';
      case 'alert-triangle': return 'alert-triangle';
      case 'warning': return 'warning';
      default: return 'medical';
    }
  };

  if (compact) {
    return (
      <>
        <TouchableOpacity 
          style={styles.compactCard}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="scan" size={24} color="#2196F3" />
          <View style={styles.compactTextContainer}>
            <Text style={styles.compactTitle}>What Clucko Detects</Text>
            <Text style={styles.compactSubtitle}>
              Coryza • Fowl Pox • Newcastle
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#999" />
        </TouchableOpacity>

        <Modal
          visible={modalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderLeft}>
                  <Ionicons name="medical" size={24} color="#4CAF50" />
                  <Text style={styles.modalTitle}>Disease Detection Guide</Text>
                </View>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#999" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                    <Text style={styles.sectionTitle}>Detects</Text>
                  </View>
                  {Object.values(DETECTABLE_DISEASES).map((disease, index) => (
                    <View key={index} style={styles.diseaseCard}>
                      <View style={[styles.diseaseIcon, { backgroundColor: disease.color + '20' }]}>
                        <Ionicons name={getIconName(disease.icon) as any} size={24} color={disease.color} />
                      </View>
                      <View style={styles.diseaseInfo}>
                        <Text style={styles.diseaseName}>{disease.name}</Text>
                        <Text style={styles.diseaseSymptoms}>
                          {disease.symptoms.join(' • ')}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="close-circle" size={20} color="#F44336" />
                    <Text style={[styles.sectionTitle, styles.warningTitle]}>
                      Does NOT Detect
                    </Text>
                  </View>
                  <View style={styles.nonDetectableContainer}>
                    {NON_DETECTABLE.map((item, index) => (
                      <View key={index} style={styles.nonDetectableBadge}>
                        <MaterialCommunityIcons name="close" size={12} color="#F44336" />
                        <Text style={styles.nonDetectableText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={styles.disclaimerBox}>
                  <Ionicons name="information-circle" size={16} color="#FF9800" />
                  <Text style={styles.disclaimerText}>
                    This is an early warning tool only. Always consult a veterinarian for diagnosis.
                  </Text>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </>
    );
  }

  return (
    <View style={styles.fullCard}>
      <View style={styles.fullHeader}>
        <Ionicons name="medical" size={24} color="#4CAF50" />
        <Text style={styles.fullTitle}>Disease Detection Capabilities</Text>
      </View>
      
      <Text style={styles.subtitle}>Detectable Conditions</Text>
      {Object.values(DETECTABLE_DISEASES).map((disease, index) => (
        <View key={index} style={styles.fullDiseaseRow}>
          <View style={[styles.fullDiseaseIcon, { backgroundColor: disease.color + '20' }]}>
            <Ionicons name={getIconName(disease.icon) as any} size={20} color={disease.color} />
          </View>
          <View style={styles.fullDiseaseInfo}>
            <Text style={styles.fullDiseaseName}>{disease.name}</Text>
            <Text style={styles.fullDiseaseSymptoms}>
              {disease.symptoms.join(', ')}
            </Text>
          </View>
        </View>
      ))}

      <Text style={[styles.subtitle, styles.warningSubtitle]}>
        Outside Detection Scope
      </Text>
      <View style={styles.fullNonDetectable}>
        {NON_DETECTABLE.map((item, index) => (
          <View key={index} style={styles.fullNonDetectableItem}>
            <MaterialCommunityIcons name="close" size={14} color="#F44336" />
            <Text style={styles.fullNonDetectableText}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F7FF',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#2196F3',
    gap: 12,
  },
  compactTextContainer: {
    flex: 1,
  },
  compactTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  compactSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  warningTitle: {
    color: '#F44336',
  },
  diseaseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  diseaseIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  diseaseInfo: {
    flex: 1,
  },
  diseaseName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  diseaseSymptoms: {
    fontSize: 12,
    color: '#666',
  },
  nonDetectableContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  nonDetectableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    margin: 4,
    gap: 4,
  },
  nonDetectableText: {
    fontSize: 12,
    color: '#F44336',
  },
  disclaimerBox: {
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#FF9800',
    flex: 1,
  },
  fullCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  fullHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  fullTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
    marginTop: 8,
    marginBottom: 12,
  },
  warningSubtitle: {
    color: '#F44336',
  },
  fullDiseaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    padding: 8,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    gap: 12,
  },
  fullDiseaseIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullDiseaseInfo: {
    flex: 1,
  },
  fullDiseaseName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  fullDiseaseSymptoms: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  fullNonDetectable: {
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    padding: 12,
  },
  fullNonDetectableItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  fullNonDetectableText: {
    fontSize: 12,
    color: '#F44336',
  },
});