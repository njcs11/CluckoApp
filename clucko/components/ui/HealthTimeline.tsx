import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

interface ScanRecord {
  id: string;
  date: Date;
  disease: string | null;
  confidence: number;
  status: 'healthy' | 'warning' | 'critical';
}

interface HealthTimelineProps {
  scans: ScanRecord[];
  chickenName: string;
}

export default function HealthTimeline({ scans, chickenName }: HealthTimelineProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return '#4CAF50';
      case 'warning': return '#FF9800';
      case 'critical': return '#F44336';
      default: return '#999';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return 'checkmark-circle';
      case 'warning': return 'alert-circle';
      case 'critical': return 'warning';
      default: return 'help-circle';
    }
  };

  // Calculate trend from last 3 scans
  const getTrend = () => {
    if (scans.length < 2) return null;
    const recent = scans.slice(0, 3);
    const healthScores = recent.map(s => s.confidence);
    const isImproving = healthScores[0] < healthScores[healthScores.length - 1];
    const isWorsening = healthScores[0] > healthScores[healthScores.length - 1];
    
    if (isImproving) {
      return { text: 'Improving', icon: 'trending-up', color: '#4CAF50' };
    }
    if (isWorsening) {
      return { text: 'Worsening', icon: 'trending-down', color: '#F44336' };
    }
    return { text: 'Stable', icon: 'remove', color: '#FF9800' };
  };

  const trend = getTrend();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Health Timeline - {chickenName}</Text>
        {trend && (
          <View style={[styles.trendBadge, { backgroundColor: trend.color + '20' }]}>
            <Ionicons name={trend.icon as any} size={14} color={trend.color} />
            <Text style={[styles.trendText, { color: trend.color }]}>{trend.text}</Text>
          </View>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timelineScroll}>
        <View style={styles.timelineContainer}>
          {scans.map((scan, index) => (
            <View key={scan.id} style={styles.timelineItem}>
              <View style={[styles.timelineDot, { backgroundColor: getStatusColor(scan.status) }]} />
              {index < scans.length - 1 && <View style={styles.timelineLine} />}
              <View style={styles.timelineContent}>
                <Text style={styles.timelineDate}>
                  {new Date(scan.date).toLocaleDateString()}
                </Text>
                <View style={[styles.timelineStatus, { backgroundColor: getStatusColor(scan.status) + '20' }]}>
                  <Ionicons name={getStatusIcon(scan.status) as any} size={12} color={getStatusColor(scan.status)} />
                  <Text style={[styles.timelineStatusText, { color: getStatusColor(scan.status) }]}>
                    {scan.status.toUpperCase()}
                  </Text>
                </View>
                {scan.disease && (
                  <Text style={styles.timelineDisease}>{scan.disease}</Text>
                )}
                <Text style={styles.timelineConfidence}>{scan.confidence}% confidence</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  trendText: {
    fontSize: 12,
    fontWeight: '600',
  },
  timelineScroll: {
    flexGrow: 0,
  },
  timelineContainer: {
    flexDirection: 'row',
    paddingVertical: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 120,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
    marginRight: 8,
  },
  timelineLine: {
    position: 'absolute',
    left: 5,
    top: 16,
    width: 2,
    height: 80,
    backgroundColor: '#E0E0E0',
  },
  timelineContent: {
    flex: 1,
    gap: 4,
  },
  timelineDate: {
    fontSize: 11,
    color: '#999',
  },
  timelineStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 4,
  },
  timelineStatusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  timelineDisease: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333',
  },
  timelineConfidence: {
    fontSize: 10,
    color: '#666',
  },
});