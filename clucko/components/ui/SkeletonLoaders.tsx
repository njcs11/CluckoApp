import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, ViewStyle, Dimensions } from 'react-native';
import { useDarkMode } from '@/context/DarkModeContext';

const { width: screenWidth } = Dimensions.get('window');

interface SkeletonBoneProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: ViewStyle;
}

/**
 * 60fps Shimmering Skeleton Primitive with native animated driver.
 */
export function SkeletonBone({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
}: SkeletonBoneProps) {
  const { isDarkMode } = useDarkMode();
  const shimmerAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 0.85,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0.35,
          duration: 850,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [shimmerAnim]);

  const baseColor = isDarkMode ? '#1E2D24' : '#E2EBE5';

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height: height as any,
          borderRadius,
          backgroundColor: baseColor,
          opacity: shimmerAnim,
        },
        style,
      ]}
    />
  );
}

/**
 * 1. Home Page: Recent Activity Skeleton (Matches homeActivityRow in home.tsx)
 */
export function HomeRecentActivitySkeleton() {
  const { colors } = useDarkMode();
  return (
    <View style={[styles.homeActivityCardWrap, { backgroundColor: colors.card, borderColor: colors.divider }]}>
      {[1, 2, 3].map((key, idx) => (
        <View
          key={key}
          style={[
            styles.homeActivityRowSkeleton,
            { borderBottomColor: colors.divider },
            idx === 2 && { borderBottomWidth: 0 },
          ]}
        >
          <SkeletonBone width={36} height={36} borderRadius={12} />
          <View style={{ flex: 1, gap: 6, marginLeft: 12 }}>
            <SkeletonBone width="60%" height={13} borderRadius={4} />
            <SkeletonBone width="85%" height={11} borderRadius={4} />
          </View>
          <SkeletonBone width={42} height={10} borderRadius={4} />
        </View>
      ))}
    </View>
  );
}

/**
 * 2. Home Page & Chickens Page: Recent Scans Featured Card Skeleton
 * Exactly mirrors featuredCard in home.tsx (Avatar circle, Name, Farm & Last Capture, Message box)
 */
export function RecentScansSkeleton() {
  const { colors } = useDarkMode();

  return (
    <View style={[styles.featuredCardSkeleton, { width: '100%', backgroundColor: colors.card, borderColor: colors.divider }]}>
      {/* Top Badge Row */}
      <View style={styles.featuredBadgeRow}>
        <SkeletonBone width={105} height={22} borderRadius={11} />
        <SkeletonBone width={75} height={22} borderRadius={11} />
      </View>

      {/* Main Row: Avatar + Details */}
      <View style={styles.featuredMainRow}>
        <View style={styles.featuredAvatarWrap}>
          <SkeletonBone width={88} height={88} borderRadius={44} />
        </View>

        <View style={{ flex: 1, marginLeft: 14, gap: 10 }}>
          <SkeletonBone width="70%" height={20} borderRadius={6} />
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <SkeletonBone width={35} height={10} borderRadius={3} />
              <SkeletonBone width="90%" height={13} borderRadius={4} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <SkeletonBone width={55} height={10} borderRadius={3} />
              <SkeletonBone width="90%" height={13} borderRadius={4} />
            </View>
          </View>
        </View>

        <SkeletonBone width={16} height={16} borderRadius={8} />
      </View>

      {/* Bottom Message Box */}
      <View style={[styles.featuredMessageSkeleton, { backgroundColor: colors.background }]}>
        <SkeletonBone width={18} height={18} borderRadius={9} />
        <SkeletonBone width="75%" height={12} borderRadius={4} style={{ marginLeft: 8 }} />
      </View>
    </View>
  );
}

/**
 * 3. Flock Management: All Chickens List Skeleton (Matches birdCard in chickens.tsx)
 */
