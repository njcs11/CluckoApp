import { Feather, Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  Dimensions, Modal, SafeAreaView, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { apiGetReports, apiGetStats } from '../../lib/api';
import { useDarkMode } from '../../context/DarkModeContext';

const { width: screenWidth } = Dimensions.get('window');

const CustomPieChart = ({ data, size = 180 }: any) => {
  const total = data.reduce((sum: number, item: any) => sum + item.value, 0);
  if (total === 0) return <View style={{ width: size, height: size }} />;
  const radius = size / 2;
  const slices: any[] = [];
  let currentAngle = 0;

  const createPath = (start: number, end: number) => {
    const s = (start * Math.PI) / 180;
    const e = (end   * Math.PI) / 180;
    const x1 = radius + radius * Math.cos(s);
    const y1 = radius + radius * Math.sin(s);
    const x2 = radius + radius * Math.cos(e);
    const y2 = radius + radius * Math.sin(e);
    const large = end - start <= 180 ? 0 : 1;
    return `M ${radius} ${radius} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`;
  };

  data.forEach((item: any) => {
    const angle = (item.value / total) * 360;
    slices.push({ path: createPath(currentAngle, currentAngle + angle), color: item.color, label: item.label, value: item.value });
    currentAngle += angle;
  });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {slices.map((s, i) => <G key={i}><Path d={s.path} fill={s.color} stroke="#fff" strokeWidth={2} /></G>)}
      </Svg>
    </View>
  );
};

