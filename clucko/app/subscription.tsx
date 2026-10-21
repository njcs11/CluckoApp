import { useDarkMode } from '@/context/DarkModeContext';
import { useNotifications } from '@/context/NotificationContext';
import { Feather, FontAwesome5, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  BackHandler,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  apiCreateCheckout,
  apiGetMyPlan,
  apiVerifyPayment,
  apiCreateChicken,
  apiSaveScan,
  apiSubmitRefundRequest,
  apiGetMyRefundStatus,
  apiGetPendingCheckout,
  apiCancelPendingCheckout,
  apiGetNotifications,
} from '../lib/api';
import { resizeAndCompress, photoUriToBase64 } from '@/utils/photoStorage';

export default function SubscriptionScreen() {
  const { colors, isDarkMode } = useDarkMode();
  const { notify } = useNotifications();
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [subData, setSubData] = useState<any>(null);
  const [availablePlans, setAvailablePlans] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'premium'>('pro');
  const [checkingOut, setCheckingOut] = useState(false);

  // In-App Confirmation & GCash Payment Overlay Modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [hasRedirected, setHasRedirected] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // In-App Alert Modal for Active Premium Restriction (Fix for Pic 1)
  const [showActivePremiumModal, setShowActivePremiumModal] = useState(false);

  // In-App Alert Modal for Payment Incomplete / Checkout Notice (Fix for Pic 2)
  const [paymentNoticeModal, setPaymentNoticeModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: 'warning' | 'error' | 'info';
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'warning',
  });

  // Enhanced Celebratory Success Modal
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successPlanName, setSuccessPlanName] = useState('');
  const [successPlanDuration, setSuccessPlanDuration] = useState('');

  // Refund Request State
  const [refundRequestData, setRefundRequestData] = useState<any>(null);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundReason, setRefundReason] = useState('Accidental Purchase');
  const [refundDetails, setRefundDetails] = useState('');
  const [submittingRefund, setSubmittingRefund] = useState(false);
  const [dismissedPriceBanner, setDismissedPriceBanner] = useState(false);
  const [dismissedRejectBanner, setDismissedRejectBanner] = useState(false);
  const [dismissedApproveBanner, setDismissedApproveBanner] = useState(false);
  const [serverNotifs, setServerNotifs] = useState<any[]>([]);
  const [dismissedNotifIds, setDismissedNotifIds] = useState<number[]>([]);
  const [activeAlertIndex, setActiveAlertIndex] = useState(0);

  // Playing-card style banner stack animation
  const bannerSwipeAnim = useRef(new Animated.Value(0)).current;
  const bannerOpacityAnim = useRef(new Animated.Value(1)).current;

  const handleDismissBannerCard = (banner: any) => {
    Animated.parallel([
      Animated.timing(bannerSwipeAnim, {
        toValue: -400,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(bannerOpacityAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(async () => {
      await banner.onDismiss();
      bannerSwipeAnim.setValue(0);
      bannerOpacityAnim.setValue(1);
    });
  };

  // Pending GCash Payment Auto-Recovery State
  const [pendingRecovery, setPendingRecovery] = useState<any>(null);
  const [verifyingPendingRecovery, setVerifyingPendingRecovery] = useState(false);
  const [cancellingPendingRecovery, setCancellingPendingRecovery] = useState(false);

  const checkPendingRecovery = useCallback(async () => {
    try {
      const serverPending = await apiGetPendingCheckout();
      if (serverPending && serverPending.has_pending && serverPending.transaction) {
        setPendingRecovery(serverPending.transaction);
        return;
      }
      const cached = await AsyncStorage.getItem('@clucko_pending_checkout');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.session_id) {
          setPendingRecovery(parsed);
          return;
        }
      }
      setPendingRecovery(null);
    } catch (e) {
      console.warn('Error checking pending recovery:', e);
    }
  }, []);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/profile');
    }
  }, []);

  useEffect(() => {
    const onBackPress = () => {
      handleBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [handleBack]);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        checkPendingRecovery();
        loadSubscription();
      }
    };
    const appSub = AppState.addEventListener('change', handleAppStateChange);
    return () => appSub.remove();
  }, [checkPendingRecovery]);

  const loadSubscription = async () => {
    try {
      const [res, refRes, bannerDismissed] = await Promise.all([
        apiGetMyPlan(),
        apiGetMyRefundStatus(),
        AsyncStorage.getItem('dismissed_pricing_notice_v1'),
        checkPendingRecovery(),
      ]);
      if (bannerDismissed === 'true') {
        setDismissedPriceBanner(true);
      }
      if (refRes && refRes.refund_request) {
        setRefundRequestData(refRes.refund_request);
        const [appDismissed, rejDismissed] = await Promise.all([
          AsyncStorage.getItem(`@clucko_dismissed_refund_${refRes.refund_request.id}_approved`),
          AsyncStorage.getItem(`@clucko_dismissed_refund_${refRes.refund_request.id}_rejected`),
        ]);
        if (appDismissed === 'true') setDismissedApproveBanner(true);
        if (rejDismissed === 'true') setDismissedRejectBanner(true);
      }
      if (res && res.subscription) {
        setSubData(res.subscription);
        if (res.available_plans) {
          setAvailablePlans(res.available_plans);
        }
        if (res.notifications && Array.isArray(res.notifications)) {
          // Strictly subscription, pricing, plan, and billing announcements ONLY
          const subNotifs = res.notifications.filter((n: any) => {
            const title = (n.title || '').toLowerCase();
            const type = (n.type || '').toLowerCase();
            if (title.includes('caretaker') || title.includes('chicken') || title.includes('scan') || title.includes('task') || title.includes('welcome')) {
              return false;
            }
            return type === 'billing' || type === 'subscription' || title.includes('pricing') || title.includes('plan') || title.includes('refund');
          });
          setServerNotifs(subNotifs);
          const checks = await Promise.all(
            subNotifs.map((n: any) =>
              AsyncStorage.getItem(`@clucko_dismissed_notif_${n.id}`)
            )
          );
          const dismissed: number[] = [];
          subNotifs.forEach((n: any, idx: number) => {
            if (checks[idx] === 'true') dismissed.push(n.id);
          });
          setDismissedNotifIds(dismissed);
        }
        // Default selection logic:
        if (res.subscription.plan === 'premium') {
          setSelectedPlan('premium');
        } else if (res.subscription.plan === 'pro') {
          setSelectedPlan('pro');
        }
      }
    } catch (e) {
      console.warn('Failed to load subscription:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const submittingRefundRef = useRef(false);

  const handleExecuteRefundRequest = async () => {
    if (submittingRefundRef.current || submittingRefund) return;
    if (!refundReason) {
      notify({
        type: 'warning',
        title: 'Reason Required',
        message: 'Please choose a reason for your refund request.',
      });
      return;
    }
    submittingRefundRef.current = true;
    setSubmittingRefund(true);
    try {
      const res = await apiSubmitRefundRequest(refundReason, refundDetails);
      if (res && res.success) {
        setShowRefundModal(false);
        notify({
          type: 'success',
          title: 'Refund Request Submitted',
          message: 'Your refund request has been submitted to the platform administration for review.',
        });
        const statusRes = await apiGetMyRefundStatus();
        if (statusRes?.refund_request) {
          setRefundRequestData(statusRes.refund_request);
        }
      }
    } catch (err: any) {
      notify({
        type: 'alert',
        title: 'Submission Failed',
        message: err.message || 'Unable to submit refund request. Please try again.',
      });
    } finally {
      submittingRefundRef.current = false;
      setSubmittingRefund(false);
    }
  };

  useEffect(() => {
    AsyncStorage.getItem('user').then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.role) setUserRole(parsed.role);
        } catch (_) { }
      }
    });
    loadSubscription();
    if (highlight === 'premium') {
      setSelectedPlan('premium');
    }
  }, [highlight]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadSubscription();
  };

  const currentPlanKey = subData?.plan || 'free_trial';
  const isInGrace = subData?.is_in_grace_period || false;
  const isExpired = subData?.is_expired || false;
  const isCaretaker = Boolean(subData?.is_caretaker || userRole === 'caretaker');

  const isCurrentlyPremium = currentPlanKey === 'premium' && (subData?.is_active || isInGrace);
  const isCurrentlyPro = currentPlanKey === 'pro' && (subData?.is_active || isInGrace);

  // Computed Perks string guarantees: never blank
  const isPremiumTier = currentPlanKey === 'premium';
  const isProTier = currentPlanKey === 'pro';

  const farmsText = isPremiumTier || (subData?.limits?.max_farms >= 999999)
    ? 'Unlimited'
    : `${subData?.limits?.max_farms || (isProTier ? 2 : 1)} ${subData?.limits?.max_farms === 1 ? 'Farm' : 'Farms'}`;

  const chickensText = isPremiumTier || (subData?.limits?.max_chickens_per_farm >= 999999)
    ? 'Unlimited'
    : `${subData?.limits?.max_chickens_per_farm || (isProTier ? 70 : 20)} per farm`;

  const capturesText = isPremiumTier || isProTier || (subData?.limits?.max_captures >= 999999)
    ? 'Unlimited'
    : `${subData?.usage?.captures_remaining ?? (subData?.limits?.max_captures || 30)} Scans Left (${subData?.usage?.captures_count || 0}/${subData?.limits?.max_captures || 30} used)`;

  // Dynamic Selected plan calculation from backend available_plans
  const isSelectedPro = selectedPlan === 'pro';
  const proPrice = availablePlans?.pro?.price !== undefined ? Number(availablePlans.pro.price) : 479;
  const premiumPrice = availablePlans?.premium?.price !== undefined ? Number(availablePlans.premium.price) : 1099;
  const planAmount = isSelectedPro ? proPrice : premiumPrice;
  const planDurationText = isSelectedPro
    ? (availablePlans?.pro?.duration_days ? `${Math.round(availablePlans.pro.duration_days / 30)} Months` : '3 Months')
    : (availablePlans?.premium?.duration_days ? `${Math.round(availablePlans.premium.duration_days / 365)} Year` : '1 Year');
  const planTitle = isSelectedPro ? (availablePlans?.pro?.name || 'Pro Account') : (availablePlans?.premium?.name || 'Premium Account');

  // 1. Open the In-App Confirmation Modal with Financial Breakdown
  const handleOpenConfirmModal = () => {
    if (isCurrentlyPremium && selectedPlan === 'pro') {
      setShowActivePremiumModal(true);
      return;
    }
    setHasRedirected(false);
    setActiveSession(null);
    setShowConfirmModal(true);
  };

  // 2. Real GCash Checkout via PayMongo
  const handleProceedToGCash = async () => {
    setCheckingOut(true);
    try {
      const res = await apiCreateCheckout(selectedPlan, 'paymongo');
      if (!res || !res.success || !res.checkout_url) {
        throw new Error(res?.error || 'Failed to initialize GCash checkout session.');
      }

      setActiveSession(res);
      setHasRedirected(true);

      const recoveryObj = {
        id: res.id,
        session_id: res.session_id,
        plan: res.plan,
        plan_name: res.plan_name || (res.plan === 'pro' ? 'Pro Account' : 'Premium Account'),
        amount: res.amount,
        checkout_url: res.checkout_url,
      };
      await AsyncStorage.setItem('@clucko_pending_checkout', JSON.stringify(recoveryObj));
      setPendingRecovery(recoveryObj);

      // Securely redirect to PayMongo GCash checkout page
      await Linking.openURL(res.checkout_url);
    } catch (err: any) {
      setPaymentNoticeModal({
        visible: true,
        title: 'Checkout Error',
        message: err.message || 'Unable to connect to GCash gateway. Please try again.',
        type: 'error',
      });
    } finally {
      setCheckingOut(false);
    }
  };

  // 3. Verify Payment Status with PayMongo
  const handleCheckPaymentStatus = async () => {
    if (!activeSession?.session_id) return;
    setVerifying(true);
    try {
      const res = await apiVerifyPayment(
        activeSession.session_id,
        activeSession.plan,
        'paymongo'
      );

      if (res && res.success && res.paid) {
        await AsyncStorage.removeItem('@clucko_pending_checkout');
        setPendingRecovery(null);
        setShowConfirmModal(false);
        setActiveSession(null);
        setHasRedirected(false);

        const activatedName = activeSession.plan === 'pro' ? 'Pro Account' : 'Premium Account';
        const activatedDur = activeSession.plan === 'pro' ? '3 Months' : '1 Year';
        setSuccessPlanName(activatedName);
        setSuccessPlanDuration(activatedDur);
        setShowSuccessModal(true);

        await loadSubscription();
        await autoSavePendingQuotaChicken();
        await notify({
          title: '🎉 Payment Successful!',
          message: `Your account has been upgraded to ${activatedName}. All perks are active!`,
          type: 'success',
        });
      } else {
        setPaymentNoticeModal({
          visible: true,
          title: 'Payment Incomplete',
          message: res?.error || 'Payment has not been completed on GCash yet. Please finish the payment in the GCash window and try again.',
          type: 'warning',
        });
      }
    } catch (err: any) {
      setPaymentNoticeModal({
        visible: true,
        title: 'Payment Incomplete',
        message: err.message || 'Payment has not been completed on GCash yet. Please finish the payment in the GCash window and try again.',
        type: 'warning',
      });
    } finally {
      setVerifying(false);
    }
  };

  // 4. Verify & Activate from Ongoing Recovery Banner
  const handleVerifyPendingRecovery = async () => {
    if (!pendingRecovery?.session_id) return;
    setVerifyingPendingRecovery(true);
    try {
      const res = await apiVerifyPayment(
        pendingRecovery.session_id,
        pendingRecovery.plan || 'pro',
        'paymongo'
      );
      if (res && res.success && res.paid) {
        await AsyncStorage.removeItem('@clucko_pending_checkout');
        setPendingRecovery(null);
        setShowConfirmModal(false);
        setActiveSession(null);

        const activatedName = (pendingRecovery.plan === 'pro') ? 'Pro Account' : 'Premium Account';
        const activatedDur = (pendingRecovery.plan === 'pro') ? '3 Months' : '1 Year';
        setSuccessPlanName(activatedName);
        setSuccessPlanDuration(activatedDur);
        setShowSuccessModal(true);

        await loadSubscription();
        await autoSavePendingQuotaChicken();
        await notify({
          title: '🎉 Payment Successful!',
          message: `Your account has been upgraded to ${activatedName}. All perks are active!`,
          type: 'success',
        });
      } else {
        setPaymentNoticeModal({
          visible: true,
          title: 'Payment Still Awaiting GCash',
          message: res?.error || 'Payment has not been completed on GCash yet. Please finish the payment in GCash, then tap Verify.',
          type: 'warning',
        });
      }
    } catch (err: any) {
      setPaymentNoticeModal({
        visible: true,
        title: 'Verification Incomplete',
        message: err.message || 'Unable to confirm GCash status yet. If you completed payment, wait a moment and try again.',
        type: 'error',
      });
    } finally {
      setVerifyingPendingRecovery(false);
    }
  };

  // 5. Cancel Ongoing Checkout Session
  const handleCancelPendingRecovery = async () => {
    setCancellingPendingRecovery(true);
    try {
      await apiCancelPendingCheckout(pendingRecovery?.session_id);
      await AsyncStorage.removeItem('@clucko_pending_checkout');
      setPendingRecovery(null);
      notify({
        title: 'Checkout Cancelled',
        message: 'The unfinished checkout session has been cancelled.',
        type: 'info',
      });
    } catch {
      await AsyncStorage.removeItem('@clucko_pending_checkout');
      setPendingRecovery(null);
    } finally {
      setCancellingPendingRecovery(false);
    }
  };

  const autoSavePendingQuotaChicken = async () => {
    try {
      const raw = await AsyncStorage.getItem('@pending_quota_chicken');
      if (!raw) return;
      const pending = JSON.parse(raw);
      if (!pending || !pending.chicken) return;

      let photoB64 = pending.photoBase64;
      if (!photoB64 && pending.photoUri) {
        try {
          const compressed = await resizeAndCompress(pending.photoUri);
          photoB64 = await photoUriToBase64(compressed);
        } catch (_) {}
      }

      const created = await apiCreateChicken({
        qr_code: pending.chicken.chickenId || pending.chicken.qr_code,
        chicken_name: pending.chicken.name || pending.chicken.chicken_name,
        farm_id: pending.chicken.farmId ? Number(pending.chicken.farmId) : undefined,
        photo_url: photoB64,
      });

      if (pending.scanResult && created?.id) {
        await apiSaveScan({
          chicken_id: created.id,
          disease_name: pending.scanResult.disease || undefined,
          confidence_score: pending.scanResult.confidence,
          severity: pending.scanResult.severity,
          image_type: pending.scanResult.module || 'eye',
          scan_type: 'camera',
          image_url: photoB64,
          all_predictions: {
            symptoms: pending.scanResult.symptoms,
            gradcam_image: pending.scanResult.gradcamImage,
          },
        });
      }

      await AsyncStorage.removeItem('@pending_quota_chicken');
      await notify({
        title: '🐔 Pending Chicken Auto-Saved!',
        message: `${pending.chicken.name || 'Your chicken'} has been automatically saved now that your subscription is active!`,
        type: 'success',
        chickenId: String(created?.id || ''),
        chickenName: pending.chicken.name,
      });
    } catch (e) {
      console.warn('Auto-save error in subscription:', e);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading Subscription...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // CTA Button Text logic
  let ctaText = `Pay ₱${planAmount.toLocaleString()} with GCash`;
  if (isSelectedPro) {
    if (isCurrentlyPro) {
      ctaText = `Extend Pro (+3 Months) • ₱${proPrice.toLocaleString()}`;
    } else if (isCurrentlyPremium) {
      ctaText = `Current Plan is Higher (Premium Active)`;
    } else {
      ctaText = `Subscribe to Pro • ₱${proPrice.toLocaleString()}`;
    }
  } else {
    if (isCurrentlyPremium) {
      ctaText = `Extend Premium (+1 Year) • ₱${premiumPrice.toLocaleString()}`;
    } else if (isCurrentlyPro) {
      ctaText = `Upgrade to Premium • ₱${premiumPrice.toLocaleString()}`;
    } else {
      ctaText = `Subscribe to Premium • ₱${premiumPrice.toLocaleString()}`;
    }
  }

  // Construct dynamic stacked alerts for transient banners (Refunds, Admin announcements)
  const stackedAlerts: Array<{
    id: string;
    type: 'approved' | 'rejected' | 'broadcast';
    title: string;
    message: string;
    icon: any;
    iconColor: string;
    badgeText: string;
    badgeBg: string;
    badgeColor: string;
    bannerBg: string;
    bannerBorder: string;
    onDismiss: () => Promise<void>;
  }> = [];

  if (refundRequestData?.status === 'approved' && !dismissedApproveBanner) {
    stackedAlerts.push({
      id: 'refund_approved',
      type: 'approved',
      title: 'Notice: Refund Request Approved',
      message: `Your refund request for ₱${Number(refundRequestData.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} has been approved and processed. ${refundRequestData.admin_notes ? `Note: ${refundRequestData.admin_notes}` : 'The transaction was refunded and your subscription ledger updated.'}`,
      icon: 'checkmark-circle',
      iconColor: '#059669',
      badgeText: 'REFUND APPROVED',
      badgeBg: isDarkMode ? '#064E3B' : '#D1FAE5',
      badgeColor: isDarkMode ? '#6EE7B7' : '#065F46',
      bannerBg: isDarkMode ? '#064E3B28' : '#ECFDF5',
      bannerBorder: '#10B981',
      onDismiss: async () => {
        setDismissedApproveBanner(true);
        await AsyncStorage.setItem(`@clucko_dismissed_refund_${refundRequestData.id}_approved`, 'true');
      }
    });
  }

  if (refundRequestData?.status === 'rejected' && !dismissedRejectBanner) {
    stackedAlerts.push({
      id: 'refund_rejected',
      type: 'rejected',
      title: 'Notice: Refund Request Declined',
      message: `Your previous refund request was reviewed and declined. Reason: ${refundRequestData.admin_notes || 'Does not qualify under standard refund terms'}.`,
      icon: 'close-circle',
      iconColor: '#DC2626',
      badgeText: 'REFUND DECLINED',
      badgeBg: isDarkMode ? '#450A0A' : '#FEE2E2',
      badgeColor: isDarkMode ? '#FCA5A5' : '#991B1B',
      bannerBg: isDarkMode ? '#2D1718' : '#FEF2F2',
      bannerBorder: '#EF4444',
      onDismiss: async () => {
        setDismissedRejectBanner(true);
        await AsyncStorage.setItem(`@clucko_dismissed_refund_${refundRequestData.id}_rejected`, 'true');
      }
    });
  }

  serverNotifs.forEach((n: any) => {
    if (!dismissedNotifIds.includes(n.id)) {
      stackedAlerts.push({
        id: `notif_${n.id}`,
        type: 'broadcast',
        title: n.title || 'Subscription Notice',
        message: n.message,
        icon: 'notifications',
        iconColor: '#D97706',
        badgeText: 'ANNOUNCEMENT',
        badgeBg: isDarkMode ? '#334155' : '#FEF3C7',
        badgeColor: isDarkMode ? '#FDE68A' : '#92400E',
        bannerBg: isDarkMode ? '#1E293B' : '#FEF3C7',
        bannerBorder: '#F59E0B',
        onDismiss: async () => {
          setDismissedNotifIds((prev) => [...prev, n.id]);
          await AsyncStorage.setItem(`@clucko_dismissed_notif_${n.id}`, 'true');
        }
      });
    }
  });

  const safeAlertIndex = Math.min(activeAlertIndex, Math.max(0, stackedAlerts.length - 1));
  const currentAlert = stackedAlerts[safeAlertIndex];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Subscription & Plans</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Manage your farms & chicken capacity</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={handleRefresh}>
          <Ionicons name="refresh" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} />}
      >
        {/* Caretaker Notice */}
        {isCaretaker && (
          <View style={[styles.caretakerBanner, { backgroundColor: '#E3F2FD', borderColor: '#90CAF9' }]}>
            <Ionicons name="information-circle" size={22} color="#1976D2" />
            <Text style={[styles.caretakerText, { color: '#0D47A1' }]}>
              You are signed in as a <Text style={{ fontWeight: '700' }}>Caretaker</Text>. Your access and features are provided by your farm owner's active subscription.
            </Text>
          </View>
        )}

        {/* ⚠️ Grace Period Warning Banner (3-Day Policy) */}
        {isInGrace && (
          <View style={styles.graceBanner}>
            <LinearGradient colors={['#FF9800', '#F57C00']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.graceGradient}>
              <Ionicons name="warning" size={24} color="#fff" />
              <View style={styles.graceTextContainer}>
                <Text style={styles.graceTitle}>3-Day Grace Period Active!</Text>
                <Text style={styles.graceSubtitle}>
                  Your subscription expired. You have {subData?.grace_days_remaining || 3} day(s) left before your account downgrades to the Standard Free Tier. All features remain fully active. Renew now via GCash to avoid interruption.
                </Text>
              </View>
            </LinearGradient>
          </View>
        )}

        {/* ⬇️ Expired to Free Warning Banner */}
        {isExpired && (
          <View style={[styles.expiredBanner, { backgroundColor: '#FFEBEE', borderColor: '#FFCDD2' }]}>
            <Ionicons name="alert-circle" size={24} color="#D32F2F" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.expiredTitle, { color: '#C62828' }]}>Account on Standard Free Tier</Text>
              <Text style={[styles.expiredText, { color: '#B71C1C' }]}>
                Your trial or plan has ended. All your existing farms and chickens remain completely safe! Upgrade to add more farms or chickens.
              </Text>
            </View>
          </View>
        )}

        {/* ─── CARD STACK UI FOR ALERTS (No Vertical Pile-up) ─── */}
        {stackedAlerts.length > 0 && currentAlert && (
          <View style={styles.cardStackWrapper}>
            {stackedAlerts.length > 2 && (
              <View 
                style={[
                  styles.cardStackLayer2, 
                  { backgroundColor: isDarkMode ? '#141E18' : '#E2E8F0', borderColor: isDarkMode ? '#23382B' : '#CBD5E1' }
                ]} 
              />
            )}
            {stackedAlerts.length > 1 && (
              <View 
                style={[
                  styles.cardStackLayer1, 
                  { backgroundColor: isDarkMode ? '#1A2921' : '#EDF2F7', borderColor: isDarkMode ? '#2D4A38' : '#CBD5E1' }
                ]} 
              />
            )}

            <View style={[
              styles.cardStackMain, 
              { backgroundColor: currentAlert.bannerBg, borderColor: currentAlert.bannerBorder }
            ]}>
              <View style={styles.cardStackHeaderRow}>
                <View style={[styles.cardStackBadge, { backgroundColor: currentAlert.badgeBg }]}>
                  <Text style={[styles.cardStackBadgeText, { color: currentAlert.badgeColor }]}>
                    {currentAlert.badgeText}
                  </Text>
                </View>

                {stackedAlerts.length > 1 && (
                  <View style={styles.cardStackNavRow}>
                    <TouchableOpacity
                      disabled={safeAlertIndex === 0}
                      onPress={() => setActiveAlertIndex((prev) => Math.max(0, prev - 1))}
                      style={[styles.cardStackNavBtn, { opacity: safeAlertIndex === 0 ? 0.3 : 1 }]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="chevron-back" size={16} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.cardStackCounter, { color: colors.textSecondary }]}>
                      {safeAlertIndex + 1} / {stackedAlerts.length}
                    </Text>
                    <TouchableOpacity
                      disabled={safeAlertIndex >= stackedAlerts.length - 1}
                      onPress={() => setActiveAlertIndex((prev) => Math.min(stackedAlerts.length - 1, prev + 1))}
                      style={[styles.cardStackNavBtn, { opacity: safeAlertIndex >= stackedAlerts.length - 1 ? 0.3 : 1 }]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="chevron-forward" size={16} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 2 }}>
                <Ionicons name={currentAlert.icon} size={20} color={currentAlert.iconColor} style={{ marginTop: 2, marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pricingNoticeTitle, { color: isDarkMode ? '#F1F5F9' : '#0F172A' }]}>
                    {currentAlert.title}
                  </Text>
                  <Text style={[styles.pricingNoticeBody, { color: isDarkMode ? '#CBD5E1' : '#334155' }]}>
                    {currentAlert.message}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.pricingNoticeDismiss, { backgroundColor: currentAlert.badgeBg, marginTop: 4 }]}
                onPress={async () => {
                  await currentAlert.onDismiss();
                  if (safeAlertIndex > 0 && safeAlertIndex >= stackedAlerts.length - 1) {
                    setActiveAlertIndex(safeAlertIndex - 1);
                  }
                }}
              >
                <Text style={[styles.pricingNoticeDismissText, { color: currentAlert.badgeColor }]}>Got it</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ─── Persistent Active Pricing Schedule (Always Visible - No Erasing) ─── */}
        <View style={[
          styles.persistentPricingBanner, 
          { backgroundColor: isDarkMode ? '#1E293B' : '#FEF3C7', borderColor: '#F59E0B' }
        ]}>
          <View style={styles.persistentPricingHeader}>
            <View style={[styles.persistentPricingBadge, { backgroundColor: isDarkMode ? '#B45309' : '#D97706' }]}>
              <Ionicons name="pricetag" size={11} color="#FFFFFF" />
              <Text style={styles.persistentPricingBadgeText}>OFFICIAL PRICING SCHEDULE</Text>
            </View>
            <View style={[styles.dynamicPill, { backgroundColor: isDarkMode ? '#334155' : '#FDE68A' }]}>
              <Text style={[styles.dynamicPillText, { color: isDarkMode ? '#FDE68A' : '#92400E' }]}>Active Rates</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 8 }}>
            <Ionicons name="information-circle" size={20} color="#D97706" style={{ marginTop: 2, marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.pricingNoticeTitle, { color: isDarkMode ? '#FDE68A' : '#92400E' }]}>
                Notice: Subscription Pricing Schedule
              </Text>
              <Text style={[styles.pricingNoticeBody, { color: isDarkMode ? '#CBD5E1' : '#78350F' }]}>
                {`Pro Plan is ₱${proPrice.toLocaleString()} / 3 months and Premium Plan is ₱${premiumPrice.toLocaleString()} / 1 year. All active subscriptions maintain their valid duration without price change until next renewal.`}
              </Text>
              <Text style={[styles.persistentPricingFootnote, { color: isDarkMode ? '#94A3B8' : '#B45309' }]}>
                * All rates are dynamic and subject to variation by the developer team. Please monitor active schedules before checkout.
              </Text>
            </View>
          </View>
        </View>

        {/* Pending GCash Payment Auto-Recovery Card */}
        {pendingRecovery && (
          <View style={[styles.pendingRecoveryBanner, { backgroundColor: isDarkMode ? '#172033' : '#EFF6FF', borderColor: '#3B82F6' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={[styles.pendingRecoveryIconWrap, { backgroundColor: isDarkMode ? '#1E3A8A' : '#DBEAFE' }]}>
                <Ionicons name="time" size={20} color="#2563EB" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[styles.pendingRecoveryTitle, { color: isDarkMode ? '#93C5FD' : '#1E40AF' }]}>
                    Ongoing Payment Detected
                  </Text>
                  <View style={[styles.pendingBadge, { backgroundColor: isDarkMode ? '#1E3A8A' : '#BFDBFE' }]}>
                    <Text style={[styles.pendingBadgeText, { color: isDarkMode ? '#93C5FD' : '#1D4ED8' }]}>
                      {pendingRecovery.plan === 'pro' ? 'PRO' : 'PREMIUM'} • ₱{Number(pendingRecovery.amount).toFixed(2)}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.pendingRecoveryBody, { color: isDarkMode ? '#CBD5E1' : '#334155' }]}>
                  Did your GCash checkout get interrupted or did you accidentally exit the app? Your money is safe! If you finished payment on GCash, tap Verify to activate your plan right now.
                </Text>

                {/* Recovery Action Buttons */}
                <View style={styles.pendingActionRow}>
                  <TouchableOpacity
                    style={[styles.pendingVerifyBtn, { opacity: verifyingPendingRecovery ? 0.7 : 1 }]}
                    onPress={handleVerifyPendingRecovery}
                    disabled={verifyingPendingRecovery}
                  >
                    {verifyingPendingRecovery ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="shield-checkmark" size={15} color="#fff" />
                        <Text style={styles.pendingVerifyBtnText}>Verify & Activate</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {pendingRecovery.checkout_url && (
                    <TouchableOpacity
                      style={[styles.pendingResumeBtn, { borderColor: isDarkMode ? '#3B82F6' : '#2563EB' }]}
                      onPress={() => Linking.openURL(pendingRecovery.checkout_url)}
                    >
                      <Ionicons name="open-outline" size={15} color={isDarkMode ? '#93C5FD' : '#1D4ED8'} />
                      <Text style={[styles.pendingResumeBtnText, { color: isDarkMode ? '#93C5FD' : '#1D4ED8' }]}>Resume GCash</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.pendingCancelBtn}
                    onPress={handleCancelPendingRecovery}
                    disabled={cancellingPendingRecovery}
                  >
                    <Text style={[styles.pendingCancelBtnText, { color: isDarkMode ? '#94A3B8' : '#64748B' }]}>
                      {cancellingPendingRecovery ? 'Cancelling...' : 'Cancel'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Current Active Plan Status Card */}
        <View style={[styles.currentPlanCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.currentPlanHeader}>
            <View style={styles.planBadgeRow}>
              <View style={[styles.planIconWrap, { backgroundColor: isPremiumTier ? '#FFF8E1' : isProTier ? (isDarkMode ? '#1E2621' : '#EAF2EC') : '#EDE7F6' }]}>
                <FontAwesome5
                  name={isPremiumTier ? 'crown' : isProTier ? 'award' : 'seedling'}
                  size={20}
                  color={isPremiumTier ? '#F59E0B' : isProTier ? colors.primary : '#7C3AED'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.currentPlanName, { color: colors.text }]}>{subData?.plan_name || 'Free Trial'}</Text>
                <Text style={[styles.currentPlanDuration, { color: colors.textSecondary }]}>
                  {isInGrace
                    ? `In Grace Period (${subData?.grace_days_remaining}d left)`
                    : isExpired
                      ? 'Expired (Standard Free)'
                      : subData?.days_remaining !== undefined
                        ? `${subData?.days_remaining} days remaining`
                        : 'Active Plan'}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: isInGrace ? '#FFF3E0' : isExpired ? '#FFEBEE' : (isDarkMode ? '#1E2621' : '#EAF2EC'),
                  borderColor: isInGrace ? '#FFB74D' : isExpired ? '#EF9A9A' : colors.primary,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  {
                    color: isInGrace ? '#E65100' : isExpired ? '#C62828' : colors.primary,
                  },
                ]}
              >
                {isInGrace ? 'GRACE PERIOD' : isExpired ? 'DOWNGRADED' : 'ACTIVE'}
              </Text>
            </View>
          </View>

          {/* Quick Perks Summary - Guaranteed Never Blank */}
          <View style={styles.planPerksList}>
            <View style={styles.planPerkItem}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={[styles.planPerkLabel, { color: colors.textSecondary }]}>Farms Allowed: </Text>
              <Text style={[styles.planPerkValue, { color: colors.text }]}>{farmsText}</Text>
            </View>
            <View style={styles.planPerkItem}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={[styles.planPerkLabel, { color: colors.textSecondary }]}>Chickens per Farm: </Text>
              <Text style={[styles.planPerkValue, { color: colors.text }]}>{chickensText}</Text>
            </View>
            <View style={styles.planPerkItem}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={[styles.planPerkLabel, { color: colors.textSecondary }]}>AI Scans: </Text>
              <Text style={[styles.planPerkValue, { color: colors.text }]}>{capturesText}</Text>
            </View>
          </View>

          {/* Refund Status Alerts or Request Button (Owners Only) */}
          {!isCaretaker && (
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, marginTop: 12 }}>
              {refundRequestData?.status === 'pending' ? (
                <View style={[styles.refundStatusCard, { backgroundColor: isDarkMode ? '#2D2214' : '#FFFBEB', borderColor: '#FDE68A' }]}>
                  <Ionicons name="time" size={20} color="#D97706" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: isDarkMode ? '#FDE68A' : '#B45309' }}>
                      Refund Request Under Review
                    </Text>
                    <Text style={{ fontSize: 11.5, color: isDarkMode ? '#E2E8F0' : '#92400E', marginTop: 2 }}>
                      You requested a refund for ₱{Number(refundRequestData.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} ({refundRequestData.reason}). Clucko administration is reviewing your request.
                    </Text>
                  </View>
                </View>
              ) : refundRequestData?.status === 'rejected' ? (
                <View>
                  <View style={[styles.refundStatusCard, { backgroundColor: isDarkMode ? '#2B1718' : '#FEF2F2', borderColor: '#FECACA' }]}>
                    <Ionicons name="alert-circle" size={20} color="#DC2626" />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: isDarkMode ? '#FCA5A5' : '#B91C1C' }}>
                        Previous Refund Request Declined
                      </Text>
                      <Text style={{ fontSize: 11.5, color: isDarkMode ? '#E2E8F0' : '#991B1B', marginTop: 2 }}>
                        Reason: {refundRequestData.admin_notes || 'Does not meet refund criteria'}.
                      </Text>
                    </View>
                  </View>
                  {/* Re-request allowed */}
                  {(isProTier || isPremiumTier) && subData?.is_active && (
                    <TouchableOpacity
                      style={[styles.refundRequestTriggerBtn, { borderColor: colors.border, marginTop: 8 }]}
                      onPress={() => {
                        setRefundReason('Accidental Purchase');
                        setRefundDetails('');
                        setShowRefundModal(true);
                      }}
                    >
                      <MaterialCommunityIcons name="cash-refund" size={16} color="#EF4444" />
                      <Text style={[styles.refundRequestTriggerText, { color: colors.textSecondary }]}>
                        Request a Refund Again
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : refundRequestData?.status === 'approved' ? (
                <View>
                  <View style={[styles.refundStatusCard, { backgroundColor: isDarkMode ? '#064E3B22' : '#ECFDF5', borderColor: '#A7F3D0' }]}>
                    <Ionicons name="checkmark-circle" size={20} color="#059669" />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: isDarkMode ? '#6EE7B7' : '#065F46' }}>
                        Refund Request Approved
                      </Text>
                      <Text style={{ fontSize: 11.5, color: isDarkMode ? '#D1FAE5' : '#047857', marginTop: 2 }}>
                        ₱{Number(refundRequestData.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} was approved. {refundRequestData.admin_notes ? `Note: ${refundRequestData.admin_notes}` : ''}
                      </Text>
                    </View>
                  </View>
                  {(isProTier || isPremiumTier) && subData?.is_active && (
                    <TouchableOpacity
                      style={[styles.refundRequestTriggerBtn, { borderColor: colors.border, marginTop: 8 }]}
                      onPress={() => {
                        setRefundReason('Accidental Purchase');
                        setRefundDetails('');
                        setShowRefundModal(true);
                      }}
                    >
                      <MaterialCommunityIcons name="cash-refund" size={16} color="#EF4444" />
                      <Text style={[styles.refundRequestTriggerText, { color: colors.textSecondary }]}>
                        Request a Refund
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (isProTier || isPremiumTier) && subData?.is_active ? (
                <TouchableOpacity
                  style={[styles.refundRequestTriggerBtn, { borderColor: colors.border }]}
                  onPress={() => {
                    setRefundReason('Accidental Purchase');
                    setRefundDetails('');
                    setShowRefundModal(true);
                  }}
                >
                  <MaterialCommunityIcons name="cash-refund" size={16} color="#EF4444" />
                  <Text style={[styles.refundRequestTriggerText, { color: colors.textSecondary }]}>
                    Request a Refund
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        </View>

        {/* Data Retention Guarantee */}
        <View style={[styles.guaranteeCard, { backgroundColor: isDarkMode ? '#1E293B' : '#F8FAFC', borderColor: isDarkMode ? '#334155' : '#E2E8F0' }]}>
          <View style={styles.guaranteeHeader}>
            <Ionicons name="shield-checkmark" size={18} color="#0284C7" />
            <Text style={[styles.guaranteeTitle, { color: isDarkMode ? '#BAE6FD' : '#0369A1' }]}>
              Your Farm & Chicken Data is Never Lost
            </Text>
          </View>
          <Text style={[styles.guaranteeBody, { color: colors.textSecondary }]}>
            If your subscription or trial expires, your account simply pauses new creations. All your existing farms, chickens, and medical histories remain safely stored.
          </Text>
        </View>

        {/* If Caretaker: Show informative message explaining that subscription is managed by the farm owner */}
        {isCaretaker ? (
          <View style={[styles.caretakerCard, { backgroundColor: colors.card, borderColor: isDarkMode ? '#1E3A8A' : '#BFDBFE' }]}>
            <View style={styles.caretakerCardHeader}>
              <View style={[styles.caretakerIconWrap, { backgroundColor: isDarkMode ? '#1E293B' : '#EFF6FF' }]}>
                <Ionicons name="shield-checkmark" size={24} color="#2563EB" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.caretakerCardTitle, { color: colors.text }]}>Farm Owner Managed</Text>
                <Text style={[styles.caretakerCardSubtitle, { color: colors.textSecondary }]}>
                  Read-only Caretaker View
                </Text>
              </View>
            </View>
            <Text style={[styles.caretakerCardBody, { color: colors.textSecondary }]}>
              As a caretaker, your account inherits subscription perks and farm quotas directly from your farm owner's active plan.
              {'\n\n'}
              Only the farm owner has the authority to purchase, renew, or change subscription plans. Any updates made by the owner are automatically reflected in your account.
            </Text>
          </View>
        ) : (
          <>
            {/* Plan Selection Header */}
            <View style={styles.sectionHeaderWrap}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Choose Your Plan</Text>
              <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
                Select a plan to upgrade or extend your active subscription.
              </Text>
            </View>

            {/* Plan 1: Pro Account */}
            <TouchableOpacity
              style={[
                styles.planCard,
                {
                  backgroundColor: colors.card,
                  borderColor: selectedPlan === 'pro' ? colors.primary : colors.border,
                  borderWidth: selectedPlan === 'pro' ? 2 : 1,
                  opacity: isCurrentlyPremium ? 0.75 : 1,
                },
              ]}
              onPress={() => {
                if (isCurrentlyPremium) {
                  setShowActivePremiumModal(true);
                  return;
                }
                setSelectedPlan('pro');
              }}
              activeOpacity={0.85}
            >
              <View style={styles.planCardTop}>
                <View style={styles.planBadgeContainer}>
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>POPULAR CHOICE</Text>
                  </View>
                  {isCurrentlyPremium && (
                    <View style={[styles.popularBadge, { backgroundColor: '#F3E8FF', marginLeft: 6 }]}>
                      <Text style={[styles.popularBadgeText, { color: '#7E22CE' }]}>LOWER TIER</Text>
                    </View>
                  )}
                </View>

                <View style={styles.planTitlePriceRow}>
                  <View style={styles.planTitleCol}>
                    <Text style={[styles.planCardTitle, { color: colors.text }]}>Pro Account</Text>
                    <Text style={[styles.planCardPeriod, { color: colors.textSecondary }]}>Valid for 3 Months</Text>
                  </View>

                  <View style={[styles.priceTagWrap, { backgroundColor: selectedPlan === 'pro' ? (isDarkMode ? '#1E2621' : '#EAF2EC') : (isDarkMode ? '#262626' : '#F5F5F5') }]}>
                    <Text style={[styles.priceTagAmount, { color: colors.primary }]}>₱{proPrice.toLocaleString()}</Text>
                    <Text style={[styles.priceTagInterval, { color: colors.textSecondary }]}>for 3 months</Text>
                  </View>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <View style={styles.featuresList}>
                <View style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                  <Text style={[styles.featureText, { color: colors.text }]}>
                    <Text style={{ fontWeight: '700' }}>2 Farms</Text> fully supported
                  </Text>
                </View>
                <View style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                  <Text style={[styles.featureText, { color: colors.text }]}>
                    Up to <Text style={{ fontWeight: '700' }}>60 Chickens</Text> per farm
                  </Text>
                </View>
                <View style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                  <Text style={[styles.featureText, { color: colors.text }]}>
                    <Text style={{ fontWeight: '700' }}>Unlimited</Text> AI Disease Scans
                  </Text>
                </View>
                <View style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                  <Text style={[styles.featureText, { color: colors.text }]}>Multi-Caretaker assignments</Text>
                </View>
                <View style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                  <Text style={[styles.featureText, { color: colors.text }]}>AI Visual Focus Heatmaps</Text>
                </View>
              </View>

              <View style={styles.radioRow}>
                <View style={[styles.radioButton, { borderColor: selectedPlan === 'pro' ? colors.primary : colors.textLight }]}>
                  {selectedPlan === 'pro' && <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />}
                </View>
                <Text style={[styles.radioLabel, { color: selectedPlan === 'pro' ? colors.primary : colors.textSecondary }]}>
                  {isCurrentlyPro ? 'Selected (Extend Plan)' : isCurrentlyPremium ? 'Lower Tier (Cannot Downgrade)' : selectedPlan === 'pro' ? 'Selected Plan' : 'Select Pro Account'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Plan 2: Premium Account */}
            <TouchableOpacity
              style={[
                styles.planCard,
                {
                  backgroundColor: colors.card,
                  borderColor: selectedPlan === 'premium' ? '#F59E0B' : colors.border,
                  borderWidth: selectedPlan === 'premium' ? 2 : 1,
                },
              ]}
              onPress={() => setSelectedPlan('premium')}
              activeOpacity={0.85}
            >
              <View style={styles.planCardTop}>
                <View style={styles.planBadgeContainer}>
                  <LinearGradient colors={['#F59E0B', '#D97706']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.bestValueBadge}>
                    <Text style={styles.bestValueText}>BEST VALUE</Text>
                  </LinearGradient>
                </View>

                <View style={styles.planTitlePriceRow}>
                  <View style={styles.planTitleCol}>
                    <Text style={[styles.planCardTitle, { color: colors.text }]}>Premium Account</Text>
                    <Text style={[styles.planCardPeriod, { color: colors.textSecondary }]}>Valid for 1 Full Year</Text>
                  </View>

                  <View style={[styles.priceTagWrap, { backgroundColor: selectedPlan === 'premium' ? '#FEF3C7' : (isDarkMode ? '#262626' : '#F5F5F5') }]}>
                    <Text style={[styles.priceTagAmount, { color: '#D97706' }]}>₱{premiumPrice.toLocaleString()}</Text>
                    <Text style={[styles.priceTagInterval, { color: colors.textSecondary }]}>for 1 year</Text>
                  </View>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <View style={styles.featuresList}>
                <View style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#F59E0B" />
                  <Text style={[styles.featureText, { color: colors.text }]}>
                    <Text style={{ fontWeight: '700' }}>Unlimited Farms</Text> (Create as many as needed)
                  </Text>
                </View>
                <View style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#F59E0B" />
                  <Text style={[styles.featureText, { color: colors.text }]}>
                    <Text style={{ fontWeight: '700' }}>Unlimited Chickens</Text> per farm
                  </Text>
                </View>
                <View style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#F59E0B" />
                  <Text style={[styles.featureText, { color: colors.text }]}>
                    <Text style={{ fontWeight: '700' }}>Unlimited</Text> AI Disease Scans
                  </Text>
                </View>
                <View style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#F59E0B" />
                  <Text style={[styles.featureText, { color: colors.text }]}>Unlimited Caretakers & Farm staff</Text>
                </View>
                <View style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#F59E0B" />
                  <Text style={[styles.featureText, { color: colors.text }]}>All Features & Future Updates Unlocked</Text>
                </View>
              </View>

              <View style={styles.radioRow}>
                <View style={[styles.radioButton, { borderColor: selectedPlan === 'premium' ? '#F59E0B' : colors.textLight }]}>
                  {selectedPlan === 'premium' && <View style={[styles.radioDot, { backgroundColor: '#F59E0B' }]} />}
                </View>
                <Text style={[styles.radioLabel, { color: selectedPlan === 'premium' ? '#F59E0B' : colors.textSecondary }]}>
                  {isCurrentlyPremium ? 'Selected (Extend Plan)' : isCurrentlyPro && selectedPlan === 'premium' ? 'Selected (Upgrade & Stack Pro Days)' : selectedPlan === 'premium' ? 'Selected Plan' : 'Select Premium Account'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* GCash Payment Method Info Card */}
            <View style={[styles.gcashCard, { backgroundColor: colors.card, borderColor: '#005CE6' }]}>
              <View style={styles.gcashHeaderRow}>
                <View style={styles.gcashBadgeWrap}>
                  <Text style={styles.gcashBadgeText}>GCash</Text>
                </View>
                <Text style={[styles.gcashCardTitle, { color: colors.text }]}>Official GCash Payment</Text>
              </View>
              <Text style={[styles.gcashCardDesc, { color: colors.textSecondary }]}>
                Pay securely with your GCash wallet. When you proceed, you will be redirected to the secure GCash payment gateway to authorize your payment.
              </Text>
            </View>

            {/* Subscribe / Extend Action Button */}
            <TouchableOpacity
              style={[styles.ctaButtonWrap, isCurrentlyPremium && selectedPlan === 'pro' && { opacity: 0.6 }]}
              onPress={handleOpenConfirmModal}
              disabled={checkingOut || (isCurrentlyPremium && selectedPlan === 'pro')}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={['#005CE6', '#0047B3']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaGradient}
              >
                <View style={styles.ctaContentRow}>
                  <View style={styles.gcashIconCircle}>
                    <Ionicons name="wallet-outline" size={18} color="#005CE6" />
                  </View>
                  <Text style={styles.ctaButtonText}>{ctaText}</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/* No Double Charge Notice */}
            <View style={styles.trialNoticeContainer}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.textLight} />
              <Text style={[styles.trialNoticeText, { color: colors.textLight }]}>
                No double charge guarantee: If you renew early, remaining days are automatically added to your new validity period.
              </Text>
            </View>

            {/* Legal Disclosures & Support Footer (Google Play Compliance) */}
            <View style={styles.legalFooterRow}>
              <TouchableOpacity onPress={() => router.push('/signup')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[styles.legalFooterLink, { color: colors.primary }]}>Terms of Service</Text>
              </TouchableOpacity>
              <Text style={{ color: colors.textLight, fontSize: 12 }}>•</Text>
              <TouchableOpacity onPress={() => router.push('/signup')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[styles.legalFooterLink, { color: colors.primary }]}>Privacy Policy</Text>
              </TouchableOpacity>
              <Text style={{ color: colors.textLight, fontSize: 12 }}>•</Text>
              <TouchableOpacity onPress={() => Linking.openURL('mailto:jasphertadlan@gmail.com')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[styles.legalFooterLink, { color: colors.primary }]}>Support</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* 🪟 IN-APP OVERLAY CONFIRMATION & GCASH PAYMENT MODAL */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!checkingOut && !verifying) {
            setShowConfirmModal(false);
          }
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {!hasRedirected ? (
              // Step 1: Confirmation & Financial Breakdown
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.modalIconWrap}>
                    <Ionicons name="receipt-outline" size={24} color="#005CE6" />
                  </View>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Confirm Subscription</Text>
                  <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                    Review your order details before proceeding to GCash
                  </Text>
                </View>

                {/* Financial Breakdown Table */}
                <View style={[styles.breakdownBox, { backgroundColor: isDarkMode ? '#1E293B' : '#F8FAFC', borderColor: colors.border }]}>
                  <View style={styles.breakdownRow}>
                    <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Selected Plan</Text>
                    <Text style={[styles.breakdownValue, { color: colors.text }]}>{planTitle}</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Validity Added</Text>
                    <Text style={[styles.breakdownValue, { color: colors.text }]}>+{planDurationText}</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Payment Method</Text>
                    <View style={styles.gcashMiniBadge}>
                      <Text style={styles.gcashMiniText}>GCash</Text>
                    </View>
                  </View>
                  <View style={[styles.breakdownDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.breakdownRow}>
                    <Text style={[styles.breakdownTotalLabel, { color: colors.text }]}>Total Due Now</Text>
                    <Text style={[styles.breakdownTotalAmount, { color: '#005CE6' }]}>₱{planAmount.toLocaleString()}.00</Text>
                  </View>
                </View>

                {/* Transparent Billing Notice */}
                <View style={styles.termsNoticeWrap}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.textLight} />
                  <Text style={[styles.termsNoticeText, { color: colors.textLight }]}>
                    {subData?.days_remaining > 0
                      ? `Your current ${subData.days_remaining} remaining days will be kept. Your new expiration will be extended accordingly.`
                      : 'You will be securely redirected to the GCash authorization page to confirm payment.'}
                  </Text>
                </View>

                {/* Action Buttons */}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalConfirmBtn, { backgroundColor: '#005CE6' }]}
                    onPress={handleProceedToGCash}
                    disabled={checkingOut}
                    activeOpacity={0.85}
                  >
                    {checkingOut ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.modalConfirmBtnText}>Proceed to GCash</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => setShowConfirmModal(false)}
                    disabled={checkingOut}
                  >
                    <Text style={[styles.modalCancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              // Step 2: User Redirected to GCash - Verification Screen
              <>
                <View style={styles.modalHeader}>
                  <View style={[styles.modalIconWrap, { backgroundColor: '#E3F2FD' }]}>
                    <Ionicons name="phone-portrait-outline" size={26} color="#005CE6" />
                  </View>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Complete GCash Payment</Text>
                  <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                    We opened GCash in your browser. Authorize the ₱{planAmount.toLocaleString()} payment, then tap below.
                  </Text>
                </View>

                <View style={[styles.waitingCard, { backgroundColor: isDarkMode ? '#1E293B' : '#F1F5F9' }]}>
                  <ActivityIndicator size="small" color="#005CE6" style={{ marginBottom: 8 }} />
                  <Text style={[styles.waitingText, { color: colors.text }]}>
                    Waiting for GCash confirmation...
                  </Text>
                  <Text style={[styles.waitingSubtext, { color: colors.textSecondary }]}>
                    After you click "Pay" on GCash, tap the button below to confirm and activate your subscription.
                  </Text>
                </View>

                {/* Action Buttons */}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalConfirmBtn, { backgroundColor: '#10B981' }]}
                    onPress={handleCheckPaymentStatus}
                    disabled={verifying}
                    activeOpacity={0.85}
                  >
                    {verifying ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.modalConfirmBtnText}>I Have Paid via GCash</Text>
                    )}
                  </TouchableOpacity>

                  {activeSession?.checkout_url && (
                    <TouchableOpacity
                      style={[styles.reopenBtn, { borderColor: colors.border }]}
                      onPress={() => Linking.openURL(activeSession.checkout_url)}
                    >
                      <Text style={[styles.reopenBtnText, { color: '#005CE6' }]}>Re-open GCash Payment Page</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => {
                      setShowConfirmModal(false);
                      setHasRedirected(false);
                    }}
                    disabled={verifying}
                  >
                    <Text style={[styles.modalCancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* 🎉 ENHANCED CELEBRATION SUCCESS MODAL (Fix for Pic 2) */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.successModalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <LinearGradient
              colors={['#10B981', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.successIconCircle}
            >
              <FontAwesome5 name="crown" size={32} color="#fff" />
            </LinearGradient>

            <Text style={[styles.successTitle, { color: colors.text }]}>Payment Confirmed!</Text>
            <Text style={[styles.successSubtitle, { color: colors.textSecondary }]}>
              Your GCash transaction was verified successfully. Welcome to your upgraded subscription!
            </Text>

            <View style={[styles.successPlanDetails, { backgroundColor: isDarkMode ? '#1E293B' : '#F0FDF4', borderColor: '#BBF7D0' }]}>
              <View style={styles.successPlanRow}>
                <Text style={[styles.successPlanLabel, { color: colors.textSecondary }]}>Active Tier</Text>
                <Text style={[styles.successPlanValue, { color: '#16A34A' }]}>{successPlanName}</Text>
              </View>
              <View style={styles.successPlanRow}>
                <Text style={[styles.successPlanLabel, { color: colors.textSecondary }]}>Validity Added</Text>
                <Text style={[styles.successPlanValue, { color: colors.text }]}>{successPlanDuration}</Text>
              </View>
              <View style={styles.successPlanRow}>
                <Text style={[styles.successPlanLabel, { color: colors.textSecondary }]}>Capacity</Text>
                <Text style={[styles.successPlanValue, { color: colors.text }]}>All perks unlocked & ready</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.successActionBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowSuccessModal(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.successActionBtnText}>Awesome, Let's Go!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 👑 IN-APP ACTIVE PREMIUM RESTRICTION MODAL (Fix for Pic 1) */}
      <Modal
        visible={showActivePremiumModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowActivePremiumModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.infoNoticeModalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.infoNoticeIconWrap, { backgroundColor: '#FFF8E1' }]}>
              <FontAwesome5 name="crown" size={28} color="#F59E0B" />
            </View>

            <Text style={[styles.infoNoticeTitle, { color: colors.text }]}>Active Premium Account</Text>

            <Text style={[styles.infoNoticeBody, { color: colors.textSecondary }]}>
              You already have an active <Text style={{ fontWeight: '700', color: '#D97706' }}>Premium Account</Text> with unlimited farms and chickens until{' '}
              <Text style={{ fontWeight: '700', color: colors.text }}>
                {subData?.end_date ? new Date(subData.end_date).toLocaleDateString() : 'the end of your billing cycle'}
              </Text>.
              {'\n\n'}
              You cannot downgrade to Pro while Premium is active. You can extend your Premium plan anytime.
            </Text>

            <TouchableOpacity
              style={[styles.infoNoticeActionBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowActivePremiumModal(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.infoNoticeActionBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ⚠️ IN-APP PAYMENT NOTICE MODAL (Fix for Pic 2) */}
      <Modal
        visible={paymentNoticeModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setPaymentNoticeModal((prev) => ({ ...prev, visible: false }))}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.infoNoticeModalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View
              style={[
                styles.infoNoticeIconWrap,
                {
                  backgroundColor:
                    paymentNoticeModal.type === 'error' ? '#FFEBEE' : '#FFF8E1',
                },
              ]}
            >
              <Ionicons
                name={paymentNoticeModal.type === 'error' ? 'alert-circle' : 'time-outline'}
                size={32}
                color={paymentNoticeModal.type === 'error' ? '#EF4444' : '#F59E0B'}
              />
            </View>

            <Text style={[styles.infoNoticeTitle, { color: colors.text }]}>
              {paymentNoticeModal.title || 'Payment Incomplete'}
            </Text>

            <Text style={[styles.infoNoticeBody, { color: colors.textSecondary }]}>
              {paymentNoticeModal.message}
            </Text>

            <TouchableOpacity
              style={[styles.infoNoticeActionBtn, { backgroundColor: colors.primary }]}
              onPress={() => setPaymentNoticeModal((prev) => ({ ...prev, visible: false }))}
              activeOpacity={0.85}
            >
              <Text style={styles.infoNoticeActionBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 🔄 FORMAL REFUND REQUEST MODAL */}
      <Modal
        visible={showRefundModal}
        transparent
        animationType="fade"
        onRequestClose={() => !submittingRefund && setShowRefundModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.refundModalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIconWrap, { backgroundColor: '#FEE2E2' }]}>
                <MaterialCommunityIcons name="cash-refund" size={26} color="#DC2626" />
              </View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Request Subscription Refund</Text>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                Submit a formal refund request to the Clucko administration.
              </Text>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.text, marginTop: 14 }]}>Select Reason:</Text>
            <View style={styles.reasonRadioGroup}>
              {['Accidental Purchase', 'Plan Not Needed / Downsizing', 'Features Not Working as Expected', 'Financial / Budget Reason', 'Other Reason'].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.reasonRadioItem,
                    { borderColor: refundReason === r ? colors.primary : colors.border },
                    refundReason === r && { backgroundColor: isDarkMode ? '#1E293B' : '#F0FDF4' }
                  ]}
                  onPress={() => setRefundReason(r)}
                >
                  <Ionicons
                    name={refundReason === r ? 'radio-button-on' : 'radio-button-off'}
                    size={17}
                    color={refundReason === r ? colors.primary : colors.textSecondary}
                  />
                  <Text style={[styles.reasonRadioText, { color: colors.text }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.text, marginTop: 10 }]}>Explanation / Details (Optional):</Text>
            <TextInput
              style={[
                styles.refundTextInput,
                {
                  backgroundColor: isDarkMode ? '#1E293B' : '#F8FAFC',
                  color: colors.text,
                  borderColor: colors.border
                }
              ]}
              placeholder="Tell us what happened so we can assist..."
              placeholderTextColor={colors.textLight}
              multiline
              numberOfLines={3}
              value={refundDetails}
              onChangeText={setRefundDetails}
            />

            <View style={styles.refundTermsNote}>
              <Ionicons name="information-circle-outline" size={15} color={colors.textSecondary} />
              <Text style={[styles.refundTermsText, { color: colors.textSecondary }]}>
                Upon admin review and approval, ₱{Number(subData?.price_paid || planAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })} will be refunded, and your account will transition to the Standard Free tier.
              </Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: '#DC2626' }]}
                disabled={submittingRefund}
                onPress={handleExecuteRefundRequest}
                activeOpacity={0.85}
              >
                {submittingRefund ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmBtnText}>Submit Refund Request</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCancelBtn}
                disabled={submittingRefund}
                onPress={() => setShowRefundModal(false)}
              >
                <Text style={[styles.modalCancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: 6,
    marginRight: 8,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  refreshBtn: {
    padding: 6,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  caretakerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
  },
  caretakerText: {
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
    lineHeight: 18,
  },
  graceBanner: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 14,
  },
  graceGradient: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
  },
  graceTextContainer: {
    marginLeft: 10,
    flex: 1,
  },
  graceTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  graceSubtitle: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  expiredBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
  },
  expiredTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  expiredText: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  currentPlanCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  currentPlanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  planBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  planIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  currentPlanName: {
    fontSize: 17,
    fontWeight: '800',
  },
  currentPlanDuration: {
    fontSize: 12,
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  planPerksList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150,150,150,0.2)',
    paddingTop: 12,
    gap: 8,
  },
  planPerkItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  planPerkLabel: {
    fontSize: 13,
  },
  planPerkValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  guaranteeCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
  },
  guaranteeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  guaranteeTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
  },
  guaranteeBody: {
    fontSize: 12,
    lineHeight: 18,
  },
  sectionHeaderWrap: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  planCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  planCardTop: {
    gap: 6,
  },
  planBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  popularBadge: {
    backgroundColor: '#EAF2EC',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  popularBadgeText: {
    color: '#2D5541',
    fontSize: 10,
    fontWeight: '700',
  },
  bestValueBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  bestValueText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  planTitlePriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planTitleCol: {
    flex: 1,
    marginRight: 10,
  },
  planCardTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  planCardPeriod: {
    fontSize: 12,
    marginTop: 2,
  },
  priceTagWrap: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 84,
  },
  priceTagAmount: {
    fontSize: 22,
    fontWeight: '800',
  },
  priceTagInterval: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  featuresList: {
    gap: 8,
    marginBottom: 14,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  radioButton: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  radioLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  gcashCard: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 16,
  },
  gcashHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  gcashBadgeWrap: {
    backgroundColor: '#005CE6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  gcashBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  gcashCardTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  gcashCardDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  ctaButtonWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#005CE6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  ctaGradient: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gcashIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  trialNoticeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  trialNoticeText: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    flex: 1,
  },
  legalFooterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 16,
  },
  legalFooterLink: {
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    elevation: 8,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  modalIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 17,
  },
  breakdownBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  breakdownLabel: {
    fontSize: 13,
  },
  breakdownValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  gcashMiniBadge: {
    backgroundColor: '#005CE6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  gcashMiniText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  breakdownDivider: {
    height: 1,
    marginVertical: 8,
  },
  breakdownTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
  breakdownTotalAmount: {
    fontSize: 18,
    fontWeight: '900',
  },
  termsNoticeWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 18,
  },
  termsNoticeText: {
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },
  modalActions: {
    gap: 8,
  },
  modalConfirmBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  reopenBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  reopenBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalCancelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  waitingCard: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 18,
  },
  waitingText: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  waitingSubtext: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
  // Success Modal Styles
  successModalCard: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    elevation: 10,
  },
  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    elevation: 4,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  successSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  successPlanDetails: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
    gap: 8,
  },
  successPlanRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  successPlanLabel: {
    fontSize: 13,
  },
  successPlanValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  successActionBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successActionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  // In-App Notice Modal Styles (Fix for Pic 1 & Pic 2)
  infoNoticeModalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  infoNoticeIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoNoticeTitle: {
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  infoNoticeBody: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 22,
  },
  infoNoticeActionBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoNoticeActionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  // Caretaker Specific Card Styles
  caretakerCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
  },
  caretakerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  caretakerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  caretakerCardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  caretakerCardSubtitle: {
    fontSize: 12.5,
    marginTop: 2,
  },
  caretakerCardBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  // In-App Persistent Pricing Notice Banner
  pricingNoticeBanner: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
    flexDirection: 'column',
    gap: 10,
  },
  pricingNoticeTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  pricingNoticeBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  pricingNoticeDismiss: {
    alignSelf: 'flex-end',
    backgroundColor: '#D97706',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  pricingNoticeDismissText: {
    color: '#fff',
    fontSize: 11.5,
    fontWeight: '700',
  },
  cardStackWrapper: {
    position: 'relative',
    marginBottom: 16,
    paddingTop: 8,
  },
  cardStackLayer2: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    height: '100%',
    borderRadius: 16,
    borderWidth: 1,
    opacity: 0.5,
  },
  cardStackLayer1: {
    position: 'absolute',
    top: 4,
    left: 6,
    right: 6,
    height: '100%',
    borderRadius: 16,
    borderWidth: 1,
    opacity: 0.8,
  },
  cardStackMain: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    gap: 6,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
  },
  cardStackHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  cardStackBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cardStackBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cardStackNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardStackNavBtn: {
    padding: 3,
  },
  cardStackCounter: {
    fontSize: 11,
    fontWeight: '700',
  },
  persistentPricingBanner: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 16,
  },
  persistentPricingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  persistentPricingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  persistentPricingBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  dynamicPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dynamicPillText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  persistentPricingFootnote: {
    fontSize: 10.5,
    fontStyle: 'italic',
    marginTop: 6,
    lineHeight: 14,
  },
  // In-Card Refund Trigger & Status
  refundStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  refundRequestTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  refundRequestTriggerText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  // Refund Modal Card
  refundModalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 6,
  },
  reasonRadioGroup: {
    gap: 6,
  },
  reasonRadioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  reasonRadioText: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  refundTextInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    textAlignVertical: 'top',
    minHeight: 70,
  },
  refundTermsNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 10,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
  },
  refundTermsText: {
    fontSize: 11,
    lineHeight: 15,
    flex: 1,
  },
  // Pending GCash Payment Auto-Recovery Styles
  pendingRecoveryBanner: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  pendingRecoveryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingRecoveryTitle: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  pendingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  pendingRecoveryBody: {
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 12,
  },
  pendingActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  pendingVerifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  pendingVerifyBtnText: {
    color: '#fff',
    fontSize: 12.5,
    fontWeight: '700',
  },
  pendingResumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  pendingResumeBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pendingCancelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  pendingCancelBtnText: {
    fontSize: 12,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});

