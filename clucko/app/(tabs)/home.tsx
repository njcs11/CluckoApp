import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import DisclaimerModal from '../../components/ui/DisclaimerModal';
import DiseaseInfoCard from '../../components/ui/DiseaseInfoCard';
import ImageQualityGuide from '../../components/ui/ImageQualityGuide';
import { useDarkMode } from '../../context/DarkModeContext';

const { width, height } = Dimensions.get('window');

// Import images statically
const birdImages = {
  '1': require('../../assets/images/CK-001.webp'),
  '2': require('../../assets/images/CK-002.webp'),
  '3': require('../../assets/images/CK-003.jpg'),
  '4': require('../../assets/images/CK-004.png'),
  '5': require('../../assets/images/CK-005.png'),
  '6': require('../../assets/images/CK-006.webp'),
};

export default function HomeScreen() {
  const { mode } = useLocalSearchParams();
  const { colors, isDarkMode } = useDarkMode();
  const isGuestMode = mode === 'guest';
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedBird, setSelectedBird] = useState<any>(null);
  const [weatherAnim] = useState(new Animated.Value(0));
  const [userName, setUserName] = useState('Guest User');
  const [activeFilter, setActiveFilter] = useState('All');
  const [allChickens, setAllChickens] = useState<any[]>([]);
  
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [acceptedDisclaimer, setAcceptedDisclaimer] = useState(false);
  const [showQualityGuide, setShowQualityGuide] = useState(false);
  const [scanType, setScanType] = useState<'head' | 'wing' | 'full'>('full');

  useEffect(() => {
    loadUserName();
    loadChickens();
    checkDisclaimerStatus();
    
    if (isGuestMode) {
      Alert.alert(
        'Guest Mode',
        'You are viewing as a guest. Please login or sign up to access all features.',
        [{ text: 'OK' }]
      );
    }
    
    Animated.loop(
      Animated.sequence([
        Animated.timing(weatherAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(weatherAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const checkDisclaimerStatus = async () => {
    try {
      const accepted = await AsyncStorage.getItem('disclaimer_accepted');
      if (accepted === 'true') {
        setAcceptedDisclaimer(true);
        setShowDisclaimer(false);
      }
    } catch (error) {
      console.error('Error checking disclaimer status:', error);
    }
  };

  const handleDisclaimerAccept = () => {
    setAcceptedDisclaimer(true);
    setShowDisclaimer(false);
  };

  const loadChickens = async () => {
    try {
      const savedChickens = await AsyncStorage.getItem('chickens');
      if (savedChickens) {
        const chickensData = JSON.parse(savedChickens);
        setAllChickens(chickensData);
      } else {
        // Default data
        setAllChickens([
          { id: '1', name: 'Rocky', idNumber: 'CK-001', status: 'Possible Infectious Coryza', statusColor: '#FF9800', timeAgo: '2 mins ago', breed: 'Sweater', age: '8 months', weight: '2.3 kg', location: 'Pen A-1', healthStatus: 'Warning', imageKey: '1' },
          { id: '2', name: 'Thunder', idNumber: 'CK-002', status: 'Healthy', statusColor: '#4CAF50', timeAgo: '1 day ago', breed: 'Hatch', age: '6 months', weight: '1.8 kg', location: 'Pen B-2', healthStatus: 'Healthy', imageKey: '2' },
          { id: '3', name: 'Lightning', idNumber: 'CK-003', status: 'Under Observation', statusColor: '#f44336', timeAgo: '3 hours ago', breed: 'Kelso', age: '7 months', weight: '2.1 kg', location: 'Isolation Pen', healthStatus: 'Critical', imageKey: '3' },
          { id: '4', name: 'Eagle', idNumber: 'CK-004', status: 'Healthy', statusColor: '#4CAF50', timeAgo: '2 days ago', breed: 'Roundhead', age: '9 months', weight: '2.4 kg', location: 'Pen A-2', healthStatus: 'Healthy', imageKey: '4' },
          { id: '5', name: 'Falcon', idNumber: 'CK-005', status: 'Possible Infectious Coryza', statusColor: '#FF9800', timeAgo: '30 mins ago', breed: 'Sweater', age: '5 months', weight: '1.7 kg', location: 'Isolation Pen', healthStatus: 'Warning', imageKey: '5' },
          { id: '6', name: 'Hawk', idNumber: 'CK-006', status: 'Under Observation', statusColor: '#f44336', timeAgo: '5 hours ago', breed: 'Hatch', age: '10 months', weight: '2.6 kg', location: 'Pen B-1', healthStatus: 'Critical', imageKey: '6' },
        ]);
      }
    } catch (error) {
      console.error('Error loading chickens:', error);
    }
  };

  const loadUserName = async () => {
    try {
      const userData = await AsyncStorage.getItem('userData');
      if (userData) {
        const parsedUser = JSON.parse(userData);
        if (parsedUser.name) setUserName(parsedUser.name);
        else if (parsedUser.fullName) setUserName(parsedUser.fullName);
        else setUserName('User');
      }
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
    return allChickens.filter(c => c.healthStatus === activeFilter);
  };

  const getBirdImage = (imageKey: string) => {
    return birdImages[imageKey as keyof typeof birdImages] || require('../../assets/images/log.png');
  };

  const handleAction = (actionName: string, action: () => void) => {
    if (isGuestMode) {
      Alert.alert(
        'Login Required',
        'Please login or create an account to use this feature.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Login', onPress: () => router.replace('/login') },
          { text: 'Sign Up', onPress: () => router.push('/signup') },
        ]
      );
    } else {
      action();
    }
  };

  const handleScanNow = () => {
    handleAction('Scan', () => {
      setShowQualityGuide(true);
    });
  };

  const handleProceedToCamera = () => {
    setShowQualityGuide(false);
    router.push('/(tabs)/capture');
  };

  const handleBirdPress = (bird: any) => {
    if (isGuestMode) {
      Alert.alert('Login Required', 'Please login to view bird details.');
    } else {
      router.push(`/chicken/${bird.id}`);
    }
  };

  const handleHealthTrack = () => {
    handleAction('Health Track', () => router.push('/(tabs)/chickens'));
  };

  const handleAdvisory = () => {
    if (isGuestMode) {
      Alert.alert('Login Required', 'Please login to view health advisory tips.');
    } else {
      Alert.alert('Health Advisory', 'Check your chickens daily for early signs of illness including: unusual droppings, reduced appetite, lethargy, and respiratory issues.');
    }
  };

  const healthTips = [
    { id: '1', title: 'Regular Vaccination', description: 'Ensure all chickens are vaccinated against common diseases like Newcastle and Fowl Pox.' },
    { id: '2', title: 'Clean Water Supply', description: 'Change water daily and clean waterers to prevent bacterial growth and diseases.' },
    { id: '3', title: 'Proper Nutrition', description: 'Provide balanced feed with essential proteins, vitamins, and minerals for optimal health.' },
    { id: '4', title: 'Monitor Droppings', description: 'Check droppings daily - unusual color or consistency indicates health issues.' },
  ];

  const upcomingTasks = [
    { id: '1', title: 'Vaccination Due', date: 'Tomorrow', icon: 'medkit-outline', color: '#4CAF50' },
    { id: '2', title: 'Weight Check', date: 'In 2 days', icon: 'fitness-outline', color: '#2196F3' },
    { id: '3', title: 'Pen Cleaning', date: 'Today', icon: 'brush-outline', color: '#FF9800' },
  ];

  const weatherData = {
    temp: '28°C',
    condition: 'Sunny',
    humidity: '65%',
    wind: '12 km/h',
  };

  const renderHealthTip = ({ item }: any) => (
    <TouchableOpacity 
      style={[styles.tipCard, isGuestMode && styles.disabledCard, { backgroundColor: colors.card }]} 
      onPress={() => handleAdvisory()}
      disabled={isGuestMode}
    >
      <View style={[styles.tipIcon, { backgroundColor: isDarkMode ? '#3E2723' : '#FFF8E1' }]}>
        <Ionicons name="bulb-outline" size={20} color="#ffb74d" />
      </View>
      <View style={styles.tipContent}>
        <Text style={[styles.tipTitle, { color: colors.text }]}>{item.title}</Text>
        <Text style={[styles.tipDescription, { color: colors.textSecondary }]}>{item.description}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderGamefowlCard = ({ item }: any) => (
    <TouchableOpacity 
      style={[styles.gamefowlCard, isGuestMode && styles.disabledCard, { backgroundColor: colors.card }]} 
      onPress={() => handleBirdPress(item)}
      disabled={isGuestMode}
    >
      <Image 
        source={getBirdImage(item.imageKey)} 
        style={styles.gamefowlImage}
        defaultSource={require('../../assets/images/log.png')}
      />
      <View style={styles.gamefowlInfo}>
        <Text style={[styles.gamefowlName, { color: colors.text }]}>{item.name}</Text>
        <View style={[styles.gamefowlBadge, { backgroundColor: item.statusColor + '20' }]}>
          <Text style={[styles.gamefowlStatus, { color: item.statusColor }]}>{item.status}</Text>
        </View>
      </View>
      <View style={styles.gamefowlFooter}>
        <View style={styles.gamefowlIdContainer}>
          <Ionicons name="qr-code-outline" size={12} color={colors.textLight} />
          <Text style={[styles.gamefowlId, { color: colors.textLight }]}>{item.idNumber}</Text>
        </View>
        <View style={styles.gamefowlTimeContainer}>
          <Ionicons name="time-outline" size={10} color={colors.textLight} />
          <Text style={[styles.gamefowlTime, { color: colors.textLight }]}>{item.timeAgo}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderTaskItem = ({ item }: any) => (
    <TouchableOpacity style={[styles.taskCard, { backgroundColor: colors.card }]}>
      <View style={[styles.taskIcon, { backgroundColor: item.color + '20' }]}>
        <Ionicons name={item.icon as any} size={20} color={item.color} />
      </View>
      <View style={styles.taskContent}>
        <Text style={[styles.taskTitle, { color: colors.text }]}>{item.title}</Text>
        <Text style={[styles.taskDate, { color: colors.textLight }]}>{item.date}</Text>
      </View>
      <TouchableOpacity style={styles.taskAction}>
        <Text style={[styles.taskActionText, { color: colors.primary }]}>Complete</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const chickens = getFilteredBirds();
  const healthyCount = allChickens.filter(c => c.healthStatus === 'Healthy').length;
  const warningCount = allChickens.filter(c => c.healthStatus === 'Warning').length;
  const criticalCount = allChickens.filter(c => c.healthStatus === 'Critical').length;

  if (!acceptedDisclaimer && showDisclaimer) {
    return (
      <DisclaimerModal
        visible={showDisclaimer}
        onClose={() => setShowDisclaimer(false)}
        onAccept={handleDisclaimerAccept}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header Section */}
        <LinearGradient colors={isDarkMode ? ['#1B5E20', '#2E7D32'] : ['#1B5E20', '#2E7D32', '#388E3C']} style={styles.headerGradient}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.greeting, { color: colors.headerSubtext }]}>{getGreeting()},</Text>
              <Text style={[styles.userName, { color: colors.headerText }]}>{userName}</Text>
            </View>
            <TouchableOpacity 
              style={[styles.profileButton, { backgroundColor: 'rgba(255,255,255,0.2)' }]} 
              onPress={() => {
                if (isGuestMode) {
                  Alert.alert('Login Required', 'Please login to access your profile.');
                } else {
                  router.push('/(tabs)/profile');
                }
              }}
            >
              <Image source={require('../../assets/images/log.png')} style={styles.profileImage} />
            </TouchableOpacity>
          </View>

          {/* Weather Widget */}
          <View style={styles.weatherWidget}>
            <View style={styles.weatherLeft}>
              <Ionicons name="sunny" size={32} color="#FFD700" />
              <View>
                <Text style={styles.weatherTemp}>{weatherData.temp}</Text>
                <Text style={styles.weatherCondition}>{weatherData.condition}</Text>
              </View>
            </View>
            <View style={styles.weatherRight}>
              <View style={styles.weatherDetail}>
                <Ionicons name="water-outline" size={14} color="#fff" />
                <Text style={styles.weatherDetailText}>{weatherData.humidity}</Text>
              </View>
              <View style={styles.weatherDetail}>
                <Ionicons name="flag-outline" size={14} color="#fff" />
                <Text style={styles.weatherDetailText}>{weatherData.wind}</Text>
              </View>
            </View>
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <TouchableOpacity 
              style={[styles.statCard, { backgroundColor: colors.statCard }]} 
              onPress={() => handleHealthTrack()}
              disabled={isGuestMode}
            >
              <FontAwesome5 name="drumstick-bite" size={24} color={colors.primary} />
              <Text style={[styles.statNumber, { color: colors.primary }]}>{allChickens.length}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total Birds</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.statCard, { backgroundColor: colors.statCard }]} 
              onPress={() => setActiveFilter('Healthy')}
              disabled={isGuestMode}
            >
              <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
              <Text style={[styles.statNumber, { color: '#4CAF50' }]}>{healthyCount}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Healthy</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.statCard, { backgroundColor: colors.statCard }]} 
              onPress={() => setActiveFilter('Warning')}
              disabled={isGuestMode}
            >
              <Ionicons name="alert-circle" size={24} color="#FF9800" />
              <Text style={[styles.statNumber, { color: '#FF9800' }]}>{warningCount}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Warning</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.statCard, { backgroundColor: colors.statCard }]} 
              onPress={() => setActiveFilter('Critical')}
              disabled={isGuestMode}
            >
              <Ionicons name="warning" size={24} color="#f44336" />
              <Text style={[styles.statNumber, { color: '#f44336' }]}>{criticalCount}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Critical</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Scan Section */}
        <View style={[styles.scanSection, { backgroundColor: colors.card }]}>
          <View style={styles.scanHeader}>
            <Text style={[styles.scanTitle, { color: colors.primary }]}>Quick Scan</Text>
            <Text style={[styles.scanSubtitle, { color: colors.textSecondary }]}>Instant health check</Text>
          </View>
          <TouchableOpacity style={styles.scanButton} onPress={handleScanNow}>
            <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.scanButtonGradient}>
              <Ionicons name="scan-outline" size={28} color="#fff" />
              <View>
                <Text style={styles.scanButtonText}>Scan QR Code</Text>
                <Text style={styles.scanButtonSubtext}>Access health profile</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Disease Info Card */}
        <DiseaseInfoCard compact={true} />

        {/* Gamefowl Section with Filter Chips */}
        <View style={styles.gamefowlSection}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Gamefowl</Text>
            <TouchableOpacity onPress={() => handleHealthTrack()}>
              <Text style={[styles.viewAllText, { color: colors.primary }]}>View All →</Text>
            </TouchableOpacity>
          </View>

          {/* Filter Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
            <TouchableOpacity 
              style={[styles.filterChip, activeFilter === 'All' && styles.activeFilterChip, { backgroundColor: activeFilter === 'All' ? colors.primary : colors.card, borderColor: colors.border }]}
              onPress={() => setActiveFilter('All')}
            >
              <Text style={[styles.filterText, { color: activeFilter === 'All' ? '#fff' : colors.text }]}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.filterChip, activeFilter === 'Healthy' && styles.activeFilterChip, { backgroundColor: activeFilter === 'Healthy' ? '#4CAF50' : colors.card, borderColor: colors.border }]}
              onPress={() => setActiveFilter('Healthy')}
            >
              <Text style={[styles.filterText, { color: activeFilter === 'Healthy' ? '#fff' : colors.text }]}>Healthy</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.filterChip, activeFilter === 'Warning' && styles.activeFilterChip, { backgroundColor: activeFilter === 'Warning' ? '#FF9800' : colors.card, borderColor: colors.border }]}
              onPress={() => setActiveFilter('Warning')}
            >
              <Text style={[styles.filterText, { color: activeFilter === 'Warning' ? '#fff' : colors.text }]}>Warning</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.filterChip, activeFilter === 'Critical' && styles.activeFilterChip, { backgroundColor: activeFilter === 'Critical' ? '#f44336' : colors.card, borderColor: colors.border }]}
              onPress={() => setActiveFilter('Critical')}
            >
              <Text style={[styles.filterText, { color: activeFilter === 'Critical' ? '#fff' : colors.text }]}>Critical</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Gamefowl Cards */}
          <FlatList
            data={chickens}
            renderItem={renderGamefowlCard}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.gamefowlList}
            scrollEnabled={true}
          />
        </View>

        {/* Upcoming Tasks */}
        <View style={styles.tasksSection}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Upcoming Tasks</Text>
            <TouchableOpacity>
              <Text style={[styles.viewAllText, { color: colors.primary }]}>View All →</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={upcomingTasks}
            renderItem={renderTaskItem}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
          />
        </View>

        {/* Health Tips */}
        <View style={styles.tipsSection}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Health Tips</Text>
            <TouchableOpacity onPress={handleAdvisory}>
              <Text style={[styles.viewAllText, { color: colors.primary }]}>More Tips →</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={healthTips}
            renderItem={renderHealthTip}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
          />
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Image Quality Guide Modal */}
      <ImageQualityGuide
        visible={showQualityGuide}
        onClose={() => setShowQualityGuide(false)}
        onProceed={handleProceedToCamera}
        scanType={scanType}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  headerGradient: {
    paddingTop: Platform.OS === 'ios' ? 20 : 40,
    paddingBottom: 25,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  greeting: {
    fontSize: 14,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  profileButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileImage: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
  },
  weatherWidget: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 12,
    borderRadius: 20,
  },
  weatherLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  weatherTemp: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  weatherCondition: {
    fontSize: 12,
    color: '#C8E6C9',
  },
  weatherRight: {
    flexDirection: 'row',
    gap: 16,
  },
  weatherDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  weatherDetailText: {
    fontSize: 12,
    color: '#C8E6C9',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 20,
    padding: 10,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    gap: 6,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 10,
    textAlign: 'center',
  },
  scanSection: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 24,
    padding: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  scanHeader: {
    marginBottom: 12,
  },
  scanTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  scanSubtitle: {
    fontSize: 12,
  },
  scanButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  scanButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  scanButtonSubtext: {
    color: '#C8E6C9',
    fontSize: 11,
  },
  gamefowlSection: {
    marginHorizontal: 16,
    marginTop: 20,
  },
  filterContainer: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
  },
  activeFilterChip: {
    borderWidth: 0,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '500',
  },
  gamefowlList: {
    paddingRight: 16,
    gap: 10,
  },
  gamefowlCard: {
    width: 150,
    borderRadius: 16,
    padding: 10,
    marginRight: 10,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  gamefowlImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignSelf: 'center',
    marginBottom: 8,
    backgroundColor: '#f0f0f0',
  },
  gamefowlInfo: {
    alignItems: 'center',
    marginBottom: 6,
  },
  gamefowlName: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  gamefowlBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  gamefowlStatus: {
    fontSize: 9,
    fontWeight: '600',
  },
  gamefowlFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  gamefowlIdContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  gamefowlId: {
    fontSize: 9,
  },
  gamefowlTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  gamefowlTime: {
    fontSize: 8,
  },
  tasksSection: {
    marginHorizontal: 16,
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '500',
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  taskIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  taskDate: {
    fontSize: 10,
    marginTop: 2,
  },
  taskAction: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
  },
  taskActionText: {
    fontSize: 11,
    fontWeight: '500',
  },
  tipsSection: {
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 16,
  },
  tipCard: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  disabledCard: {
    opacity: 0.7,
  },
  tipIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  tipDescription: {
    fontSize: 11,
  },
  bottomPadding: {
    height: 20,
  },
});