export default function ReportsScreen() {
  const { colors, isDarkMode } = useDarkMode();

  // ─── All state inside component ──────────────────────────────────────────
  const [selectedPeriod, setSelectedPeriod]     = useState('weekly');
  const [weeklyModalVisible, setWeeklyModalVisible] = useState(false);
  const [periodModalVisible, setPeriodModalVisible] = useState(false);
  const [stats, setStats]       = useState({ total: 0, healthy: 0, warning: 0, critical: 0 });
  const [recentScans, setRecentScans]   = useState<any[]>([]);
  const [breakdown, setBreakdown]       = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      try {
        const [s, r] = await Promise.all([apiGetStats(), apiGetReports()]);
        setStats(s);
        setRecentScans(r.scans || []);
        setBreakdown(r.breakdown || []);
      } catch (e) {
        console.error('Reports load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const totalBirds   = stats.total;
  const healthyBirds = stats.healthy;
  const warningBirds = stats.warning;
  const criticalBirds = stats.critical;
  const detectionRate = totalBirds > 0 ? Math.round((healthyBirds / totalBirds) * 100) : 0;

  const pieData = [
    { value: healthyBirds  || 1, label: 'Healthy', color: '#4CAF50' },
    { value: warningBirds  || 0, label: 'Warning', color: '#FFB74D' },
    { value: criticalBirds || 0, label: 'Critical', color: '#FF6B6B' },
  ].filter(d => d.value > 0);

  const detectionData = breakdown.length > 0 ? breakdown.map((b: any) => ({
    name: b.predicted_condition || 'Unknown',
    value: b.count,
    percentage: totalBirds > 0 ? Math.round((b.count / totalBirds) * 100) : 0,
    color: b.predicted_condition === 'Healthy' ? '#4CAF50' : b.predicted_condition?.includes('Newcastle') ? '#f44336' : b.predicted_condition?.includes('Pox') ? '#FF5722' : '#FF9800',
  })) : [
    { name: 'No data yet', value: 1, percentage: 100, color: '#E0E0E0' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Reports & Analytics</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textLight }]}>Flock health insights</Text>
          </View>
          <TouchableOpacity style={[styles.periodButton, { backgroundColor: colors.card }]} onPress={() => setPeriodModalVisible(true)}>
            <Text style={[styles.periodButtonText, { color: colors.text }]}>{selectedPeriod === 'weekly' ? 'This Week' : 'This Month'}</Text>
            <Feather name="chevron-down" size={16} color={colors.textLight} />
          </TouchableOpacity>
        </View>

        {/* Health Overview */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Health Overview</Text>
          <View style={styles.healthMain}>
            <View style={styles.pieWrap}>
              <CustomPieChart data={pieData} size={160} />
              <View style={styles.pieCenter}>
                <Text style={[styles.pieCenterNum, { color: colors.text }]}>{totalBirds}</Text>
                <Text style={[styles.pieCenterLabel, { color: colors.textLight }]}>Total Birds</Text>
              </View>
            </View>
            <View style={styles.healthStats}>
              {[
                { label: 'Healthy',  value: healthyBirds,  color: '#4CAF50' },
                { label: 'Warning',  value: warningBirds,  color: '#FFB74D' },
                { label: 'Critical', value: criticalBirds, color: '#FF6B6B' },
              ].map((item, i) => (
                <View key={i} style={styles.healthStatItem}>
                  <View style={[styles.healthDot, { backgroundColor: item.color }]} />
                  <Text style={[styles.healthStatText, { color: colors.text }]}>
                    {item.label} ({item.value}) — {totalBirds > 0 ? Math.round((item.value / totalBirds) * 100) : 0}%
                  </Text>
                </View>
              ))}
              <View style={styles.detectionRateBox}>
                <Text style={[styles.detectionRateLabel, { color: colors.textLight }]}>Health Rate</Text>
                <Text style={[styles.detectionRateValue, { color: colors.primary }]}>{detectionRate}%</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Detection Breakdown */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Detection Breakdown</Text>
          {detectionData.map((item, i) => (
            <View key={i} style={styles.detectionItem}>
              <View style={styles.detectionHeader}>
                <Text style={[styles.detectionName, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.detectionValue, { color: item.color }]}>{item.value} ({item.percentage}%)</Text>
              </View>
              <View style={styles.detectionBarBg}>
                <View style={[styles.detectionBarFill, { width: `${Math.min(item.percentage, 100)}%` as any, backgroundColor: item.color }]} />
              </View>
            </View>
          ))}
        </View>

        {/* Recent Scans */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Scans</Text>
          {recentScans.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Ionicons name="scan-outline" size={36} color={colors.textLight} />
              <Text style={[{ color: colors.textSecondary, marginTop: 8, fontSize: 13 }]}>No scans yet. Start scanning chickens!</Text>
            </View>
          ) : (
            recentScans.slice(0, 5).map((scan: any, i: number) => (
              <View key={i} style={styles.activityItem}>
                <View style={[styles.activityIcon, {
                  backgroundColor: scan.severity_level === 'none' ? '#E8F5E9' : scan.severity_level === 'critical' ? '#FFEBEE' : '#FFF3E0'
                }]}>
                  <Ionicons
                    name={scan.severity_level === 'none' ? 'checkmark' : 'warning'}
                    size={16}
                    color={scan.severity_level === 'none' ? '#4CAF50' : scan.severity_level === 'critical' ? '#f44336' : '#FF9800'}
                  />
                </View>
                <View style={styles.activityContent}>
                  <Text style={[styles.activityAction, { color: colors.text }]}>
                    {scan.chicken_name} — {scan.predicted_condition || 'Healthy'}
                  </Text>
                  <Text style={[styles.activityTime, { color: colors.textLight }]}>
                    {scan.confidence_score ? `${Math.round(scan.confidence_score)}% confidence` : ''} • {new Date(scan.capture_datetime).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* Period Modal */}
      <Modal animationType="slide" transparent visible={periodModalVisible} onRequestClose={() => setPeriodModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBackground }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Period</Text>
              <TouchableOpacity onPress={() => setPeriodModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            {(['weekly', 'monthly'] as const).map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.periodOption, { backgroundColor: colors.background }]}
                onPress={() => { setSelectedPeriod(p); setPeriodModalVisible(false); }}
              >
                <Text style={[styles.periodOptionTitle, { color: colors.text }]}>
                  {p === 'weekly' ? 'This Week' : 'This Month'}
                </Text>
                {selectedPeriod === p && <Ionicons name="checkmark-circle" size={24} color={colors.primary} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.closeButton, { backgroundColor: colors.primary }]} onPress={() => setPeriodModalVisible(false)}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1 },
  header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  headerTitle:        { fontSize: 26, fontWeight: 'bold' },
  headerSubtitle:     { fontSize: 14, marginTop: 4 },
  periodButton:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, gap: 6 },
  periodButtonText:   { fontSize: 13, fontWeight: '500' },
  card:               { marginHorizontal: 20, borderRadius: 24, padding: 20, marginBottom: 16, elevation: 2 },
  sectionTitle:       { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  healthMain:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pieWrap:            { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  pieCenter:          { position: 'absolute', alignItems: 'center' },
  pieCenterNum:       { fontSize: 22, fontWeight: 'bold' },
  pieCenterLabel:     { fontSize: 10, marginTop: 2 },
  healthStats:        { flex: 1, marginLeft: 20 },
  healthStatItem:     { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  healthDot:          { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  healthStatText:     { fontSize: 12 },
  detectionRateBox:   { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E0E0E0', alignItems: 'center' },
  detectionRateLabel: { fontSize: 11 },
  detectionRateValue: { fontSize: 20, fontWeight: 'bold', marginTop: 4 },
  detectionItem:      { marginBottom: 14 },
  detectionHeader:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  detectionName:      { fontSize: 13, flex: 1 },
  detectionValue:     { fontSize: 13, fontWeight: '600' },
  detectionBarBg:     { height: 8, backgroundColor: '#E0E0E0', borderRadius: 4, overflow: 'hidden' },
  detectionBarFill:   { height: '100%', borderRadius: 4 },
  activityItem:       { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  activityIcon:       { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  activityContent:    { flex: 1 },
  activityAction:     { fontSize: 13, fontWeight: '500' },
  activityTime:       { fontSize: 11, marginTop: 2 },
  modalOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent:       { borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 24, maxHeight: '60%' },
  modalHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:         { fontSize: 22, fontWeight: 'bold' },
  periodOption:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 14, marginBottom: 10 },
  periodOptionTitle:  { fontSize: 16, fontWeight: '500' },
  closeButton:        { borderRadius: 30, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
});