export function FlockChickensSkeleton() {
  const { colors } = useDarkMode();
  return (
    <View style={styles.flockContainer}>
      {[1, 2, 3].map((key) => (
        <View
          key={key}
          style={[
            styles.birdCardSkeleton,
            {
              backgroundColor: colors.card,
              borderColor: colors.divider,
            },
          ]}
        >
          {/* Top Row: Avatar + Identity */}
          <View style={styles.birdTopRow}>
            <SkeletonBone width={54} height={54} borderRadius={27} />
            <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <SkeletonBone width="50%" height={16} borderRadius={5} />
                <SkeletonBone width={75} height={20} borderRadius={10} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <SkeletonBone width={60} height={12} borderRadius={4} />
                <SkeletonBone width={90} height={18} borderRadius={9} />
              </View>
            </View>
          </View>

          {/* Metrics Row */}
          <View style={[styles.birdMetricsRow, { borderTopColor: colors.divider }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <SkeletonBone width={35} height={10} borderRadius={3} />
              <SkeletonBone width="75%" height={13} borderRadius={4} />
            </View>
            <View style={[styles.metricDivider, { backgroundColor: colors.divider }]} />
            <View style={{ flex: 1, gap: 4, marginLeft: 12 }}>
              <SkeletonBone width={50} height={10} borderRadius={3} />
              <SkeletonBone width="70%" height={13} borderRadius={4} />
            </View>
            <SkeletonBone width={14} height={14} borderRadius={7} />
          </View>

          {/* Card Footer */}
          <View style={styles.birdFooter}>
            <SkeletonBone width={12} height={12} borderRadius={6} />
            <SkeletonBone width={130} height={11} borderRadius={4} style={{ marginLeft: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * 4. Reports Page: Full Analytics & Summary Skeleton
 * Exactly mirrors reports.tsx: Header, 2x2 Stat Cards, Scan Activity Chart, Health Donut, Recent Activity
 */
export function ReportsSkeleton() {
  const { colors } = useDarkMode();

  return (
    <View style={styles.reportsContainer}>
      {/* Header */}
      <View style={styles.reportsHeader}>
        <SkeletonBone width={190} height={24} borderRadius={6} />
        <SkeletonBone width={130} height={13} borderRadius={4} style={{ marginTop: 6 }} />
      </View>

      {/* 2x2 Stat Cards Grid */}
      <View style={styles.reportsStatsGrid}>
        {[1, 2, 3, 4].map((key) => (
          <View
            key={key}
            style={[
              styles.reportsStatCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.divider,
              },
            ]}
          >
            <SkeletonBone width={34} height={34} borderRadius={10} style={{ marginBottom: 10 }} />
            <SkeletonBone width={48} height={22} borderRadius={6} style={{ marginBottom: 4 }} />
            <SkeletonBone width={65} height={12} borderRadius={4} style={{ marginBottom: 8 }} />
            <SkeletonBone width={85} height={13} borderRadius={6} />
          </View>
        ))}
      </View>

      {/* Scan Activity Chart Card */}
      <View style={[styles.reportsCard, { backgroundColor: colors.card, borderColor: colors.divider }]}>
        <View style={styles.reportsCardHeaderRow}>
          <SkeletonBone width={110} height={16} borderRadius={5} />
          <SkeletonBone width={100} height={28} borderRadius={14} />
        </View>

        {/* Simulated Line Chart Area */}
        <View style={styles.chartGraphArea}>
          <View style={styles.chartBarsRow}>
            {[45, 75, 55, 95, 60, 80, 50].map((hPercent, i) => (
              <View key={i} style={styles.chartCol}>
                <SkeletonBone width={18} height={`${hPercent}%`} borderRadius={4} />
              </View>
            ))}
          </View>
          <View style={[styles.chartBaseline, { backgroundColor: colors.divider }]} />
        </View>

        {/* Chart Footer */}
        <View style={[styles.reportsChartFooter, { borderTopColor: colors.divider }]}>
          <SkeletonBone width={140} height={12} borderRadius={4} />
          <SkeletonBone width={32} height={18} borderRadius={5} />
        </View>
      </View>

      {/* Health Distribution Donut Card */}
      <View style={[styles.reportsCard, { backgroundColor: colors.card, borderColor: colors.divider }]}>
        <SkeletonBone width={140} height={16} borderRadius={5} style={{ marginBottom: 16 }} />

        <View style={styles.donutRow}>
          {/* Ring Donut Skeleton */}
          <View style={styles.donutWrap}>
            <SkeletonBone width={130} height={130} borderRadius={65} />
            <View style={[styles.donutInnerCutout, { backgroundColor: colors.card }]}>
              <SkeletonBone width={36} height={18} borderRadius={5} />
              <SkeletonBone width={26} height={10} borderRadius={4} style={{ marginTop: 3 }} />
            </View>
          </View>

          {/* Legend Items */}
          <View style={styles.donutLegend}>
            {[1, 2, 3].map((key) => (
              <View key={key} style={styles.legendRow}>
                <SkeletonBone width={10} height={10} borderRadius={5} />
                <View style={{ flex: 1, gap: 4, marginLeft: 8 }}>
                  <SkeletonBone width={60} height={12} borderRadius={4} />
                  <SkeletonBone width={85} height={10} borderRadius={4} />
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Recent Health Activity Card */}
      <View style={[styles.reportsCard, { backgroundColor: colors.card, borderColor: colors.divider }]}>
        <View style={styles.reportsCardHeaderRow}>
          <SkeletonBone width={120} height={16} borderRadius={5} />
          <SkeletonBone width={50} height={12} borderRadius={4} />
        </View>

        {[1, 2, 3].map((key, idx) => (
          <View
            key={key}
            style={[
              styles.activityRowSkeleton,
              { borderBottomColor: colors.divider },
              idx === 2 && { borderBottomWidth: 0 },
            ]}
          >
            <SkeletonBone width={36} height={36} borderRadius={12} />
            <View style={{ flex: 1, gap: 6, marginLeft: 12 }}>
              <SkeletonBone width="65%" height={13} borderRadius={4} />
              <SkeletonBone width="85%" height={11} borderRadius={4} />
            </View>
            <SkeletonBone width={42} height={10} borderRadius={4} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * 5. Profile Page: Details Tab Skeleton (Matches profile.tsx Details tab)
 */
export function ProfileDetailsSkeleton() {
  const { colors } = useDarkMode();

  return (
    <View style={styles.profileDetailsContainer}>
      {/* 1. Personal Information Card */}
      <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.divider }]}>
        <SkeletonBone width={150} height={16} borderRadius={5} style={{ marginBottom: 16 }} />
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[
              styles.profileInfoRow,
              { borderBottomColor: colors.divider },
              i === 4 && { borderBottomWidth: 0 },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <SkeletonBone width={24} height={24} borderRadius={12} />
              <SkeletonBone width={70} height={13} borderRadius={4} />
            </View>
            <SkeletonBone width={110} height={13} borderRadius={4} />
          </View>
        ))}
      </View>

      {/* 2. Subscription & Quota Card */}
      <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.divider, marginTop: 14 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
          <SkeletonBone width={100} height={16} borderRadius={5} />
          <SkeletonBone width={55} height={14} borderRadius={4} />
        </View>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[
              styles.profileInfoRow,
              { borderBottomColor: colors.divider },
              i === 4 && { borderBottomWidth: 0 },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <SkeletonBone width={24} height={24} borderRadius={12} />
              <SkeletonBone width={85} height={13} borderRadius={4} />
            </View>
            <SkeletonBone width={75} height={13} borderRadius={4} />
          </View>
        ))}
      </View>

      {/* 3. Farm Information Card */}
      <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.divider, marginTop: 14 }]}>
        <SkeletonBone width={120} height={16} borderRadius={5} style={{ marginBottom: 16 }} />
        <View style={[styles.profileInfoRow, { borderBottomColor: colors.divider }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <SkeletonBone width={24} height={24} borderRadius={12} />
            <SkeletonBone width={90} height={13} borderRadius={4} />
          </View>
          <SkeletonBone width={80} height={13} borderRadius={4} />
        </View>
        <View style={[styles.profileInfoRow, { borderBottomWidth: 0 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <SkeletonBone width={24} height={24} borderRadius={12} />
            <SkeletonBone width={110} height={13} borderRadius={4} />
          </View>
          <SkeletonBone width={30} height={13} borderRadius={4} />
        </View>
      </View>
    </View>
  );
}

/**
 * 6. Notifications List Skeleton (Matches NotificationsListModal.tsx)
 */
export function NotificationsSkeleton() {
  const { colors } = useDarkMode();
  return (
    <View style={styles.notifContainer}>
      {[1, 2, 3, 4, 5].map((key) => (
        <View
          key={key}
          style={[
            styles.notifCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.divider,
            },
          ]}
        >
          <SkeletonBone width={38} height={38} borderRadius={19} />
          <View style={{ flex: 1, gap: 6, marginLeft: 12 }}>
            <SkeletonBone width="60%" height={14} borderRadius={5} />
            <SkeletonBone width="88%" height={12} borderRadius={4} />
            <SkeletonBone width={65} height={10} borderRadius={4} style={{ marginTop: 2 }} />
          </View>
          <SkeletonBone width={14} height={14} borderRadius={7} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Home Activity Skeleton
  homeActivityCardWrap: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 14,
    marginHorizontal: 0,
    marginTop: 8,
  },
  homeActivityRowSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },

  // Featured Recent Scans Card Skeleton
  featuredCardSkeleton: {
    width: '100%',
    marginHorizontal: 0,
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  featuredBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  featuredMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  featuredAvatarWrap: {
    width: 92,
    height: 92,
    borderRadius: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredMessageSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  // Flock Chickens List Skeleton
  flockContainer: {
    width: '100%',
    paddingHorizontal: 0,
    gap: 12,
  },
  birdCardSkeleton: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  birdTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  birdMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 10,
    marginBottom: 8,
  },
  metricDivider: {
    width: 1,
    height: 24,
    marginHorizontal: 10,
  },
  birdFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },

  // Reports Page Skeleton
  reportsContainer: {
    flex: 1,
  },
  reportsHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
  },
  reportsStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 18,
  },
  reportsStatCard: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  reportsCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  reportsCardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartGraphArea: {
    height: 120,
    width: '100%',
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  chartBarsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 110,
    width: '100%',
    paddingHorizontal: 8,
  },
  chartCol: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  chartBaseline: {
    height: 1.5,
    width: '100%',
    marginTop: 4,
  },
  reportsChartFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  donutWrap: {
    width: 130,
    height: 130,
    justifyContent: 'center',
    alignItems: 'center',
  },
  donutInnerCutout: {
    position: 'absolute',
    width: 78,
    height: 78,
    borderRadius: 39,
    justifyContent: 'center',
    alignItems: 'center',
  },
  donutLegend: {
    flex: 1,
    gap: 12,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activityRowSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },

  // Profile Details Skeleton
  profileDetailsContainer: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  profileCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  profileInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },

  // Notifications Skeleton
  notifContainer: {
    paddingHorizontal: 16,
    gap: 12,
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },

  // My Farms Skeleton
  myFarmsContainer: {
    padding: 16,
  },
  myFarmsMapSection: {
    marginBottom: 20,
  },
  myFarmsSectionHeader: {
    marginBottom: 14,
  },
  farmCardSkeleton: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  farmCardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  farmCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
  },

  // Farm Detail Skeleton
  farmDetailHeaderSkeleton: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  farmDetailHeaderNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  farmDetailTabBarSkeleton: {
    flexDirection: 'row',
    height: 48,
    borderBottomWidth: 1,
  },
  farmDetailTabSkeleton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  farmDetailCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  farmDetailInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  farmChickenCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  farmCaretakerCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  onlineDotSkeleton: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  caretakerFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: 1,
  },
});

/**
 * 7. My Farms List Skeleton (Matches farm/index.tsx)
 * Renders header, Davao map placeholder, 'Your Farms' header, and 2-3 farm cards
 */
export function MyFarmsSkeleton() {
  const { colors } = useDarkMode();

  return (
    <View style={styles.myFarmsContainer}>
      {/* Map Section */}
      <View style={styles.myFarmsMapSection}>
        <SkeletonBone width={130} height={14} borderRadius={4} style={{ marginBottom: 8 }} />
        <SkeletonBone width="100%" height={200} borderRadius={16} />
      </View>

      {/* Your Farms Section Header */}
      <View style={styles.myFarmsSectionHeader}>
        <SkeletonBone width={110} height={18} borderRadius={5} style={{ marginBottom: 6 }} />
        <SkeletonBone width={220} height={12} borderRadius={4} />
      </View>

      {/* Farm Cards */}
      {[1, 2].map((key) => (
        <View
          key={key}
          style={[
            styles.farmCardSkeleton,
            {
              backgroundColor: colors.card,
              borderColor: colors.divider,
            },
          ]}
        >
          {/* Card Top Row: Farm Icon Circle on Left, Actions on Right */}
          <View style={styles.farmCardHeaderRow}>
            <SkeletonBone width={44} height={44} borderRadius={22} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <SkeletonBone width={28} height={28} borderRadius={14} />
              <SkeletonBone width={28} height={28} borderRadius={14} />
            </View>
          </View>

          {/* Farm Name */}
          <SkeletonBone width="55%" height={17} borderRadius={5} style={{ marginTop: 12, marginBottom: 8 }} />

          {/* Location Row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <SkeletonBone width={14} height={14} borderRadius={7} />
            <SkeletonBone width={120} height={12} borderRadius={4} />
          </View>

          {/* Card Footer: Chicken count + Chevron */}
          <View style={[styles.farmCardFooter, { borderTopColor: colors.divider }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <SkeletonBone width={14} height={14} borderRadius={7} />
              <SkeletonBone width={75} height={12} borderRadius={4} />
            </View>
            <SkeletonBone width={14} height={14} borderRadius={7} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * 8. Farm Info Tab Skeleton (Matches farm/[id].tsx Info tab)
 */
export function FarmInfoSkeleton() {
  const { colors } = useDarkMode();

  return (
    <View style={{ width: '100%' }}>
      {/* Map Thumbnail */}
      <View style={{ marginBottom: 16 }}>
        <SkeletonBone width="100%" height={180} borderRadius={16} />
      </View>

      {/* Details Card */}
      <View style={[styles.farmDetailCard, { backgroundColor: colors.card, borderColor: colors.divider }]}>
        <SkeletonBone width={110} height={16} borderRadius={5} style={{ marginBottom: 16 }} />
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[
              styles.farmDetailInfoRow,
              { borderBottomColor: colors.divider },
              i === 4 && { borderBottomWidth: 0 },
            ]}
          >
            <SkeletonBone width={80} height={13} borderRadius={4} />
            <SkeletonBone width={110} height={13} borderRadius={4} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * 9. Farm Chickens Tab Skeleton (Matches farm/[id].tsx Chickens tab)
 */
export function FarmChickensSkeleton() {
  const { colors } = useDarkMode();

  return (
    <View style={{ width: '100%', gap: 12 }}>
      {[1, 2, 3].map((key) => (
        <View
          key={key}
          style={[
            styles.farmChickenCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.divider,
            },
          ]}
        >
          <SkeletonBone width={44} height={44} borderRadius={22} />
          <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
            <SkeletonBone width="60%" height={15} borderRadius={4} />
            <SkeletonBone width="40%" height={12} borderRadius={4} />
          </View>
          <SkeletonBone width={68} height={22} borderRadius={11} style={{ marginRight: 8 }} />
          <SkeletonBone width={14} height={14} borderRadius={7} />
        </View>
      ))}
    </View>
  );
}

/**
 * 10. Farm Caretakers Tab Skeleton (Matches farm/[id].tsx Caretakers tab)
 */
export function FarmCaretakersSkeleton() {
  const { colors } = useDarkMode();

  return (
    <View style={{ width: '100%' }}>
      {/* Add Caretaker Button Skeleton */}
      <SkeletonBone width="100%" height={48} borderRadius={14} style={{ marginBottom: 16 }} />

      {/* Caretaker Cards */}
      <View style={{ gap: 12 }}>
        {[1, 2].map((key) => (
          <View
            key={key}
            style={[
              styles.farmCaretakerCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.divider,
              },
            ]}
          >
            {/* Top Row: Avatar with status dot, Name, Email */}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ position: 'relative' }}>
                <SkeletonBone width={44} height={44} borderRadius={22} />
                <View style={[styles.onlineDotSkeleton, { backgroundColor: colors.card }]}>
                  <SkeletonBone width={10} height={10} borderRadius={5} />
                </View>
              </View>
              <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <SkeletonBone width="45%" height={15} borderRadius={4} />
                  <SkeletonBone width={62} height={20} borderRadius={10} />
                </View>
                <SkeletonBone width="65%" height={12} borderRadius={4} />
              </View>
            </View>

            {/* Bottom Actions Row */}
            <View style={[styles.caretakerFooterRow, { borderTopColor: colors.divider }]}>
              <SkeletonBone width={85} height={12} borderRadius={4} />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <SkeletonBone width={28} height={28} borderRadius={14} />
                <SkeletonBone width={28} height={28} borderRadius={14} />
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * 11. Full Farm Detail Screen Skeleton (Header + Tabs + Active Tab Content)
 */
export function FarmDetailSkeleton({ activeTab = 'info' }: { activeTab?: 'info' | 'chickens' | 'caretakers' }) {
  const { colors, isDarkMode } = useDarkMode();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.farmDetailHeaderSkeleton, { backgroundColor: isDarkMode ? '#18231E' : '#2D5541' }]}>
        <View style={styles.farmDetailHeaderNav}>
          <SkeletonBone width={28} height={28} borderRadius={14} />
          <SkeletonBone width={28} height={28} borderRadius={14} />
        </View>
        <SkeletonBone width={64} height={64} borderRadius={32} style={{ alignSelf: 'center', marginVertical: 8 }} />
        <SkeletonBone width={140} height={22} borderRadius={6} style={{ alignSelf: 'center', marginBottom: 6 }} />
        <SkeletonBone width={90} height={13} borderRadius={4} style={{ alignSelf: 'center' }} />
      </View>

      {/* Tab Bar */}
      <View style={[styles.farmDetailTabBarSkeleton, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { key: 'info', w: 45 },
          { key: 'chickens', w: 85 },
          { key: 'caretakers', w: 90 },
        ].map((t) => (
          <View
            key={t.key}
            style={[
              styles.farmDetailTabSkeleton,
              activeTab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2.5 },
            ]}
          >
            <SkeletonBone width={t.w} height={14} borderRadius={4} />
          </View>
        ))}
      </View>

      {/* Tab Content */}
      <View style={{ padding: 16 }}>
        {activeTab === 'info' && <FarmInfoSkeleton />}
        {activeTab === 'chickens' && <FarmChickensSkeleton />}
        {activeTab === 'caretakers' && <FarmCaretakersSkeleton />}
      </View>
    </View>
  );
}

