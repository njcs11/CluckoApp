import { useDarkMode } from '@/context/DarkModeContext';
import { getHealthStatus } from '@/utils/birdStatus';
import { loadChickensForCurrentUser } from '@/utils/chickenStorage';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { apiGetReports, apiGetActivities } from '../../lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from "expo-router/react-navigation";
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, G, Path, Rect, Stop, LinearGradient as SvgLinearGradient, Text as SvgText } from 'react-native-svg';
import ChickenIcon from '../../components/ui/ChickenIcon';
import { useRole } from '../../hooks/useRole';  // ← ADDED

const DefsAny = Defs as any;

const Donut = ({ data, size = 150, strokeWidth = 20 }: any) => {
  const total = data.reduce((sum: number, item: any) => sum + item.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offsetSoFar = 0;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <G rotation={-90} originX={size / 2} originY={size / 2}>
        {data.map((slice: any, index: number) => {
          const fraction = total > 0 ? slice.value / total : 0;
          const dash = fraction * circumference;
          const circle = (
            <Circle
              key={index}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={slice.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offsetSoFar}
              strokeLinecap="butt"
              fill="none"
            />
          );
          offsetSoFar += dash;
          return circle;
        })}
      </G>
    </Svg>
  );
};

const CHART_WIDTH = 300;
const CHART_HEIGHT = 90;
const CHART_TOP_PADDING = 34;

const buildSmoothPath = (points: { x: number; y: number }[]) => {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
};

