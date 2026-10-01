import { useDarkMode } from '@/context/DarkModeContext';
import { useNotifications } from '@/context/NotificationContext';
import { getHealthStatus, getStatusColor } from '@/utils/birdStatus';
import { loadChickensForCurrentUser } from '@/utils/chickenStorage';
import { Farm, getFarmName, loadFarms } from '@/utils/farms';
import { checkIsGuestMode, GUEST_SAMPLE_CHICKENS } from '@/utils/guestMode';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from "expo-router/react-navigation";
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ChickenAvatar from '../../components/ui/ChickenAvatar';
import ChickenIcon from '../../components/ui/ChickenIcon';
import DisclaimerModal from '../../components/ui/DisclaimerModal';
import ExitGuestConfirmModal from '../../components/ui/ExitGuestConfirmModal';
import FarmIcon from '../../components/ui/FarmIcon';
import GuestBlockModal from '../../components/ui/GuestBlockModal';
import ImageQualityGuide from '../../components/ui/ImageQualityGuide';
import NotificationsListModal from '../../components/ui/NotificationsListModal';
import WelcomeModal from '../../components/ui/WelcomeModal';
import FarmOnboardingModal from '../../components/ui/FarmOnboardingModal';
import { apiGetProfile, apiGetActivities, apiGetMyPlan } from '../../lib/api';
import { formatDateKey, getRelativeDateLabel, getUpcomingTasks, loadTasks, Task, toggleTaskComplete } from '../../utils/tasks';

const { width: screenWidth } = Dimensions.get('window');
const FEATURED_CARD_WIDTH = screenWidth - 32;

// 5 curated stock photography images for the Scan & Detect background slideshow:
// 1. Aerial drone view of hundreds of aligned gamefowl pens and cordons across green pastures
// 2. Athletic gamefowl roosters sparring in action on a lush farm
// 3. Breathtaking scenic sunrise over a rural poultry farm with rolling green hills
// 4. Majestic Philippine gamefowl rooster perched proudly on a wooden post
// 5. Clean cordoned teepees and feeding stations across a manicured farm lawn
const SLIDESHOW_IMAGES = [
  require('../../assets/images/slide_aerial_pens.jpg'),
  require('../../assets/images/slide_sparring.jpg'),
  require('../../assets/images/slide_farm_golden_hour.jpg'),
  require('../../assets/images/slide_rooster_post.jpg'),
  require('../../assets/images/slide_cordon_pens.jpg'),
];

// NOTE: the bundled CK-00X sample images and the imageKey->birdImages map
// have been removed. A chicken's card image now comes exclusively from
// its own uploaded `photo` field (set via AddChickenModal / the chicken
// profile screen). No chicken ever falls back to the app logo — a bird
// with no uploaded photo shows a neutral kiwi-bird placeholder instead
// (see ChickenAvatar / featuredImagePlaceholder below).

const SEARCH_STATUS_OPTIONS = [
  { key: 'All', label: 'All Statuses', icon: 'apps-outline' as const, tint: null as string | null },
  { key: 'Healthy', label: 'Healthy', icon: 'checkmark-circle-outline' as const, tint: '#4CAF50' },
  { key: 'Warning', label: 'Warning', icon: 'alert-circle-outline' as const, tint: '#FF9800' },
  { key: 'Critical', label: 'Critical', icon: 'warning-outline' as const, tint: '#f44336' },
];

// Content shown in the "Disease Detection Guide" modal, opened from the
// "What Clucko Detects" banner on Home.
const DETECTED_DISEASES = [
  {
    name: 'Infectious Coryza',
    symptoms: 'Watery eyes • Facial swelling • Nasal discharge',
    icon: 'water' as const,
    iconColor: '#FB8C00',
    iconBg: '#FFE0B2',
    cardBg: '#FFF3E0',
  },
  {
    name: 'Fowl Pox',
    symptoms: 'Lesions on comb • Scabs on skin • Difficulty eating',
    icon: 'help-circle' as const,
    iconColor: '#AD1457',
    iconBg: '#F3D4DA',
    cardBg: '#FCE9EC',
  },
  {
    name: 'Newcastle Disease',
    symptoms: 'Wing droop • Twisted neck • Respiratory distress',
    icon: 'warning' as const,
    iconColor: '#7B1FA2',
    iconBg: '#E1D4F7',
    cardBg: '#F2EAFB',
  },
];

const NOT_DETECTED_LIST = [
  'Internal organ infections',
  'Respiratory sounds/breathing issues',
  'Footpad problems',
  'Digestive system disorders',
  'Bone-borne diseases',
];

