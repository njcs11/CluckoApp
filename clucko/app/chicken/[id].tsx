import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { apiGetChicken, apiGetChickenHistory } from '../../lib/api';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ConfidenceBadge from '../../components/ui/ConfidenceBadge';
import { useDarkMode } from '../../context/DarkModeContext';

const { width, height } = Dimensions.get('window');

// Import images statically
const birdImages = {
  'CK-001': require('../../assets/images/CK-001.webp'),
  'CK-002': require('../../assets/images/CK-002.webp'),
  'CK-003': require('../../assets/images/CK-003.jpg'),
  'CK-004': require('../../assets/images/CK-004.png'),
  'CK-005': require('../../assets/images/CK-005.png'),
  'CK-006': require('../../assets/images/CK-006.webp'),
};

const getBirdImage = (chickenId: string) => {
  return birdImages[chickenId as keyof typeof birdImages] || require('../../assets/images/log.png');
};

// Sample scan history for each chicken - confidence represents AI accuracy
const scanHistoryMap: { [key: string]: any[] } = {
  '1': [
    { id: '1', date: new Date('2026-03-20'), disease: null, confidence: 98, status: 'healthy' as const },
    { id: '2', date: new Date('2026-03-19'), disease: 'Coryza', confidence: 87, status: 'warning' as const },
    { id: '3', date: new Date('2026-03-15'), disease: null, confidence: 95, status: 'healthy' as const },
  ],
  '2': [
    { id: '1', date: new Date('2026-03-19'), disease: null, confidence: 96, status: 'healthy' as const },
    { id: '2', date: new Date('2026-03-12'), disease: null, confidence: 94, status: 'healthy' as const },
  ],
  '3': [
    { id: '1', date: new Date('2026-03-18'), disease: 'Fowl Pox', confidence: 92, status: 'critical' as const },
    { id: '2', date: new Date('2026-03-10'), disease: null, confidence: 90, status: 'warning' as const },
  ],
  '4': [
    { id: '1', date: new Date('2026-03-20'), disease: null, confidence: 97, status: 'healthy' as const },
  ],
  '5': [
    { id: '1', date: new Date('2026-03-19'), disease: null, confidence: 95, status: 'healthy' as const },
  ],
  '6': [
    { id: '1', date: new Date('2026-03-18'), disease: 'Wing Droop', confidence: 79, status: 'warning' as const },
  ],
};