const LineChart = ({ labels = [], values = [], maxValue = 1, color }: any) => {
  const n = values ? values.length : 0;
  const usableHeight = CHART_HEIGHT - 6;

  if (n === 0) {
    return (
      <View style={{ height: CHART_TOP_PADDING + CHART_HEIGHT - 6, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#999', fontSize: 13 }}>No activity data yet</Text>
      </View>
    );
  }

  const effectiveMax = maxValue > 0 ? maxValue : 1;
  const points = values.map((v: number, i: number) => ({
    x: n > 1 ? (i / (n - 1)) * CHART_WIDTH : CHART_WIDTH / 2,
    y: CHART_TOP_PADDING + usableHeight - (effectiveMax > 0 ? (v / effectiveMax) * usableHeight : 0),
  }));

  const linePath = buildSmoothPath(points);
  const areaPath = points.length > 0
    ? `${linePath} L ${points[n - 1].x} ${CHART_TOP_PADDING + usableHeight} L ${points[0].x} ${CHART_TOP_PADDING + usableHeight} Z`
    : '';

  const actualMax = Math.max(...values, 0);
  const peakIndex = values.indexOf(actualMax) >= 0 ? values.indexOf(actualMax) : 0;
  const peak = points[peakIndex] || { x: CHART_WIDTH / 2, y: CHART_TOP_PADDING + usableHeight };
  const bubbleWidth = 26;

  return (
    <View>
      <Svg width="100%" height={CHART_TOP_PADDING + CHART_HEIGHT - 6} viewBox={`0 0 ${CHART_WIDTH} ${CHART_TOP_PADDING + CHART_HEIGHT - 6}`}>
        <DefsAny>
          <SvgLinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.25} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </SvgLinearGradient>
        </DefsAny>
        {areaPath ? <Path d={areaPath} fill="url(#areaFill)" /> : null}
        {linePath ? <Path d={linePath} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {points.map((p: any, i: number) => (
          <Circle key={i} cx={p.x} cy={p.y} r={i === peakIndex && actualMax > 0 ? 4 : 3} fill={i === peakIndex && actualMax > 0 ? color : '#fff'} stroke={color} strokeWidth={1.5} />
        ))}
        {actualMax > 0 && peak ? (
          <>
            <Rect
              x={Math.min(Math.max(peak.x - bubbleWidth / 2, 0), CHART_WIDTH - bubbleWidth)}
              y={peak.y - 28}
              width={bubbleWidth}
              height={20}
              rx={10}
              fill={color}
            />
            <SvgText
              x={Math.min(Math.max(peak.x, bubbleWidth / 2), CHART_WIDTH - bubbleWidth / 2)}
              y={peak.y - 14}
              fontSize={11}
              fontWeight="700"
              fill="#fff"
              textAnchor="middle"
            >
              {actualMax}
            </SvgText>
          </>
        ) : null}
      </Svg>
      <View style={styles.xAxisRow}>
        {labels.map((label: string) => (
          <Text key={label} style={styles.xAxisLabel}>{label}</Text>
        ))}
      </View>
    </View>
  );
};

const buildRecentActivity = (chickens: any[]) => {
  if (!chickens || chickens.length === 0) return [];
  const priority = (c: any) => {
    const normalized = getHealthStatus(c);
    return normalized === 'Critical' ? 0 : normalized === 'Warning' ? 1 : 2;
  };
  const sorted = [...chickens].sort((a, b) => priority(a) - priority(b));
  return sorted.slice(0, 3).map((bird) => {
    const normalized = getHealthStatus(bird);
    const isCritical = normalized === 'Critical';
    const isWarning = normalized === 'Warning';
    return {
      id: bird.id,
      title: isCritical || isWarning
        ? `${bird.status || normalized} — ${bird.name}`
        : `${bird.name} checked — Healthy`,
      subtitle: `${bird.idNumber || ''}${bird.idNumber ? ' · ' : ''}${normalized}`,
      time: bird.timeAgo || 'Recently',
      icon: isCritical ? 'warning' : isWarning ? 'alert-circle' : 'checkmark-done',
      tint: isCritical ? '#f44336' : isWarning ? '#FF9800' : '#4CAF50',
    };
  });
};

export default function ReportsScreen() {
  const { colors, isDarkMode } = useDarkMode();
  const { isCaretaker } = useRole();  // ← ADDED

  const [isGuestMode, setIsGuestMode] = useState(false);
  const [checkingGuest, setCheckingGuest] = useState(true);
  const [allChickens, setAllChickens] = useState<any[]>([]);

  useFocusEffect(
  useCallback(() => {
    const loadData = async () => {
      try {
        const guestFlag = await AsyncStorage.getItem('isGuestMode');
        setIsGuestMode(guestFlag === 'true');
        const savedChickens = await loadChickensForCurrentUser();
        setAllChickens(savedChickens || []);
        await loadScanActivity();
      } catch (error) {
        console.error('Error loading reports data:', error);
      } finally {
        setCheckingGuest(false);
      }
    };
    loadData();
  }, [])
);

  const [scansRaw, setScansRaw] = useState<any[]>([]);
  const [activitiesList, setActivitiesList] = useState<any[]>([]);

  const loadScanActivity = async () => {
    try {
      const [data, acts] = await Promise.all([
        apiGetReports().catch(() => ({ scans: [] })),
        apiGetActivities().catch(() => []),
      ]);
      setScansRaw(data.scans || []);
      setActivitiesList(acts || []);
    } catch (error) {
      console.error('Error loading scan activity:', error);
    }
  };

  const [selectedPeriod, setSelectedPeriod] = useState<'weekly' | 'monthly'>('weekly');

  const totalBirds = allChickens.length;
  const healthyBirds = allChickens.filter((c) => getHealthStatus(c) === 'Healthy').length;
  const warningBirds = allChickens.filter((c) => getHealthStatus(c) === 'Warning').length;
  const criticalBirds = allChickens.filter((c) => getHealthStatus(c) === 'Critical').length;

  const donutData = [
    { value: healthyBirds, label: 'Healthy', color: '#4CAF50' },
    { value: warningBirds, label: 'Warning', color: '#FFB74D' },
    { value: criticalBirds, label: 'Critical', color: '#FF6B6B' },
  ];

  const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Last 7 days, oldest -> newest, Mon-first ordering to match the old
// static labels' feel while staying anchored to today's real date.
const buildWeeklyActivity = (scans: any[]) => {
  const today = new Date();
  const days: { label: string; date: Date }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push({ label: WEEKDAY_LABELS[d.getDay()], date: d });
  }
  const counts = days.map(({ date }) => {
    return scans.filter((s) => {
      if (!s.capture_datetime) return false;
      const sd = new Date(s.capture_datetime);
      return (
        sd.getFullYear() === date.getFullYear() &&
        sd.getMonth() === date.getMonth() &&
        sd.getDate() === date.getDate()
      );
    }).length;
  });
  return { labels: days.map((d) => d.label), values: counts };
};

// Last 6 months, oldest -> newest.
  const buildMonthlyActivity = (scans: any[]) => {
    const today = new Date();
    const months: { label: string; year: number; month: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push({ label: MONTH_LABELS[d.getMonth()], year: d.getFullYear(), month: d.getMonth() });
    }
    const counts = months.map(({ year, month }) => {
      return scans.filter((s) => {
        if (!s.capture_datetime) return false;
        const sd = new Date(s.capture_datetime);
        return sd.getFullYear() === year && sd.getMonth() === month;
      }).length;
    });
    return { labels: months.map((m) => m.label), values: counts };
  };

  const weekly = buildWeeklyActivity(scansRaw);
  const monthly = buildMonthlyActivity(scansRaw);

  const activeLabels = selectedPeriod === 'weekly' ? weekly.labels : monthly.labels;
  const activeValues = selectedPeriod === 'weekly' ? weekly.values : monthly.values;
  const safeMaxValue = Math.max(...activeValues, 1); // avoid maxValue=0 division issues
  const totalScansThisPeriod = activeValues.reduce((a, b) => a + b, 0);

  const recentActivity = buildRecentActivity(allChickens);

  const statCards = [
    {
      label: 'Total Birds',
      value: totalBirds,
      icon: <ChickenIcon size={18} color={colors.primary} />,
      tint: colors.primary,
      trend: totalBirds > 0 ? `${warningBirds + criticalBirds} need attention` : 'No birds added yet',
    },
    {
      label: 'Healthy',
      value: healthyBirds,
      icon: <Ionicons name="heart-outline" size={18} color="#4CAF50" />,
      tint: '#4CAF50',
      trend: `${totalBirds > 0 ? Math.round((healthyBirds / totalBirds) * 100) : 0}% of flock`,
    },
    {
      label: 'Warning',
      value: warningBirds,
      icon: <Ionicons name="alert-circle-outline" size={18} color="#FF9800" />,
      tint: '#FF9800',
      trend: `${totalBirds > 0 ? Math.round((warningBirds / totalBirds) * 100) : 0}% of flock`,
    },
    {
      label: 'Critical',
      value: criticalBirds,
      icon: <Ionicons name="warning-outline" size={18} color="#f44336" />,
      tint: '#f44336',
      trend: `${totalBirds > 0 ? Math.round((criticalBirds / totalBirds) * 100) : 0}% of flock`,
    },
  ];

  if (checkingGuest) {
    return <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} />;
  }

  // ← ADDED — caretaker block
  if (isCaretaker) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />
        <View style={styles.guestBlockContainer}>
          <View style={[styles.guestBlockIconCircle, { backgroundColor: colors.primary + '18' }]}>
            <Ionicons name="lock-closed-outline" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.guestBlockTitle, { color: colors.text }]}>
            Access Restricted
          </Text>
          <Text style={[styles.guestBlockText, { color: colors.textSecondary }]}>
            Reports & Analytics are only available to farm owners.
          </Text>
          <TouchableOpacity
            style={styles.guestBlockBackButton}
            onPress={() => router.replace('/(tabs)/home')}
          >
            <Ionicons name="arrow-back-outline" size={14} color={colors.textLight} />
            <Text style={[styles.guestBlockBackText, { color: colors.textLight }]}>
              Back to Home
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isGuestMode) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />
        <View style={styles.guestBlockContainer}>
          <View style={[styles.guestBlockIconCircle, { backgroundColor: colors.primary + '18' }]}>
            <Ionicons name="lock-closed-outline" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.guestBlockTitle, { color: colors.text }]}>Sign Up Required</Text>
          <Text style={[styles.guestBlockText, { color: colors.textSecondary }]}>
            Please sign up or login first to view Reports & Analytics.
          </Text>
          <TouchableOpacity style={styles.guestBlockButton} onPress={() => router.push('/signup')}>
            <LinearGradient colors={['#2E7D32', '#1B5E20']} style={styles.guestBlockButtonGradient}>
              <Text style={styles.guestBlockButtonText}>Sign Up</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.guestBlockSecondaryButton, { borderColor: colors.primary }]} onPress={() => router.push('/login')}>
            <Text style={[styles.guestBlockSecondaryText, { color: colors.primary }]}>Login</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.guestBlockBackButton} onPress={() => router.replace('/(tabs)/home')}>
            <Ionicons name="arrow-back-outline" size={14} color={colors.textLight} />
            <Text style={[styles.guestBlockBackText, { color: colors.textLight }]}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Reports & Analytics</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textLight }]}>Your flock at a glance</Text>
        </View>

        {/* Stat cards */}
        <View style={styles.statsGrid}>
          {statCards.map((stat) => (
            <View key={stat.label} style={[styles.statCard, { backgroundColor: colors.card }]}>
              <View style={styles.statCardTopRow}>
                <View style={[styles.statIconBadge, { backgroundColor: stat.tint + '18' }]}>{stat.icon}</View>
              </View>
              <Text style={[styles.statValue, { color: colors.text }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: colors.textLight }]}>{stat.label}</Text>
              <Text style={[styles.statTrend, { color: stat.tint }]}>{stat.trend}</Text>
            </View>
          ))}
        </View>

        {/* Scan activity chart */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Scan Activity</Text>
            <View style={[styles.pillToggle, { backgroundColor: colors.background }]}>
              <TouchableOpacity
                style={[styles.pillOption, selectedPeriod === 'weekly' && { backgroundColor: colors.primary }]}
                onPress={() => setSelectedPeriod('weekly')}
                activeOpacity={0.8}
              >
                <Text style={[styles.pillOptionText, { color: selectedPeriod === 'weekly' ? '#fff' : colors.textSecondary }]}>Week</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pillOption, selectedPeriod === 'monthly' && { backgroundColor: colors.primary }]}
                onPress={() => setSelectedPeriod('monthly')}
                activeOpacity={0.8}
              >
                <Text style={[styles.pillOptionText, { color: selectedPeriod === 'monthly' ? '#fff' : colors.textSecondary }]}>Month</Text>
              </TouchableOpacity>
            </View>
          </View>
          <LineChart labels={activeLabels} values={activeValues} maxValue={safeMaxValue} color={colors.primary} />
          <View style={[styles.chartFooter, { borderTopColor: colors.divider }]}>
            <Text style={[styles.chartFooterLabel, { color: colors.textLight }]}>
              Total scans this {selectedPeriod === 'weekly' ? 'week' : '6 months'}
            </Text>
            <Text style={[styles.chartFooterValue, { color: colors.primary }]}>{totalScansThisPeriod}</Text>
          </View>
        </View>

        {/* Health distribution donut */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Health Distribution</Text>
          <View style={styles.donutRow}>
            <View style={styles.donutWrap}>
              <Donut data={donutData} size={140} strokeWidth={18} />
              <View style={styles.donutCenter}>
                <Text style={[styles.donutCenterValue, { color: colors.text }]}>{totalBirds}</Text>
                <Text style={[styles.donutCenterLabel, { color: colors.textLight }]}>Total</Text>
              </View>
            </View>
            <View style={styles.donutLegend}>
              {donutData.map((item) => (
                <View key={item.label} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.legendLabel, { color: colors.text }]}>{item.label}</Text>
                    <Text style={[styles.legendMeta, { color: colors.textLight }]}>
                      {item.value} birds · {totalBirds > 0 ? Math.round((item.value / totalBirds) * 100) : 0}%
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Recent activity */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Recent Activity</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/chickens')}>
              <Text style={[styles.viewAllText, { color: colors.primary }]}>View All</Text>
            </TouchableOpacity>
          </View>
          {activitiesList.length > 0 ? (
            activitiesList.slice(0, 10).map((activity, index) => {
              const isCrit = activity.status === 'Critical';
              const isWarn = activity.status === 'Warning';
              const tint = isCrit ? '#f44336' : isWarn ? '#FF9800' : '#4CAF50';
              const iconName = isCrit ? 'warning' : isWarn ? 'alert-circle' : 'checkmark-circle';

              // Relative time
              const d = new Date(activity.timestamp);
              const diffMs = Date.now() - d.getTime();
              const diffMin = Math.floor(diffMs / 60000);
              const timeLabel = diffMin < 1 ? 'Just now' : diffMin < 60 ? `${diffMin}m ago` : diffMin < 1440 ? `${Math.floor(diffMin / 60)}h ago` : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

              return (
                <TouchableOpacity
                  key={activity.id || index}
                  style={[
                    styles.activityRow,
                    { borderBottomColor: colors.divider },
                    index === Math.min(activitiesList.length, 10) - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => router.push(`/chicken/${activity.chicken_id}`)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.activityIcon, { backgroundColor: tint + '18' }]}>
                    <Ionicons name={iconName as any} size={16} color={tint} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.activityTitle, { color: colors.text }]} numberOfLines={1}>
                      {activity.condition} — {activity.chicken_name}
                    </Text>
                    <Text style={[styles.activitySubtitle, { color: colors.textLight }]} numberOfLines={1}>
                      Captured by {activity.captured_by_name} ({activity.captured_by_role}) · {activity.farm_name}
                    </Text>
                  </View>
                  <Text style={[styles.activityTime, { color: colors.textLight }]}>{timeLabel}</Text>
                </TouchableOpacity>
              );
            })
          ) : recentActivity.length > 0 ? (
            recentActivity.map((activity, index) => (
              <View
                key={activity.id}
                style={[
                  styles.activityRow,
                  { borderBottomColor: colors.divider },
                  index === recentActivity.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <View style={[styles.activityIcon, { backgroundColor: activity.tint + '18' }]}>
                  <Ionicons name={activity.icon as any} size={16} color={activity.tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.activityTitle, { color: colors.text }]} numberOfLines={1}>{activity.title}</Text>
                  <Text style={[styles.activitySubtitle, { color: colors.textLight }]}>{activity.subtitle}</Text>
                </View>
                <Text style={[styles.activityTime, { color: colors.textLight }]}>{activity.time}</Text>
              </View>
            ))
          ) : (
            <Text style={[styles.activitySubtitle, { color: colors.textLight, paddingVertical: 8 }]}>
              No birds added yet — add your first chicken to see activity here.
            </Text>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 30 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 18 },
  headerTitle: { fontSize: 22, fontWeight: 'bold' },
  headerSubtitle: { fontSize: 13, marginTop: 3 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 12, marginBottom: 18 },
  statCard: { flexBasis: '47%', flexGrow: 1, borderRadius: 18, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  statCardTopRow: { flexDirection: 'row', marginBottom: 10 },
  statIconBadge: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: 'bold' },
  statLabel: { fontSize: 12, marginTop: 2 },
  statTrend: { fontSize: 11, fontWeight: '600', marginTop: 8 },
  card: { marginHorizontal: 20, borderRadius: 20, padding: 18, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 16 },
  viewAllText: { fontSize: 12, fontWeight: '700' },
  pillToggle: { flexDirection: 'row', borderRadius: 20, padding: 3, marginBottom: 16 },
  pillOption: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  pillOptionText: { fontSize: 12, fontWeight: '600' },
  xAxisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingHorizontal: 4 },
  xAxisLabel: { fontSize: 10, color: '#888' },
  chartFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTopWidth: 1 },
  chartFooterLabel: { fontSize: 12 },
  chartFooterValue: { fontSize: 18, fontWeight: 'bold' },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  donutWrap: { justifyContent: 'center', alignItems: 'center' },
  donutCenter: { position: 'absolute', alignItems: 'center' },
  donutCenterValue: { fontSize: 20, fontWeight: 'bold' },
  donutCenterLabel: { fontSize: 10, marginTop: 2 },
  donutLegend: { flex: 1, gap: 14 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 13, fontWeight: '600' },
  legendMeta: { fontSize: 11, marginTop: 2 },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  activityIcon: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  activityTitle: { fontSize: 13, fontWeight: '600' },
  activitySubtitle: { fontSize: 11, marginTop: 2 },
  activityTime: { fontSize: 10 },
  guestBlockContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  guestBlockIconCircle: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  guestBlockTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  guestBlockText: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  guestBlockButton: { width: '100%', maxWidth: 400, borderRadius: 30, overflow: 'hidden', marginBottom: 12 },
  guestBlockButtonGradient: { paddingVertical: 15, alignItems: 'center' },
  guestBlockButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  guestBlockSecondaryButton: { width: '100%', maxWidth: 400, borderWidth: 1, borderRadius: 30, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  guestBlockSecondaryText: { fontSize: 15, fontWeight: '600' },
  guestBlockBackButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  guestBlockBackText: { fontSize: 13, fontWeight: '500' },
});