export default function HomeScreen() {
  const { mode } = useLocalSearchParams();
  const { colors, isDarkMode } = useDarkMode();

  const {
    notifications,
    unreadCount,
    notify,
    markAsRead,
    markAllAsRead,
    clearAllNotifications,
    deleteNotification,
    showDetail,
  } = useNotifications();

  const [showNotifications, setShowNotifications] = useState(false);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [isGuestMode, setIsGuestMode] = useState(mode === 'guest');
  const [userName, setUserName] = useState('Guest User');
  const [userRole, setUserRole] = useState<'owner' | 'caretaker'>('owner');
  const [activeFilter, setActiveFilter] = useState('All');
  const [allChickens, setAllChickens] = useState<any[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [upcomingTasks, setUpcomingTasks] = useState<Task[]>([]);
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<any>(null);

  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [acceptedDisclaimer, setAcceptedDisclaimer] = useState(false);
  const [showQualityGuide, setShowQualityGuide] = useState(false);
  const [scanType] = useState<'head' | 'wing' | 'full'>('full');
  const [showDiseaseGuide, setShowDiseaseGuide] = useState(false);

  const [guestModalVisible, setGuestModalVisible] = useState(false);
  const [guestFeature, setGuestFeature] = useState('this feature');

  const [showExitGuestModal, setShowExitGuestModal] = useState(false);

  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [welcomeName, setWelcomeName] = useState('there');

  const [showFarmOnboarding, setShowFarmOnboarding] = useState(false);
  const farmOnboardingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Pull-to-refresh ---
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        loadUserName(),
        loadChickens(),
        loadFarms().then((f) => {
          setFarms(f);
          if (f.length > 0) setShowFarmOnboarding(false);
        }),
        loadUpcomingTasks(),
        loadRecentActivities(),
        loadSubscription(),
      ]);
    } catch (e) {
      console.warn('Pull to refresh error:', e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Android hardware back press handler: double-tap to exit Clucko
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;

      let backPressCount = 0;
      const onBackPress = () => {
        if (backPressCount === 0) {
          backPressCount += 1;
          ToastAndroid.show('Press back again to exit Clucko', ToastAndroid.SHORT);
          setTimeout(() => {
            backPressCount = 0;
          }, 2000);
          return true;
        } else {
          BackHandler.exitApp();
          return true;
        }
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [])
  );

  // --- Flock search (live, on Home) ---
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchStatusFilter, setSearchStatusFilter] = useState('All');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  const featuredListRef = useRef<FlatList>(null);
  const [slideA, setSlideA] = useState(SLIDESHOW_IMAGES[0]);
  const [slideB, setSlideB] = useState(SLIDESHOW_IMAGES[1]);
  const slideIndexRef = useRef(0);
  const activeBufferRef = useRef<'A' | 'B'>('A');
  const fadeAnim = useRef(new Animated.Value(0)).current; // 0 = A is 100%, 1 = B is 100%
  const [isUserDraggingFeatured, setIsUserDraggingFeatured] = useState(false);

  // Seamless ping-pong buffer cross-fade transition every 4.5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      const nextIndex = (slideIndexRef.current + 1) % SLIDESHOW_IMAGES.length;
      slideIndexRef.current = nextIndex;

      if (activeBufferRef.current === 'A') {
        // Transition from A to B (fadeAnim 0 -> 1)
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) {
            activeBufferRef.current = 'B';
            // While B is fully visible and A is completely invisible (opacity 0),
            // prepare A with the picture that will follow after B!
            const afterNext = (nextIndex + 1) % SLIDESHOW_IMAGES.length;
            setSlideA(SLIDESHOW_IMAGES[afterNext]);
          }
        });
      } else {
        // Transition from B to A (fadeAnim 1 -> 0)
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) {
            activeBufferRef.current = 'A';
            // While A is fully visible and B is completely invisible (opacity 0),
            // prepare B with the picture that will follow after A!
            const afterNext = (nextIndex + 1) % SLIDESHOW_IMAGES.length;
            setSlideB(SLIDESHOW_IMAGES[afterNext]);
          }
        });
      }
    }, 4500);

    return () => clearInterval(timer);
  }, []);

  const guestAlert = (featureLabel: string = 'this feature') => {
    setGuestFeature(featureLabel);
    setGuestModalVisible(true);
  };

  const loadSubscription = async () => {
    try {
      const res = await apiGetMyPlan();
      if (res && res.subscription) {
        setSubscription(res.subscription);
      }
    } catch (err) {
      console.warn('Could not load plan on home:', err);
    }
  };

  const checkFarmOnboarding = async () => {
    try {
      const guest = await checkIsGuestMode();
      if (guest) return;

      const role = await AsyncStorage.getItem('userRole');
      const userDataStr = await AsyncStorage.getItem('userData');
      let isOwner = true;
      if (role && role.toLowerCase() === 'caretaker') isOwner = false;
      if (userDataStr) {
        try {
          const parsed = JSON.parse(userDataStr);
          if (parsed.role && parsed.role.toLowerCase() === 'caretaker') isOwner = false;
        } catch (_) { }
      }
      if (!isOwner) return;

      const currentFarms = await loadFarms();
      if (currentFarms.length === 0) {
        if (farmOnboardingTimerRef.current) {
          clearTimeout(farmOnboardingTimerRef.current);
        }
        // Exactly 3 seconds after login / landing on home with 0 farms
        farmOnboardingTimerRef.current = setTimeout(() => {
          setShowFarmOnboarding(true);
        }, 3000);
      } else {
        setShowFarmOnboarding(false);
      }
    } catch (err) {
      console.error('Error checking farm onboarding:', err);
    }
  };

  const handleStartCreateFarm = () => {
    setShowFarmOnboarding(false);
    router.push({ pathname: '/farm', params: { autoAdd: '1' } });
  };

  useEffect(() => {
    syncGuestMode();
    loadUserName();
    loadChickens();
    loadFarms().then((f) => {
      setFarms(f);
      if (f.length > 0) setShowFarmOnboarding(false);
    });
    loadUpcomingTasks();
    loadSubscription();
    checkDisclaimerStatus();
    checkLoginWelcome();
    checkFarmOnboarding();

    return () => {
      if (farmOnboardingTimerRef.current) {
        clearTimeout(farmOnboardingTimerRef.current);
      }
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadUserName();
      loadChickens();
      loadFarms().then((f) => {
        setFarms(f);
        if (f.length > 0) {
          setShowFarmOnboarding(false);
        } else {
          checkFarmOnboarding();
        }
      });
      loadUpcomingTasks();
      loadRecentActivities();
      loadSubscription();
      checkLoginWelcome();
      AsyncStorage.removeItem('active_chicken_profile_id');
    }, [])
  );

  const loadRecentActivities = async () => {
    try {
      const acts = await apiGetActivities();
      if (Array.isArray(acts)) {
        setRecentActivities(acts);
      }
    } catch (e) {
      console.error('Error loading recent activities:', e);
    }
  };

  const loadUpcomingTasks = async () => {
    try {
      const allTasks = await loadTasks();
      const todayKey = formatDateKey(new Date());
      // On Home, display ONLY open / pending tasks (completed tasks belong strictly in Done Tasks)
      const activeTasks = allTasks
        .filter((t) => !t.completed && t.date >= todayKey)
        .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
      setUpcomingTasks(activeTasks.slice(0, 4));
    } catch (error) {
      console.error('Error loading upcoming tasks:', error);
    }
  };

  const handleCompleteTask = async (task: Task) => {
    if (isGuestMode) {
      guestAlert('completing tasks');
      return;
    }
    if (togglingTaskId === task.id) return; // Prevent double clicking
    setTogglingTaskId(task.id);
    try {
      await toggleTaskComplete(task.id);
      // Backend automatically records the completion notification in the database.
      // Refresh task list so completed task immediately moves off the homepage
      await loadUpcomingTasks();
    } catch (err) {
      console.error('Error completing task on home:', err);
    } finally {
      setTogglingTaskId(null);
    }
  };

  const syncGuestMode = async () => {
    try {
      if (mode === 'guest') {
        await AsyncStorage.setItem('isGuestMode', 'true');
        setIsGuestMode(true);
        guestAlert('full account features');
      } else {
        const guest = await checkIsGuestMode();
        setIsGuestMode(guest);
      }
    } catch (error) {
      console.error('Error syncing guest mode:', error);
    }
  };

  const checkDisclaimerStatus = async () => {
    try {
      const accepted = await AsyncStorage.getItem('disclaimer_accepted');
      if (accepted === 'true') {
        setAcceptedDisclaimer(true);
      }
    } catch (error) {
      console.error('Error checking disclaimer status:', error);
    }
  };

  const handleDisclaimerDismiss = async () => {
    setShowDisclaimer(false);
    setAcceptedDisclaimer(true);
    try {
      await AsyncStorage.setItem('disclaimer_accepted', 'true');
    } catch (error) {
      console.error('Error saving disclaimer status:', error);
    }
  };

  // Shows Welcome Modal only when a new account logs in for the first time.
  const checkLoginWelcome = async () => {
    try {
      const pending = await AsyncStorage.getItem('pending_welcome_login');
      if (pending === 'true') {
        await AsyncStorage.removeItem('pending_welcome_login');

        const guest = await checkIsGuestMode();
        if (guest) {
          setWelcomeName('Guest');
          setShowWelcomeModal(true);
        } else {
          const userId = await AsyncStorage.getItem('user_id');
          if (userId) {
            const hasSeen = await AsyncStorage.getItem(`has_seen_welcome_${userId}`);
            if (hasSeen === 'true') {
              return; // Already seen welcome modal, do not show again
            }
          }
          let displayName = '';
          const storedName = await AsyncStorage.getItem('userName');
          if (storedName && storedName.trim() && storedName.toLowerCase() !== 'user') {
            displayName = storedName.trim();
          } else {
            const userData = await AsyncStorage.getItem('userData');
            if (userData) {
              const parsed = JSON.parse(userData);
              displayName = `${parsed.first_name || ''} ${parsed.last_name || ''}`.trim() || parsed.first_name || '';
            }
          }
          setWelcomeName(displayName || 'there');
          setShowWelcomeModal(true);
        }
      }
    } catch (error) {
      console.error('Error checking login welcome:', error);
    }
  };

  const handleCloseWelcomeModal = async () => {
    setShowWelcomeModal(false);

    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (userId) {
        await AsyncStorage.setItem(`has_seen_welcome_${userId}`, 'true');
      }
    } catch (error) {
      console.error('Error saving has_seen_welcome:', error);
    }

    // After Welcome Modal is dismissed via "Get Started", check if the user
    // has ever seen/accepted the Medical Disclaimer. If not, show it now!
    try {
      const accepted = await AsyncStorage.getItem('disclaimer_accepted');
      if (accepted !== 'true') {
        setTimeout(() => {
          setShowDisclaimer(true);
        }, 250);
      }
    } catch (error) {
      console.error('Error checking disclaimer status on welcome close:', error);
    }
  };

  const loadChickens = async () => {
    try {
      const guest = await checkIsGuestMode();
      if (guest) {
        setAllChickens(GUEST_SAMPLE_CHICKENS);
        return;
      }

      const chickensData = await loadChickensForCurrentUser();
      if (chickensData) {
        setAllChickens(chickensData);
      } else {
        setAllChickens([
          { id: '1', name: 'Rocky', idNumber: 'CK-001', status: 'Possible Infectious Coryza', statusColor: '#FF9800', timeAgo: '2 mins ago', farmId: null, healthStatus: 'Warning', photo: null },
          { id: '2', name: 'Thunder', idNumber: 'CK-002', status: 'Healthy', statusColor: '#4CAF50', timeAgo: '1 day ago', farmId: null, healthStatus: 'Healthy', photo: null },
          { id: '3', name: 'Lightning', idNumber: 'CK-003', status: 'Under Observation', statusColor: '#f44336', timeAgo: '3 hours ago', farmId: null, healthStatus: 'Critical', photo: null },
          { id: '4', name: 'Eagle', idNumber: 'CK-004', status: 'Healthy', statusColor: '#4CAF50', timeAgo: '2 days ago', farmId: null, healthStatus: 'Healthy', photo: null },
          { id: '5', name: 'Falcon', idNumber: 'CK-005', status: 'Possible Infectious Coryza', statusColor: '#FF9800', timeAgo: '30 mins ago', farmId: null, healthStatus: 'Warning', photo: null },
          { id: '6', name: 'Hawk', idNumber: 'CK-006', status: 'Under Observation', statusColor: '#f44336', timeAgo: '5 hours ago', farmId: null, healthStatus: 'Critical', photo: null },
        ]);
      }
    } catch (error) {
      console.error('Error loading chickens:', error);
    }
  };

  const loadUserName = async () => {
    try {
      const guest = await checkIsGuestMode();
      if (guest) {
        setUserName('User');
        setUserRole('owner');
        return;
      }

      const stripUserSuffix = (name: string) => {
        if (!name) return '';
        const trimmed = name.trim();
        // Remove trailing " User" if it was erroneously appended
        return trimmed.replace(/\s+user$/i, '').trim() || trimmed;
      };

      const role = await AsyncStorage.getItem('user_role');
      if (role) {
        setUserRole(role.toLowerCase() === 'caretaker' ? 'caretaker' : 'owner');
      }

      // 1. Stored name from login/signup
      const storedName = await AsyncStorage.getItem('userName');
      if (storedName && storedName.trim()) {
        const cleaned = stripUserSuffix(storedName);
        if (cleaned && cleaned.toLowerCase() !== 'user') {
          setUserName(cleaned);
          return;
        }
      }

      // 2. Saved userData JSON
      const userData = await AsyncStorage.getItem('userData');
      if (userData) {
        const parsed = JSON.parse(userData);
        const rawFirst = parsed.first_name || '';
        const rawLast = (parsed.last_name || '').toLowerCase() === 'user' ? '' : (parsed.last_name || '');
        const combined = stripUserSuffix(`${rawFirst} ${rawLast}`.trim());
        if (combined && combined.toLowerCase() !== 'user') {
          setUserName(combined);
          await AsyncStorage.setItem('userName', combined);
          return;
        }
        if (parsed.name && parsed.name.toLowerCase() !== 'user') {
          const cleanedName = stripUserSuffix(parsed.name);
          setUserName(cleanedName);
          return;
        }
        if (parsed.fullName && parsed.fullName.toLowerCase() !== 'user') {
          const cleanedFullName = stripUserSuffix(parsed.fullName);
          setUserName(cleanedFullName);
          return;
        }
      }

      // 3. Fallback: fetch profile from backend
      try {
        const profileData = await apiGetProfile();
        const rawFirst = profileData?.first_name || '';
        const rawLast = (profileData?.last_name || '').toLowerCase() === 'user' ? '' : (profileData?.last_name || '');
        const pName = stripUserSuffix(`${rawFirst} ${rawLast}`.trim());
        if (pName) {
          setUserName(pName);
          await AsyncStorage.setItem('userName', pName);
          return;
        }
      } catch {
        // Backend unavailable
      }

      setUserName('User');
    } catch (error) {
      console.error('Error loading user name:', error);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const getFilteredBirds = () => {
    if (activeFilter === 'All') return allChickens;
    return allChickens.filter((c) => getHealthStatus(c) === activeFilter);
  };

  const handleScanNow = async () => {
    if (isGuestMode) {
      guestAlert('Scan & Detect');
      return;
    }
    router.push('/(tabs)/capture');
  };

  const handleProceedToCamera = () => {
    setShowQualityGuide(false);
    router.push('/(tabs)/capture');
  };

  const handleBirdPress = (bird: any) => {
    router.push(`/chicken/${bird.id || bird.chickenId}`);
  };

  const handleHealthTrack = () => {
    router.push('/(tabs)/chickens');
  };

  const handleAvatarPress = () => {
    if (isGuestMode) {
      guestAlert('your Profile');
    } else {
      router.push('/(tabs)/profile');
    }
  };

  const handleExitGuestConfirm = async () => {
    try {
      await AsyncStorage.setItem('isGuestMode', 'false');
      await AsyncStorage.setItem('isLoggedIn', 'false');
      setShowExitGuestModal(false);
      router.replace('/login');
    } catch (error) {
      console.error('Error exiting guest mode:', error);
      setShowExitGuestModal(false);
      await notify({
        title: 'Exit Guest Failed',
        message: 'Could not exit guest mode. Please try again.',
        type: 'alert',
      });
    }
  };

  // --- Search handlers ---
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return allChickens
      .filter((bird) => {
        const matchesQuery =
          bird.name?.toLowerCase().includes(query) ||
          bird.idNumber?.toLowerCase().includes(query) ||
          getFarmName(farms, bird.farmId).toLowerCase().includes(query);
        const matchesStatus = searchStatusFilter === 'All' || getHealthStatus(bird) === searchStatusFilter;
        return matchesQuery && matchesStatus;
      })
      .slice(0, 6);
  }, [searchQuery, searchStatusFilter, allChickens, farms]);

  const showSearchDropdown = searchFocused && searchQuery.trim().length > 0;

  const handleSelectSearchResult = (bird: any) => {
    Keyboard.dismiss();
    setSearchQuery('');
    setSearchFocused(false);
    handleBirdPress(bird);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const handleToggleFilterMenu = () => {
    setFilterMenuOpen((prev) => !prev);
  };

  const handleSelectSearchStatus = (statusKey: string) => {
    setSearchStatusFilter(statusKey);
    setFilterMenuOpen(false);
  };

  const filterOptions = ['All', 'Healthy', 'Warning', 'Critical'];
  const filteredBirds = getFilteredBirds();
  const featuredBirds = filteredBirds.slice(0, 8);

  // Auto-scroll animation for horizontally scrollable featured chickens
  useEffect(() => {
    if (featuredBirds.length <= 1 || isUserDraggingFeatured) return;

    const interval = setInterval(() => {
      setFeaturedIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % featuredBirds.length;
        try {
          featuredListRef.current?.scrollToIndex({
            index: nextIndex,
            animated: true,
          });
        } catch {
          // Handled by onScrollToIndexFailed
        }
        return nextIndex;
      });
    }, 3800);

    return () => clearInterval(interval);
  }, [featuredBirds.length, isUserDraggingFeatured]);

  const healthyCount = allChickens.filter((c) => getHealthStatus(c) === 'Healthy').length;
  const warningCount = allChickens.filter((c) => getHealthStatus(c) === 'Warning').length;
  const criticalCount = allChickens.filter((c) => getHealthStatus(c) === 'Critical').length;

  const quickStats = [
    {
      key: 'all',
      label: 'Total',
      count: allChickens.length,
      icon: <ChickenIcon size={20} color={colors.primary} />,
      circleBg: colors.primary + '18',
      onPress: handleHealthTrack,
    },
    {
      key: 'Healthy',
      label: 'Healthy',
      count: healthyCount,
      icon: <Ionicons name="heart-outline" size={20} color="#4CAF50" />,
      circleBg: '#4CAF5018',
      onPress: () => setActiveFilter('Healthy'),
    },
    {
      key: 'Warning',
      label: 'Warning',
      count: warningCount,
      icon: <Ionicons name="alert-circle-outline" size={20} color="#FF9800" />,
      circleBg: '#FF980018',
      onPress: () => setActiveFilter('Warning'),
    },
    {
      key: 'Critical',
      label: 'Critical',
      count: criticalCount,
      icon: <Ionicons name="warning-outline" size={20} color="#f44336" />,
      circleBg: '#f4433618',
      onPress: () => setActiveFilter('Critical'),
    },
  ];

  const statusDotColor = (bird: { healthStatus?: string; status?: string }) => {
    const normalized = getHealthStatus(bird);
    if (normalized === 'Healthy') return '#4CAF50';
    if (normalized === 'Warning') return '#FF9800';
    if (normalized === 'Critical') return '#f44336';
    return colors.textLight;
  };

  // Status-driven message shown in the featured card's message box.
  const getStatusMessage = (bird: any) => {
    const normalized = getHealthStatus(bird);
    if (normalized === 'Warning') {
      return { icon: 'alert-circle' as const, color: '#FF9800', bg: '#FFF3E0', text: `AI detected mild symptoms in ${bird.name}. Keep monitoring closely.` };
    }
    if (normalized === 'Critical') {
      return { icon: 'warning' as const, color: '#f44336', bg: '#FFEBEE', text: `Urgent — ${bird.name} may need veterinary attention soon.` };
    }
    return { icon: 'shield-checkmark' as const, color: '#4CAF50', bg: 'rgba(76,175,80,0.10)', text: `Great job! ${bird.name} is in good health. Keep up the good care!` };
  };

  // Featured card — a top row of two pill badges ("Recent Scan" / health
  // status), a circular photo on the left with a status checkmark badge,
  // name + a Farm/Last Scan meta row on the right (the closest equivalents
  // this app's data model has), and a full-width status message box below.
  const renderFeaturedCard = ({ item }: any) => {
    const statusColor = getStatusColor(item);
    const statusLabel = getHealthStatus(item);
    const msg = getStatusMessage(item);

    return (
      <TouchableOpacity
        style={[styles.featuredCard, { backgroundColor: statusColor + '14' }]}
        activeOpacity={0.9}
        onPress={() => handleBirdPress(item)}
      >
        <View style={styles.featuredBadgeRow}>
          <View style={styles.featuredBadgeDark}>
            <Text style={styles.featuredBadgeDarkText}>Recent Capture</Text>
          </View>
          <View style={[styles.featuredBadgeStatus, { backgroundColor: statusColor }]}>
            <Ionicons name="heart" size={11} color="#fff" />
            <Text style={styles.featuredBadgeStatusText}>{statusLabel}</Text>
          </View>
        </View>

        <View style={styles.featuredMainRow}>
          <View style={styles.featuredPhotoWrap}>
            <View style={[styles.featuredPhotoRing, { borderColor: colors.card }]}>
              <ChickenAvatar photo={item.photo} size={92} />
            </View>
            <View style={[styles.featuredCheckBadge, { backgroundColor: statusColor, borderColor: colors.card }]}>
              <Ionicons name={statusLabel === 'Healthy' ? 'checkmark' : statusLabel === 'Warning' ? 'alert' : 'warning'} size={12} color="#fff" />
            </View>
          </View>

          <View style={styles.featuredInfo}>
            <Text style={[styles.featuredName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>

            <View style={styles.featuredMetaRow}>
              <View style={styles.featuredMetaItem}>
                <FarmIcon size={14} color={colors.textLight} />
                <View>
                  <Text style={[styles.featuredMetaLabel, { color: colors.textLight }]}>Farm</Text>
                  <Text style={[styles.featuredMetaValue, { color: colors.text }]} numberOfLines={1}>
                    {getFarmName(farms, item.farmId)}
                  </Text>
                </View>
              </View>
              <View style={styles.featuredMetaItem}>
                <Ionicons name="calendar-outline" size={13} color={colors.textLight} />
                <View>
                  <Text style={[styles.featuredMetaLabel, { color: colors.textLight }]}>Last Capture</Text>
                  <Text style={[styles.featuredMetaValue, { color: colors.text }]} numberOfLines={1}>
                    {item.lastScan || item.timeAgo || '—'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
        </View>

        <View style={[styles.featuredMessageBox, { backgroundColor: colors.card }]}>
          <Ionicons name={msg.icon} size={18} color={msg.color} />
          <Text style={[styles.featuredMessageText, { color: colors.textSecondary }]}>{msg.text}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderTaskItem = ({ item }: { item: Task }) => (
    <TouchableOpacity
      style={[styles.taskCard, { backgroundColor: colors.card }]}
      activeOpacity={0.85}
      onPress={() => router.push({ pathname: '/tasks', params: { date: item.date } })}
    >
      <View style={[styles.taskIcon, { backgroundColor: item.completed ? '#4CAF5020' : (item.color || colors.primary) + '20' }]}>
        <Ionicons name={(item.icon as any) || 'checkbox-outline'} size={20} color={item.completed ? '#4CAF50' : (item.color || colors.primary)} />
      </View>
      <View style={styles.taskContent}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text
            style={[
              styles.taskTitle,
              { color: item.completed ? colors.textLight : colors.text },
              item.completed && { textDecorationLine: 'line-through' },
            ]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          {item.completed && (
            <View style={{ backgroundColor: '#4CAF5018', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
              <Text style={{ color: '#4CAF50', fontSize: 10, fontWeight: '800' }}>DONE</Text>
            </View>
          )}
          {item.farm_name && (
            <View style={[styles.taskHomeFarmBadge, { backgroundColor: colors.primary + '18' }]}>
              <FarmIcon size={11} color={colors.primary} />
              <Text style={[styles.taskHomeFarmText, { color: colors.primary }]}>{item.farm_name}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.taskDate, { color: colors.textLight }]} numberOfLines={1}>
          {[
            getRelativeDateLabel(item.date),
            item.time,
            item.assignee_name ? `Assigned: ${item.assignee_name}` : null
          ].filter(Boolean).join(' · ')}
        </Text>
        {item.completed && (
          <Text style={{ fontSize: 10, color: '#4CAF50', fontWeight: '600', marginTop: 2 }}>
            ✓ Done {item.completer_name ? `by ${item.completer_name}` : ''}
          </Text>
        )}
      </View>
      <TouchableOpacity
        style={[
          styles.taskAction,
          {
            backgroundColor: item.completed ? '#4CAF5018' : colors.primary + '18',
            opacity: togglingTaskId === item.id ? 0.6 : 1,
          },
        ]}
        onPress={() => handleCompleteTask(item)}
        disabled={togglingTaskId === item.id}
        activeOpacity={0.7}
      >
        <Text style={[styles.taskActionText, { color: item.completed ? '#4CAF50' : colors.primary }]}>
          {togglingTaskId === item.id ? 'Saving…' : item.completed ? 'Done ✓' : 'Complete'}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );



  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* ===================== Header ===================== */}
        <View style={styles.headerRow}>
          <View style={styles.headerGreetingCol}>
            <Text style={[styles.greeting, { color: colors.textLight }]}>{getGreeting()},</Text>
            <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
              {isGuestMode ? 'User' : userName}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.headerBellBtn, { backgroundColor: colors.card, borderColor: colors.divider }]}
            onPress={() => setShowNotifications(true)}
            activeOpacity={0.75}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
            {unreadCount > 0 && (
              <View style={styles.headerBellBadge}>
                <Text style={styles.headerBellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ===================== Subscription Banner / Status Pill ===================== */}
        {subscription?.is_in_grace_period ? (
          <TouchableOpacity
            style={styles.homeGraceBanner}
            onPress={() => router.push('/subscription')}
            activeOpacity={0.85}
          >
            <LinearGradient colors={['#FF9800', '#F57C00']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.homeGraceGradient}>
              <Ionicons name="warning" size={22} color="#fff" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.homeGraceTitle}>7-Day Grace Period Active!</Text>
                <Text style={styles.homeGraceSub}>
                  {subscription.grace_days_remaining} day(s) left. Tap to renew now and avoid downgrade.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        ) : subscription?.is_expired ? (
          <TouchableOpacity
            style={[styles.homePlanPill, { backgroundColor: '#FFEBEE', borderColor: '#FFCDD2' }]}
            onPress={() => router.push('/subscription')}
            activeOpacity={0.8}
          >
            <Ionicons name="alert-circle" size={16} color="#D32F2F" />
            <Text style={[styles.homePlanPillText, { color: '#C62828' }]}>
              Account on Free Tier • Tap to upgrade capacity
            </Text>
            <Ionicons name="chevron-forward" size={14} color="#D32F2F" />
          </TouchableOpacity>
        ) : subscription ? (
          <TouchableOpacity
            style={[
              styles.homePlanPill,
              {
                backgroundColor: subscription.plan === 'premium' ? (isDarkMode ? '#2D2415' : '#FEF3C7') : subscription.plan === 'pro' ? colors.badgeBackground : colors.card,
                borderColor: subscription.plan === 'premium' ? '#F59E0B' : subscription.plan === 'pro' ? colors.primary : colors.divider,
              },
            ]}
            onPress={() => router.push('/subscription')}
            activeOpacity={0.8}
          >
            <FontAwesome5
              name={subscription.plan === 'premium' ? 'crown' : subscription.plan === 'pro' ? 'award' : 'seedling'}
              size={13}
              color={subscription.plan === 'premium' ? '#D97706' : subscription.plan === 'pro' ? colors.primary : '#7C3AED'}
            />
            <Text style={[styles.homePlanPillText, { color: colors.text }]}>
              <Text style={{ fontWeight: '700' }}>{subscription.plan_name}</Text>
              {subscription.plan === 'free_trial' && ` • ${subscription.days_remaining}d left (${subscription.usage?.captures_remaining ?? (30 - (subscription.usage?.captures_count || 0))} scans left)`}
              {subscription.plan === 'pro' && ` • 2 Farms • Unlimited Scans`}
              {subscription.plan === 'premium' && ` • Unlimited All`}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textLight} />
          </TouchableOpacity>
        ) : null}

        {/* ===================== Search ===================== */}
        <View style={styles.searchWrap}>
          <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.divider }]}>
            <Ionicons name="search-outline" size={18} color={colors.textLight} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search your flock…"
              placeholderTextColor={colors.textLight}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={handleClearSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color={colors.textLight} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.searchFilterBtn, { backgroundColor: colors.primary }]}
              onPress={handleToggleFilterMenu}
              activeOpacity={0.85}
            >
              <Ionicons name="options-outline" size={17} color="#fff" />
              {searchStatusFilter !== 'All' && <View style={styles.searchFilterDot} />}
            </TouchableOpacity>
          </View>

          {filterMenuOpen && (
            <View style={[styles.filterMenu, { backgroundColor: colors.card, borderColor: colors.divider }]}>
              {SEARCH_STATUS_OPTIONS.map((option) => {
                const active = searchStatusFilter === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={styles.filterMenuRow}
                    onPress={() => handleSelectSearchStatus(option.key)}
                    activeOpacity={0.75}
                  >
                    <Ionicons name={option.icon} size={16} color={option.tint || colors.textSecondary} />
                    <Text style={[styles.filterMenuLabel, { color: colors.text }]}>{option.label}</Text>
                    {active && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {showSearchDropdown && (
            <View style={[styles.searchDropdown, { backgroundColor: colors.card, borderColor: colors.divider }]}>
              {searchResults.length > 0 ? (
                searchResults.map((bird) => (
                  <TouchableOpacity
                    key={bird.id}
                    style={[styles.searchResultRow, { borderBottomColor: colors.divider }]}
                    onPress={() => handleSelectSearchResult(bird)}
                    activeOpacity={0.75}
                  >
                    <ChickenAvatar photo={bird.photo} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.searchResultName, { color: colors.text }]} numberOfLines={1}>{bird.name}</Text>
                      <Text style={[styles.searchResultMeta, { color: colors.textLight }]} numberOfLines={1}>
                        {bird.idNumber} · {getFarmName(farms, bird.farmId)}
                      </Text>
                    </View>
                    <View style={[styles.searchResultDot, { backgroundColor: statusDotColor(bird) }]} />
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.searchEmptyRow}>
                  <Ionicons name="search-outline" size={16} color={colors.textLight} />
                  <Text style={[styles.searchEmptyText, { color: colors.textLight }]}>No birds match "{searchQuery}"</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {filterMenuOpen && (
          <TouchableWithoutFeedback onPress={() => setFilterMenuOpen(false)}>
            <View style={styles.filterMenuBackdrop} />
          </TouchableWithoutFeedback>
        )}

        {/* ===================== Promo banner — Scan & Detect (Hero Section) ===================== */}
        <TouchableOpacity style={styles.promoWrap} activeOpacity={0.9} onPress={handleScanNow}>
          <View style={styles.promoCardContainer}>
            {/* Seamless Buffer A Layer */}
            <Animated.Image
              source={slideA}
              style={[
                StyleSheet.absoluteFill,
                styles.promoBgImage,
                {
                  opacity: fadeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 0],
                  }),
                },
              ]}
              resizeMode="cover"
            />
            {/* Seamless Buffer B Layer */}
            <Animated.Image
              source={slideB}
              style={[
                StyleSheet.absoluteFill,
                styles.promoBgImage,
                {
                  opacity: fadeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 1],
                  }),
                },
              ]}
              resizeMode="cover"
            />
            {/* Subtle natural dark gradient for contrast without green cast or circles */}
            <LinearGradient
              colors={['rgba(0, 0, 0, 0.12)', 'rgba(0, 0, 0, 0.38)', 'rgba(0, 0, 0, 0.68)']}
              style={styles.promoCard}
            >
              <View style={styles.promoTextBlock}>
                <Text style={styles.promoTitle}>Scan & Detect</Text>
                <Text style={styles.promoSubtitle}>
                  Instant AI based health check{'\n'}right from your camera.
                </Text>
                <View style={styles.promoActionRow}>
                  <View style={[styles.promoButton, { backgroundColor: isDarkMode ? '#8FE0B0' : '#FFFFFF' }]}>
                    <Ionicons name="scan-outline" size={16} color={isDarkMode ? '#0E1210' : '#2D5541'} />
                    <Text style={[styles.promoButtonText, { color: isDarkMode ? '#0E1210' : '#2D5541' }]}>Scan Now</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.promoGuideChip}
                    onPress={(e) => {
                      e.stopPropagation();
                      setShowQualityGuide(true);
                    }}
                    activeOpacity={0.75}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="help-circle-outline" size={15} color="#C8E6C9" />
                    <Text style={styles.promoGuideChipText}>Guide</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.promoIconCircle}>
                <Ionicons name="camera-outline" size={38} color="rgba(255,255,255,0.92)" />
              </View>
            </LinearGradient>
          </View>
        </TouchableOpacity>

        {/* ===================== Quick stat tiles ===================== */}
        <View style={styles.statsRow}>
          {quickStats.map((stat) => (
            <TouchableOpacity
              key={stat.key}
              style={[styles.statCard, { backgroundColor: colors.card }]}
              onPress={stat.onPress}
              activeOpacity={0.8}
            >
              <View style={[styles.statIconCircle, { backgroundColor: stat.circleBg }]}>{stat.icon}</View>
              <Text style={[styles.statNumber, { color: colors.text }]}>{stat.count}</Text>
              <Text style={[styles.statLabel, { color: colors.textLight }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                {stat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ===================== "What Clucko Detects" info banner ===================== */}
        <TouchableOpacity
          style={[styles.infoBanner, { backgroundColor: isDarkMode ? '#0D2A44' : '#E3F2FD', borderColor: isDarkMode ? '#123A5C' : '#BBDEFB' }]}
          activeOpacity={0.8}
          onPress={() => setShowDiseaseGuide(true)}
        >
          <View style={[styles.infoBannerIconWrap, { backgroundColor: isDarkMode ? '#123A5C' : '#fff' }]}>
            <Ionicons name="scan-outline" size={18} color="#1E88E5" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoBannerTitle, { color: colors.text }]}>What Clucko Detects</Text>
            <Text style={[styles.infoBannerSubtitle, { color: colors.textSecondary }]}>Coryza • Fowl Pox • Newcastle Disease</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
        </TouchableOpacity>

        {/* ===================== Featured Gamefowl carousel ===================== */}
        <View style={styles.featuredSection}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Gamefowl</Text>
            <TouchableOpacity onPress={handleHealthTrack}>
              <Text style={[styles.viewAllText, { color: colors.primary }]}>See All →</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterChipsRow}
          >
            {filterOptions.map((filter) => {
              const active = activeFilter === filter;
              return (
                <TouchableOpacity
                  key={filter}
                  style={[
                    styles.filterChip,
                    active
                      ? { backgroundColor: colors.primary, borderColor: colors.primary }
                      : { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                  onPress={() => setActiveFilter(filter)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.filterChipText, { color: active ? '#fff' : colors.text }]}>{filter}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {featuredBirds.length > 0 ? (
            <>
              <FlatList
                ref={featuredListRef}
                data={featuredBirds}
                renderItem={renderFeaturedCard}
                keyExtractor={(item) => String(item.id || item.chickenId)}
                horizontal
                pagingEnabled={false}
                showsHorizontalScrollIndicator={false}
                snapToInterval={FEATURED_CARD_WIDTH + 14}
                snapToAlignment="start"
                decelerationRate="fast"
                contentContainerStyle={styles.featuredList}
                getItemLayout={(_, index) => ({
                  length: FEATURED_CARD_WIDTH + 14,
                  offset: (FEATURED_CARD_WIDTH + 14) * index,
                  index,
                })}
                onScrollBeginDrag={() => setIsUserDraggingFeatured(true)}
                onScrollEndDrag={() => setTimeout(() => setIsUserDraggingFeatured(false), 2000)}
                onMomentumScrollEnd={(e) => {
                  setIsUserDraggingFeatured(false);
                  const index = Math.round(e.nativeEvent.contentOffset.x / (FEATURED_CARD_WIDTH + 14));
                  setFeaturedIndex(Math.min(index, featuredBirds.length - 1));
                }}
                onScrollToIndexFailed={(info) => {
                  setTimeout(() => {
                    featuredListRef.current?.scrollToIndex({
                      index: info.index,
                      animated: true,
                    });
                  }, 150);
                }}
              />
              {featuredBirds.length > 1 && (
                <View style={styles.dotsRow}>
                  {featuredBirds.map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.dot,
                        { backgroundColor: i === featuredIndex ? colors.primary : colors.border },
                        i === featuredIndex && styles.dotActive,
                      ]}
                    />
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={[styles.emptyFeatured, { backgroundColor: colors.card }]}>
              <ChickenIcon size={30} color={colors.textLight} />
              <Text style={[styles.emptyFeaturedText, { color: colors.textSecondary }]}>No birds match this filter</Text>
            </View>
          )}
        </View>

        {/* ===================== Upcoming Tasks ===================== */}
        <View style={styles.tasksSection}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Upcoming Tasks</Text>
            <TouchableOpacity onPress={() => router.push('/tasks')}>
              <Text style={[styles.viewAllText, { color: colors.primary }]}>See All →</Text>
            </TouchableOpacity>
          </View>
          {upcomingTasks.length > 0 ? (
            <FlatList
              data={upcomingTasks}
              renderItem={renderTaskItem}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
            />
          ) : (
            <TouchableOpacity
              style={[styles.emptyTasksCard, { backgroundColor: colors.card }]}
              activeOpacity={0.85}
              onPress={() => router.push('/tasks')}
            >
              <Ionicons name="calendar-outline" size={26} color={colors.textLight} />
              <Text style={[styles.emptyTasksText, { color: colors.textSecondary }]}>
                {userRole === 'caretaker' ? 'No tasks assigned to you' : 'No upcoming tasks — tap to add one'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ===================== Recent Activity ===================== */}
        <View style={styles.activitySection}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Activity</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/chickens')}>
              <Text style={[styles.viewAllText, { color: colors.primary }]}>View All →</Text>
            </TouchableOpacity>
          </View>

          {recentActivities.length > 0 ? (
            <View style={[styles.activityCardWrap, { backgroundColor: colors.card, borderColor: colors.divider }]}>
              {recentActivities.slice(0, 5).map((act: any, idx: number) => {
                const isCrit = act.status === 'Critical';
                const isWarn = act.status === 'Warning';
                const tint = isCrit ? '#f44336' : isWarn ? '#FF9800' : '#4CAF50';
                const iconName = isCrit ? 'warning' : isWarn ? 'alert-circle' : 'checkmark-circle';

                const d = new Date(act.timestamp);
                const diffMs = Date.now() - d.getTime();
                const diffMin = Math.floor(diffMs / 60000);
                const timeLabel = diffMin < 1 ? 'Just now' : diffMin < 60 ? `${diffMin}m ago` : diffMin < 1440 ? `${Math.floor(diffMin / 60)}h ago` : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

                return (
                  <TouchableOpacity
                    key={act.id || idx}
                    style={[
                      styles.homeActivityRow,
                      { borderBottomColor: colors.divider },
                      idx === Math.min(recentActivities.length, 5) - 1 && { borderBottomWidth: 0 },
                    ]}
                    onPress={() => router.push(`/chicken/${act.chicken_id}`)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.homeActivityIcon, { backgroundColor: tint + '18' }]}>
                      <Ionicons name={iconName as any} size={16} color={tint} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.homeActivityTitle, { color: colors.text }]} numberOfLines={1}>
                        {act.condition} — {act.chicken_name}
                      </Text>
                      <Text style={[styles.homeActivitySub, { color: colors.textLight }]} numberOfLines={1}>
                        Captured by {act.captured_by_name} ({act.captured_by_role}) · {act.farm_name}
                      </Text>
                    </View>
                    <Text style={[styles.homeActivityTime, { color: colors.textLight }]}>{timeLabel}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={[styles.emptyTasksCard, { backgroundColor: colors.card }]}>
              <Ionicons name="pulse-outline" size={26} color={colors.textLight} />
              <Text style={[styles.emptyTasksText, { color: colors.textSecondary }]}>
                No scan activity yet — scan a bird to see real-time updates here.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {isGuestMode && (
        <TouchableOpacity
          style={styles.floatingExitButton}
          onPress={() => setShowExitGuestModal(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="exit-outline" size={18} color="#fff" />
          <Text style={styles.floatingExitText}>Exit Guest</Text>
        </TouchableOpacity>
      )}

      {/* Disease Detection Guide modal — opened from the "What Clucko
          Detects" banner. Purely informational, no data dependency. */}
      <Modal
        visible={showDiseaseGuide}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDiseaseGuide(false)}
      >
        <View style={styles.diseaseModalOverlay}>
          <View style={[styles.diseaseModalCard, { backgroundColor: colors.card }]}>
            <View style={[styles.diseaseModalHeader, { borderBottomColor: colors.divider }]}>
              <View style={styles.diseaseModalHeaderLeft}>
                <Ionicons name="sparkles" size={18} color="#4CAF50" />
                <Text style={[styles.diseaseModalTitle, { color: colors.text }]}>Disease Detection Guide</Text>
              </View>
              <TouchableOpacity onPress={() => setShowDiseaseGuide(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={colors.textLight} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.diseaseModalBody} contentContainerStyle={{ paddingBottom: 20 }}>
              <View style={styles.diseaseSectionHeader}>
                <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                <Text style={[styles.diseaseSectionTitle, { color: colors.text }]}>Detects</Text>
              </View>

              {DETECTED_DISEASES.map((d) => (
                <View key={d.name} style={[styles.diseaseRow, { backgroundColor: d.cardBg }]}>
                  <View style={[styles.diseaseIconCircle, { backgroundColor: d.iconBg }]}>
                    <Ionicons name={d.icon} size={18} color={d.iconColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.diseaseName, { color: colors.text }]}>{d.name}</Text>
                    <Text style={[styles.diseaseSymptoms, { color: colors.textSecondary }]}>{d.symptoms}</Text>
                  </View>
                </View>
              ))}

              <View style={[styles.diseaseSectionHeader, { marginTop: 18 }]}>
                <Ionicons name="close-circle" size={16} color="#f44336" />
                <Text style={[styles.diseaseSectionTitle, { color: colors.text }]}>Does NOT Detect</Text>
              </View>

              <View style={styles.notDetectWrap}>
                {NOT_DETECTED_LIST.map((item) => (
                  <View key={item} style={styles.notDetectPill}>
                    <Ionicons name="close" size={12} color="#f44336" />
                    <Text style={styles.notDetectText}>{item}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.diseaseFooterNote}>
                <Ionicons name="alert-circle" size={16} color="#F9A825" />
                <Text style={styles.diseaseFooterText}>
                  This is an early warning tool only. Always consult a veterinarian for diagnosis.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ImageQualityGuide
        visible={showQualityGuide}
        onClose={() => setShowQualityGuide(false)}
        onProceed={handleProceedToCamera}
        scanType={scanType}
      />

      <GuestBlockModal
        visible={guestModalVisible}
        onClose={() => setGuestModalVisible(false)}
        featureLabel={guestFeature}
      />

      <ExitGuestConfirmModal
        visible={showExitGuestModal}
        onCancel={() => setShowExitGuestModal(false)}
        onConfirm={handleExitGuestConfirm}
      />

      <WelcomeModal
        visible={showWelcomeModal}
        userName={welcomeName}
        onClose={handleCloseWelcomeModal}
      />

      <DisclaimerModal
        visible={showDisclaimer}
        onClose={handleDisclaimerDismiss}
        onAccept={handleDisclaimerDismiss}
      />

      <NotificationsListModal
        visible={showNotifications}
        notifications={notifications}
        onClose={() => setShowNotifications(false)}
        onMarkAllAsRead={markAllAsRead}
        onClearAll={clearAllNotifications}
        onDismissOne={deleteNotification}
        onPressNotification={(item) => {
          markAsRead(item.id);
          if (item.chickenId) {
            setShowNotifications(false);
            router.push(`/chicken/${item.chickenId}`);
          } else if (
            (item.title || '').toLowerCase().includes('profile') ||
            (item.message || '').toLowerCase().includes('profile')
          ) {
            setShowNotifications(false);
            router.push('/(tabs)/profile');
          } else if (
            (item.title || '').toLowerCase().includes('task') ||
            (item.message || '').toLowerCase().includes('task')
          ) {
            setShowNotifications(false);
            router.push('/tasks');
          } else if (
            (item.title || '').toLowerCase().includes('farm') ||
            (item.message || '').toLowerCase().includes('farm')
          ) {
            setShowNotifications(false);
            router.push('/farm');
          } else {
            // No redirection needed (e.g. login "Welcome Back")
            // Automatically marked as read/done. Do NOT show notification detail again!
          }
        }}
      />

      <FarmOnboardingModal
        visible={showFarmOnboarding}
        onStartCreateFarm={handleStartCreateFarm}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 95, paddingHorizontal: 16 },

  // --- Header ---
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    marginBottom: 14,
  },
  headerGreetingCol: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: 12,
  },
  greeting: { fontSize: 13.5, lineHeight: 18, fontWeight: '500' },
  userName: { fontSize: 21, fontWeight: 'bold', marginTop: 1, lineHeight: 26 },
  avatarButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  avatarImage: { width: 44, height: 44, borderRadius: 22 },
  avatarStatusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },

  // --- Search bar + dropdowns ---
  searchWrap: { width: '100%', position: 'relative', zIndex: 30, marginBottom: 16 },
  searchBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 11,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 2 },
  searchFilterBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  searchFilterDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#FFD54F',
    borderWidth: 1.5,
    borderColor: '#fff',
  },

  filterMenu: {
    position: 'absolute',
    top: 58,
    right: 0,
    width: 190,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
    zIndex: 40,
  },
  filterMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterMenuLabel: { flex: 1, fontSize: 13, fontWeight: '500' },

  filterMenuBackdrop: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
    zIndex: 25,
  },

  searchDropdown: {
    position: 'absolute',
    top: 58,
    left: 0,
    right: 0,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
    zIndex: 35,
    maxHeight: 280,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  searchResultName: { fontSize: 13, fontWeight: '600' },
  searchResultMeta: { fontSize: 11, marginTop: 1 },
  searchResultDot: { width: 8, height: 8, borderRadius: 4 },
  searchEmptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 14 },
  searchEmptyText: { fontSize: 12 },

  // --- Quick stat tiles ---
  statsRow: { width: '100%', flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 2,
    alignItems: 'center',
    gap: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  statIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statNumber: { fontSize: 18, fontWeight: 'bold', marginTop: 1 },
  statLabel: { fontSize: 10, fontWeight: '600', letterSpacing: -0.2, textAlign: 'center' },

  // --- Promo banner (Scan & Detect) ---
  promoWrap: { width: '100%', marginBottom: 16 },
  promoCardContainer: {
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0a1f0d',
  },
  promoBgImage: {
    width: '100%',
    height: '100%',
  },
  promoCard: {
    width: '100%',
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  promoTextBlock: { flex: 1, paddingRight: 10 },
  promoTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 4,
  },
  promoSubtitle: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  promoActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  promoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
  },
  promoButtonText: { color: '#2D5541', fontSize: 14, fontWeight: '700' },
  promoGuideChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  promoGuideChipText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  promoIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // --- "What Clucko Detects" info banner ---
  infoBanner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  infoBannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoBannerTitle: { fontSize: 14, fontWeight: '700' },
  infoBannerSubtitle: { fontSize: 12, marginTop: 2 },

  // --- Featured Gamefowl carousel ---
  featuredSection: { width: '100%', marginBottom: 4 },
  featuredSectionHeader: { paddingHorizontal: 0 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 18, fontWeight: 'bold' },
  viewAllText: { fontSize: 12, fontWeight: '600' },

  filterChipsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterChipText: { fontSize: 12.5, fontWeight: '600' },

  featuredList: { gap: 14 },
  featuredCard: {
    width: FEATURED_CARD_WIDTH,
    borderRadius: 22,
    padding: 16,
  },
  featuredBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  featuredBadgeDark: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  featuredBadgeDarkText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  featuredBadgeStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  featuredBadgeStatusText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  featuredMainRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featuredPhotoWrap: { position: 'relative' },
  featuredPhotoRing: { borderWidth: 3, borderRadius: 50 },
  featuredCheckBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredInfo: { flex: 1, minWidth: 0 },
  featuredName: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  featuredMetaRow: { flexDirection: 'row', gap: 16 },
  featuredMetaItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, flexShrink: 1 },
  featuredMetaLabel: { fontSize: 10 },
  featuredMetaValue: { fontSize: 12, fontWeight: '700', marginTop: 1 },

  featuredMessageBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
  },
  featuredMessageText: { flex: 1, fontSize: 12, lineHeight: 17 },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { width: 18 },

  emptyFeatured: { width: '100%', borderRadius: 20, alignItems: 'center', paddingVertical: 34, gap: 10 },
  emptyFeaturedText: { fontSize: 13 },

  // --- Upcoming Tasks ---
  tasksSection: { marginTop: 22 },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  taskIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  taskContent: { flex: 1 },
  taskTitle: { fontSize: 13, fontWeight: '600' },
  taskDate: { fontSize: 10, marginTop: 2 },
  taskHomeFarmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  taskHomeFarmText: { fontSize: 9, fontWeight: '700' },
  taskAction: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  taskActionText: { fontSize: 11, fontWeight: '700' },
  emptyTasksCard: {
    borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 26, gap: 8,
  },
  emptyTasksText: { fontSize: 13, textAlign: 'center' },

  // --- Floating exit guest button ---
  floatingExitButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 16 : 30,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f44336',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 20,
  },
  floatingExitText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // --- Disease Detection Guide modal ---
  diseaseModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  diseaseModalCard: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '82%',
    borderRadius: 22,
    overflow: 'hidden',
  },
  diseaseModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  diseaseModalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  diseaseModalTitle: { fontSize: 15, fontWeight: '700' },
  diseaseModalBody: { paddingHorizontal: 18, paddingTop: 14 },

  diseaseSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  diseaseSectionTitle: { fontSize: 13, fontWeight: '700' },

  diseaseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  diseaseIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  diseaseName: { fontSize: 13, fontWeight: '700', marginBottom: 3 },
  diseaseSymptoms: { fontSize: 11, lineHeight: 15 },

  notDetectWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  notDetectPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FCE9EA',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  notDetectText: { color: '#C62828', fontSize: 11, fontWeight: '600' },

  diseaseFooterNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF8E1',
    borderRadius: 14,
    padding: 12,
  },
  diseaseFooterText: { flex: 1, fontSize: 11, lineHeight: 15, color: '#8D6E00' },

  // Header bell button
  headerBellBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    position: 'relative',
  },
  headerBellBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    backgroundColor: '#E53935',
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBellBadgeText: {
    color: '#fff',
    fontSize: 9.5,
    fontWeight: '800',
  },

  // Recent Activity section on Home
  activitySection: {
    width: '100%',
    marginTop: 20,
  },
  activityCardWrap: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  homeActivityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    gap: 10,
  },
  homeActivityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeActivityTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  homeActivitySub: {
    fontSize: 11,
    marginTop: 2,
  },
  homeActivityTime: {
    fontSize: 10.5,
    fontWeight: '500',
  },
  homeGraceBanner: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 0,
    marginBottom: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  homeGraceGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  homeGraceTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  homeGraceSub: {
    color: '#FFF8E1',
    fontSize: 11,
    marginTop: 1,
  },
  homePlanPill: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6.5,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 0,
    marginBottom: 14,
    gap: 8,
  },
  homePlanPillText: {
    fontSize: 11.5,
    lineHeight: 16,
    flex: 1,
  },
});