export default function ChickenDetailScreen() {
  const { id } = useLocalSearchParams();
  const { colors, isDarkMode } = useDarkMode();
  const [chicken, setChicken] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info');
  const [scanHistory, setScanHistory] = useState<any[]>([]);

  useEffect(() => {
    loadChickenDetails();
  }, [id]);

  const loadChickenDetails = async () => {
  try {
    const [chickenData, history] = await Promise.all([
      apiGetChicken(id as string),
      apiGetChickenHistory(id as string),
    ]);
    setChicken(chickenData);
    // Map history to scan format
    const scans = history.map((h: any) => ({
      id: h.id.toString(),
      date: new Date(h.recorded_at),
      disease: h.disease_name === 'Healthy' ? null : h.disease_name,
      confidence: h.confidence_score || 0,
      status: h.severity === 'critical' ? 'critical' : h.severity === 'none' ? 'healthy' : 'warning',
    }));
    setScanHistory(scans);
  } catch(e) {
    console.error('Chicken load error:', e);
    loadDefaultChicken(); // fallback
  } finally {
    setLoading(false);
  }
};

  const loadDefaultChicken = () => {
    const defaultChickens = [
      { id: '1', name: 'Rocky', chickenId: 'CK-001', status: 'WARNING', statusColor: '#FF9800', breed: 'Sweater', age: '8 months', weight: '2.3 kg', location: 'Pen A-1', lastScan: '2026-03-20', healthStatus: 'Warning', color: 'Red', dateAdded: '2026-01-15' },
      { id: '2', name: 'Thunder', chickenId: 'CK-002', status: 'HEALTHY', statusColor: '#4CAF50', breed: 'Hatch', age: '6 months', weight: '1.8 kg', location: 'Pen B-2', lastScan: '2026-03-19', healthStatus: 'Healthy', color: 'Black', dateAdded: '2026-02-01' },
      { id: '3', name: 'Lightning', chickenId: 'CK-003', status: 'CRITICAL', statusColor: '#f44336', breed: 'Kelso', age: '7 months', weight: '2.1 kg', location: 'Isolation Pen', lastScan: '2026-03-18', healthStatus: 'Critical', color: 'White', dateAdded: '2026-01-20' },
      { id: '4', name: 'Eagle', chickenId: 'CK-004', status: 'HEALTHY', statusColor: '#4CAF50', breed: 'Roundhead', age: '9 months', weight: '2.5 kg', location: 'Pen A-3', lastScan: '2026-03-20', healthStatus: 'Healthy', color: 'Brown', dateAdded: '2026-01-10' },
      { id: '5', name: 'Falcon', chickenId: 'CK-005', status: 'HEALTHY', statusColor: '#4CAF50', breed: 'Sweater', age: '5 months', weight: '1.9 kg', location: 'Pen C-1', lastScan: '2026-03-19', healthStatus: 'Healthy', color: 'Gray', dateAdded: '2026-02-15' },
      { id: '6', name: 'Hawk', chickenId: 'CK-006', status: 'WARNING', statusColor: '#FF9800', breed: 'Hatch', age: '7 months', weight: '2.0 kg', location: 'Pen B-1', lastScan: '2026-03-18', healthStatus: 'Warning', color: 'Red', dateAdded: '2026-01-25' },
    ];
    const found = defaultChickens.find((c: any) => c.id === id);
    setChicken(found);
  };

  const getScansForChicken = () => {
  if (scanHistory.length > 0) return scanHistory;
  const idStr = String(id);
  return scanHistoryMap[idStr] || [];
};

  if (loading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!chicken) {
    return (
      <SafeAreaView style={[styles.errorContainer, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
        <Text style={[styles.errorText, { color: colors.text }]}>Chicken not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.errorButton, { backgroundColor: colors.primary }]}>
          <Text style={styles.errorButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const chickenScans = getScansForChicken();
  const lastScan = chickenScans.length > 0 ? chickenScans[0] : null;
  const statusColor = chicken.statusColor || (chicken.status === 'HEALTHY' ? '#4CAF50' : chicken.status === 'WARNING' ? '#FF9800' : '#f44336');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      
      {/* Header - Compact */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
        <TouchableOpacity style={styles.menuButton} onPress={() => {
          Alert.alert('Options', 'Export or share profile', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Export', onPress: () => Alert.alert('Export', 'Export feature coming soon') },
          ]);
        }}>
          <Ionicons name="ellipsis-horizontal" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Compact Profile Card - Small image, horizontal layout */}
        <LinearGradient
          colors={[statusColor + '15', colors.card]}
          style={[styles.profileCard, { backgroundColor: colors.card }]}
        >
          <View style={styles.profileRow}>
            <View style={[styles.avatarContainer, { borderColor: statusColor }]}>
              <Image 
                source={chicken.photo ? { uri: chicken.photo } : getBirdImage(chicken.chickenId || `CK-00${chicken.id}`)} 
                style={styles.avatar}
              />
              <View style={[styles.statusIndicator, { backgroundColor: statusColor }]} />
            </View>
            <View style={styles.profileInfo}>
              <Text style={[styles.chickenName, { color: colors.text }]}>{chicken.name}</Text>
              <Text style={[styles.chickenBreed, { color: colors.textSecondary }]}>{chicken.breed}</Text>
              <View style={[styles.statusChip, { backgroundColor: statusColor + '20' }]}>
                <Text style={[styles.statusChipText, { color: statusColor }]}>{chicken.status || chicken.healthStatus?.toUpperCase() || 'HEALTHY'}</Text>
              </View>
            </View>
            <View style={styles.idBadge}>
              <Text style={styles.idBadgeText}>{chicken.chickenId || `CK-00${chicken.id}`}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Quick Stats Row - Compact */}
        <View style={styles.statsContainer}>
          <View style={[styles.statItem, { backgroundColor: colors.card }]}>
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.text }]}>{chicken.age?.split(' ')[0] || '?'}</Text>
            <Text style={[styles.statLabel, { color: colors.textLight }]}>months</Text>
          </View>
          <View style={[styles.statItem, { backgroundColor: colors.card }]}>
            <Ionicons name="fitness-outline" size={18} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.text }]}>{chicken.weight?.split(' ')[0] || '?'}</Text>
            <Text style={[styles.statLabel, { color: colors.textLight }]}>kg</Text>
          </View>
          <View style={[styles.statItem, { backgroundColor: colors.card }]}>
            <Ionicons name="location-outline" size={18} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.text, fontSize: 12 }]} numberOfLines={1}>{chicken.location?.split(' ')[0] || '?'}</Text>
            <Text style={[styles.statLabel, { color: colors.textLight }]}>pen</Text>
          </View>
          <View style={[styles.statItem, { backgroundColor: colors.card }]}>
            <Ionicons name="scan-outline" size={18} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.text }]}>{chickenScans.length}</Text>
            <Text style={[styles.statLabel, { color: colors.textLight }]}>scans</Text>
          </View>
        </View>

        {/* Tab Navigation - Compact */}
        <View style={styles.tabsContainer}>
          {['info', 'scans', 'health'].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.activeTab]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[
                styles.tabText, 
                activeTab === tab && { color: colors.primary, fontWeight: 'bold' }
              ]}>
                {tab === 'info' ? 'Information' : tab === 'scans' ? 'Scan History' : 'Health'}
              </Text>
              {activeTab === tab && <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* Info Tab Content - Compact Grid */}
        {activeTab === 'info' && (
          <View style={styles.infoGrid}>
            <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
              <View style={styles.infoCardIcon}>
                <Ionicons name="paw-outline" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.infoCardLabel, { color: colors.textLight }]}>Breed</Text>
              <Text style={[styles.infoCardValue, { color: colors.text }]}>{chicken.breed}</Text>
            </View>
            <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
              <View style={styles.infoCardIcon}>
                <Ionicons name="color-palette-outline" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.infoCardLabel, { color: colors.textLight }]}>Color</Text>
              <Text style={[styles.infoCardValue, { color: colors.text }]}>{chicken.color || 'N/A'}</Text>
            </View>
            <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
              <View style={styles.infoCardIcon}>
                <Ionicons name="location-outline" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.infoCardLabel, { color: colors.textLight }]}>Location</Text>
              <Text style={[styles.infoCardValue, { color: colors.text }]}>{chicken.location || 'N/A'}</Text>
            </View>
            <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
              <View style={styles.infoCardIcon}>
                <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.infoCardLabel, { color: colors.textLight }]}>Added</Text>
              <Text style={[styles.infoCardValue, { color: colors.text }]}>{chicken.dateAdded || chicken.lastScan || 'N/A'}</Text>
            </View>
            <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
              <View style={styles.infoCardIcon}>
                <Ionicons name="medkit-outline" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.infoCardLabel, { color: colors.textLight }]}>Last Check</Text>
              <Text style={[styles.infoCardValue, { color: colors.text }]}>{chicken.lastScan || 'Never'}</Text>
            </View>
            <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
              <View style={styles.infoCardIcon}>
                <Ionicons name="fitness-outline" size={20} color={colors.primary} />
              </View>
              <Text style={[styles.infoCardLabel, { color: colors.textLight }]}>Weight</Text>
              <Text style={[styles.infoCardValue, { color: colors.text }]}>{chicken.weight || 'N/A'}</Text>
            </View>
          </View>
        )}

        {/* Scans Tab Content - Shows AI Detection Confidence */}
        {activeTab === 'scans' && (
          <View style={styles.scansContainer}>
            {chickenScans.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
                <Ionicons name="scan-outline" size={48} color={colors.textLight} />
                <Text style={[styles.emptyText, { color: colors.text }]}>No scans yet</Text>
                <TouchableOpacity style={[styles.emptyButton, { backgroundColor: colors.primary }]} onPress={() => router.push('/(tabs)/capture')}>
                  <Text style={styles.emptyButtonText}>Start First Scan</Text>
                </TouchableOpacity>
              </View>
            ) : (
              chickenScans.map((scan, index) => (
                <View key={scan.id} style={[styles.scanItem, { backgroundColor: colors.card }]}>
                  <View style={styles.scanItemLeft}>
                    <View style={[styles.scanDot, { backgroundColor: scan.status === 'healthy' ? '#4CAF50' : scan.status === 'warning' ? '#FF9800' : '#f44336' }]} />
                    <View>
                      <Text style={[styles.scanDate, { color: colors.text }]}>
                        {scan.date.toLocaleDateString()}
                      </Text>
                      <Text style={[styles.scanCondition, { color: scan.status === 'healthy' ? '#4CAF50' : scan.status === 'warning' ? '#FF9800' : '#f44336' }]}>
                        {scan.disease || 'Normal'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.scanItemRight}>
                    <Text style={[styles.scanConfidenceLabel, { color: colors.textLight }]}>AI Accuracy</Text>
                    <Text style={[styles.scanConfidence, { color: colors.primary }]}>{scan.confidence}%</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Health Tab Content - Shows AI Detection Confidence, NOT health percentage */}
        {activeTab === 'health' && (
          <View style={styles.healthContainer}>
            {lastScan && (
              <View style={[styles.healthCard, { backgroundColor: colors.card }]}>
                <Text style={[styles.healthCardTitle, { color: colors.text }]}>Latest AI Detection</Text>
                <ConfidenceBadge score={lastScan.confidence} size="medium" showLabel={true} />
                <View style={styles.healthFooter}>
                  <Text style={[styles.healthDate, { color: colors.textLight }]}>{lastScan.date.toLocaleDateString()}</Text>
                  <Text style={[styles.healthStatus, { color: lastScan.status === 'healthy' ? '#4CAF50' : lastScan.status === 'warning' ? '#FF9800' : '#f44336' }]}>
                    {lastScan.status === 'healthy' ? '✓ Normal' : lastScan.status === 'warning' ? '⚠ Alert' : '🚨 Critical'}
                  </Text>
                </View>
                <Text style={[styles.aiNote, { color: colors.textLight }]}>
                  Confidence score indicates AI detection accuracy
                </Text>
              </View>
            )}

            <View style={[styles.healthCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.healthCardTitle, { color: colors.text }]}>Recommendations</Text>
              <View style={styles.recommendationItem}>
                <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                <Text style={[styles.recommendationText, { color: colors.textSecondary }]}>Weekly health checks</Text>
              </View>
              <View style={styles.recommendationItem}>
                <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                <Text style={[styles.recommendationText, { color: colors.textSecondary }]}>Keep vaccination records updated</Text>
              </View>
              <View style={styles.recommendationItem}>
                <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                <Text style={[styles.recommendationText, { color: colors.textSecondary }]}>Monitor behavior daily</Text>
              </View>
            </View>

            {chicken.status === 'WARNING' && (
              <View style={[styles.warningCard, { backgroundColor: '#FFF3E0' }]}>
                <Ionicons name="alert-circle" size={20} color="#FF9800" />
                <Text style={styles.warningText}>AI detected possible symptoms. Consult a veterinarian for confirmation.</Text>
              </View>
            )}

            {chicken.status === 'CRITICAL' && (
              <View style={[styles.criticalCard, { backgroundColor: '#FFEBEE' }]}>
                <Ionicons name="warning" size={20} color="#f44336" />
                <Text style={styles.criticalText}>AI indicates critical signs. Seek immediate veterinary attention!</Text>
              </View>
            )}
          </View>
        )}

        {/* Action Buttons - Compact */}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.primary }]} onPress={() => router.push('/(tabs)/capture')}>
            <Ionicons name="scan-outline" size={18} color="#fff" />
            <Text style={styles.actionButtonText}>New Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButtonOutline, { borderColor: colors.primary }]} onPress={() => {
            Alert.alert('Export', `Exporting records for ${chicken.name}`);
          }}>
            <Ionicons name="download-outline" size={18} color={colors.primary} />
            <Text style={[styles.actionButtonOutlineText, { color: colors.primary }]}>Export</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '500',
  },
  errorButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
  },
  errorButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 10 : 16,
    paddingBottom: 12,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  menuButton: {
    padding: 8,
  },
  profileCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 20,
    padding: 16,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    borderWidth: 2,
    borderRadius: 36,
    padding: 2,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#fff',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 14,
  },
  chickenName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  chickenBreed: {
    fontSize: 13,
    marginBottom: 6,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusChipText: {
    fontSize: 10,
    fontWeight: '600',
  },
  idBadge: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  idBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  statsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 20,
    gap: 10,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 16,
    gap: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 10,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    position: 'relative',
  },
  activeTab: {
    backgroundColor: 'transparent',
  },
  tabText: {
    fontSize: 13,
    color: '#999',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    width: 40,
    height: 2,
    borderRadius: 1,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 16,
    gap: 12,
  },
  infoCard: {
    width: (width - 44) / 2,
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
    gap: 6,
  },
  infoCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(46,125,50,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoCardLabel: {
    fontSize: 11,
  },
  infoCardValue: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  scansContainer: {
    marginHorizontal: 16,
    gap: 10,
  },
  scanItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
  },
  scanItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scanDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  scanDate: {
    fontSize: 13,
    fontWeight: '500',
  },
  scanCondition: {
    fontSize: 11,
    marginTop: 2,
  },
  scanItemRight: {
    alignItems: 'flex-end',
  },
  scanConfidenceLabel: {
    fontSize: 9,
    marginBottom: 2,
  },
  scanConfidence: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  healthContainer: {
    marginHorizontal: 16,
    gap: 12,
  },
  healthCard: {
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  healthCardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  healthFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  healthDate: {
    fontSize: 11,
  },
  healthStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  aiNote: {
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: 4,
    textAlign: 'center',
  },
  recommendationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  recommendationText: {
    fontSize: 12,
    flex: 1,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: '#FF9800',
  },
  criticalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
  },
  criticalText: {
    flex: 1,
    fontSize: 12,
    color: '#f44336',
    fontWeight: '600',
  },
  emptyCard: {
    alignItems: 'center',
    padding: 40,
    borderRadius: 20,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '500',
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 25,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 30,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 30,
    borderWidth: 1,
  },
  actionButtonOutlineText: {
    fontSize: 14,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 30,
  },
});