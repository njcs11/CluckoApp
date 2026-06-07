import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useDarkMode } from '../../context/DarkModeContext';
import { apiGetProfile, apiLogout, apiUpdateProfile } from '../../lib/api';

// Notification type definition
interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'warning' | 'info' | 'alert';
  timestamp: Date;
  read: boolean;
  chickenId?: string;
  chickenName?: string;
}

export default function ProfileScreen() {
  const { colors, isDarkMode, toggleDarkMode } = useDarkMode();
  const [activeTab, setActiveTab] = useState('account');
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  
  const [profile, setProfile] = useState({
    fullName: 'Mariz Esparago',
    email: 'marizesparago@gmail.com',
    phone: '09465473598',
    role: 'Owner',
    farmName: 'Dela Cruz Gamefowl Farm',
    farmLocation: 'San Jose, Batangas',
    memberSince: '2025-06-15',
    profileImage: null as string | null,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState(profile);
  const [notificationsEnabled, setNotificationsEnabled] = useState({
    push: true,
    email: true,
  });

  // Load notifications from storage
  const loadNotifications = async () => {
    try {
      const savedNotifications = await AsyncStorage.getItem('notifications');
      if (savedNotifications) {
        const parsed = JSON.parse(savedNotifications);
        // Convert timestamp strings back to Date objects
        const notificationsWithDates = parsed.map((n: any) => ({
          ...n,
          timestamp: new Date(n.timestamp),
        }));
        setNotifications(notificationsWithDates);
        const unread = notificationsWithDates.filter((n: NotificationItem) => !n.read).length;
        setUnreadCount(unread);
      } else {
        // Add sample welcome notification
        const welcomeNotif: NotificationItem = {
          id: Date.now().toString(),
          title: 'Welcome to Clucko!',
          message: 'Start by adding your first chicken to the flock.',
          type: 'info',
          timestamp: new Date(),
          read: false,
        };
        setNotifications([welcomeNotif]);
        setUnreadCount(1);
        await AsyncStorage.setItem('notifications', JSON.stringify([welcomeNotif]));
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  // Listen for new notifications when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadNotifications();
      checkForNewChickenNotifications();
    }, [])
  );

  // Check if a new chicken was added and create notification
  const checkForNewChickenNotifications = async () => {
    try {
      const lastNotifCheck = await AsyncStorage.getItem('lastNotifCheck');
      const chickens = await AsyncStorage.getItem('chickens');
      
      if (chickens) {
        const chickensData = JSON.parse(chickens);
        const lastChicken = chickensData[chickensData.length - 1];
        
        if (lastChicken && (!lastNotifCheck || new Date(lastChicken.dateAdded) > new Date(lastNotifCheck))) {
          // New chicken added, create notification
          await addNotification({
            title: 'New Chicken Added!',
            message: `${lastChicken.name} (${lastChicken.chickenId}) has been added to your flock.`,
            type: 'success',
            chickenId: lastChicken.chickenId,
            chickenName: lastChicken.name,
          });
          await AsyncStorage.setItem('lastNotifCheck', new Date().toISOString());
        }
      }
    } catch (error) {
      console.error('Error checking for new chickens:', error);
    }
  };

  // Add a new notification
  const addNotification = async (notifData: {
    title: string;
    message: string;
    type: 'success' | 'warning' | 'info' | 'alert';
    chickenId?: string;
    chickenName?: string;
  }) => {
    try {
      const newNotification: NotificationItem = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
        title: notifData.title,
        message: notifData.message,
        type: notifData.type,
        timestamp: new Date(),
        read: false,
        chickenId: notifData.chickenId,
        chickenName: notifData.chickenName,
      };
      
      const updatedNotifications = [newNotification, ...notifications];
      setNotifications(updatedNotifications);
      setUnreadCount(prev => prev + 1);
      await AsyncStorage.setItem('notifications', JSON.stringify(updatedNotifications));
    } catch (error) {
      console.error('Error adding notification:', error);
    }
  };

  // Mark a notification as read
  const markAsRead = async (id: string) => {
    const updated = notifications.map(notif =>
      notif.id === id ? { ...notif, read: true } : notif
    );
    setNotifications(updated);
    const newUnreadCount = updated.filter(n => !n.read).length;
    setUnreadCount(newUnreadCount);
    await AsyncStorage.setItem('notifications', JSON.stringify(updated));
  };

  // Mark all as read
  const markAllAsRead = async () => {
    const updated = notifications.map(notif => ({ ...notif, read: true }));
    setNotifications(updated);
    setUnreadCount(0);
    await AsyncStorage.setItem('notifications', JSON.stringify(updated));
  };

  // Clear all notifications
  const clearAllNotifications = async () => {
    Alert.alert('Clear Notifications', 'Are you sure you want to clear all notifications?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          setNotifications([]);
          setUnreadCount(0);
          await AsyncStorage.setItem('notifications', JSON.stringify([]));
        },
      },
    ]);
  };

  // Delete a single notification
  const deleteNotification = async (id: string) => {
    const updated = notifications.filter(notif => notif.id !== id);
    setNotifications(updated);
    const newUnreadCount = updated.filter(n => !n.read).length;
    setUnreadCount(newUnreadCount);
    await AsyncStorage.setItem('notifications', JSON.stringify(updated));
  };

  // Handle notification press
  const handleNotificationPress = (notification: NotificationItem) => {
    markAsRead(notification.id);
    if (notification.chickenId) {
      router.push(`/chicken/${notification.chickenId}`);
    }
  };

  // Get notification icon based on type
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <Ionicons name="checkmark-circle" size={22} color="#4CAF50" />;
      case 'warning':
        return <Ionicons name="alert-circle" size={22} color="#FF9800" />;
      case 'alert':
        return <Ionicons name="warning" size={22} color="#f44336" />;
      default:
        return <Ionicons name="information-circle" size={22} color="#2196F3" />;
    }
  };

  // Format timestamp
  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  };

  useEffect(() => {
    loadProfile();
    requestPermissions();
    loadNotifications();
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera roll permissions to change profile picture');
      }
    }
  };

  const loadProfile = async () => {
  try {
    const data = await apiGetProfile();
    const mapped = {
      fullName: `${data.first_name} ${data.last_name}`,
      email: data.email,
      phone: data.phone_number || '',
      role: data.role || 'Owner',
      farmName: data.farm_name || 'My Farm',
      farmLocation: data.farm_location || 'Davao City',
      memberSince: data.created_at?.split('T')[0] || '',
      profileImage: data.profile_image || null,
    };
    setProfile(mapped);
    setEditedProfile(mapped);
  } catch (e) {
    console.error('Profile load error:', e);
  }
};

  const saveProfile = async () => {
  try {
    const [first_name, ...rest] = editedProfile.fullName.split(' ');
    await apiUpdateProfile({
      first_name,
      last_name: rest.join(' '),
      phone_number: editedProfile.phone,
      farm_name: editedProfile.farmName,
      farm_location: editedProfile.farmLocation,
    });
    setProfile(editedProfile);
    setIsEditing(false);
    Alert.alert('Success', 'Profile updated');
  } catch (e: any) {
    Alert.alert('Error', e.message);
  }
};

  const pickProfileImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setEditedProfile({ ...editedProfile, profileImage: result.assets[0].uri });
      
      // Add notification for profile picture update
      await addNotification({
        title: 'Profile Picture Updated',
        message: 'Your profile picture has been changed.',
        type: 'info',
      });
    }
  };

  const StatsCard = ({ icon, value, label, color }: any) => (
    <View style={[styles.statCard, { backgroundColor: colors.card }]}>
      <Ionicons name={icon} size={24} color={color} />
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textLight }]}>{label}</Text>
    </View>
  );

  // Render notification item
  const renderNotificationItem = ({ item }: { item: NotificationItem }) => (
    <TouchableOpacity
      style={[
        styles.notificationItem,
        { backgroundColor: colors.card },
        !item.read && { backgroundColor: isDarkMode ? '#1E3A2F' : '#E8F5E9' }
      ]}
      onPress={() => handleNotificationPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.notificationIcon}>
        {getNotificationIcon(item.type)}
      </View>
      <View style={styles.notificationContent}>
        <View style={styles.notificationHeader}>
          <Text style={[styles.notificationTitle, { color: colors.text }]}>{item.title}</Text>
          <Text style={[styles.notificationTime, { color: colors.textLight }]}>{formatTime(item.timestamp)}</Text>
        </View>
        <Text style={[styles.notificationMessage, { color: colors.textSecondary }]}>{item.message}</Text>
      </View>
      <TouchableOpacity
        style={styles.notificationDelete}
        onPress={() => deleteNotification(item.id)}
      >
        <Ionicons name="close" size={16} color={colors.textLight} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      
      {/* Header with Notification Icon */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <View style={styles.headerPlaceholder} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
        <TouchableOpacity 
          style={styles.notificationButton}
          onPress={() => setShowNotifications(true)}
        >
          <Ionicons name="notifications-outline" size={24} color={colors.text} />
          {unreadCount > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Profile Header with Camera Icon for Photo Change */}
        <LinearGradient colors={isDarkMode ? ['#1B5E20', '#2E7D32'] : ['#1B5E20', '#2E7D32', '#388E3C']} style={styles.headerGradient}>
          <View style={styles.profileImageContainer}>
            <Image 
              source={editedProfile.profileImage ? { uri: editedProfile.profileImage } : require('../../assets/images/log.png')} 
              style={styles.profileImage} 
            />
            <TouchableOpacity style={styles.cameraIcon} onPress={pickProfileImage}>
              <LinearGradient colors={['#FF9800', '#F57C00']} style={styles.cameraIconGradient}>
                <Ionicons name="camera" size={20} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
          
          {isEditing ? (
            <TextInput
              style={[styles.editNameInput, { color: colors.headerText, borderColor: '#fff' }]}
              value={editedProfile.fullName}
              onChangeText={(text) => setEditedProfile({ ...editedProfile, fullName: text })}
              placeholderTextColor="rgba(255,255,255,0.7)"
            />
          ) : (
            <Text style={[styles.profileName, { color: colors.headerText }]}>{profile.fullName}</Text>
          )}
          
          <Text style={[styles.profileRole, { color: colors.headerSubtext }]}>{profile.role}</Text>
          <Text style={[styles.profileFarm, { color: colors.headerSubtext }]}>{profile.farmName}</Text>
          <Text style={[styles.profileDate, { color: colors.headerSubtext }]}>Member since {profile.memberSince}</Text>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <StatsCard icon="paw-outline" value="24" label="Gamefowls" color="#FFD700" />
            <StatsCard icon="people-outline" value="2" label="Users" color="#4CAF50" />
            <StatsCard icon="alert-circle-outline" value="3" label="Alerts" color="#FF9800" />
          </View>
        </LinearGradient>

        {/* Tab Navigation */}
        <View style={[styles.tabBar, { backgroundColor: colors.card }]}>
          {['account', 'preferences', 'support'].map((tab) => (
            <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary }]} onPress={() => setActiveTab(tab)}>
              <Text style={[styles.tabText, activeTab === tab && { color: colors.primary, fontWeight: 'bold' }]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Account Tab */}
        {activeTab === 'account' && (
          <View style={styles.section}>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Personal Information</Text>
                <TouchableOpacity onPress={() => setIsEditing(!isEditing)}>
                  <Text style={[styles.editButton, { color: colors.primary }]}>{isEditing ? 'Cancel' : 'Edit'}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textLight }]}>Full Name</Text>
                {isEditing ? (
                  <TextInput style={[styles.infoInput, { color: colors.text, borderColor: colors.border }]} value={editedProfile.fullName} onChangeText={(text) => setEditedProfile({ ...editedProfile, fullName: text })} />
                ) : (
                  <Text style={[styles.infoValue, { color: colors.text }]}>{profile.fullName}</Text>
                )}
              </View>

              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textLight }]}>Email</Text>
                {isEditing ? (
                  <TextInput style={[styles.infoInput, { color: colors.text, borderColor: colors.border }]} value={editedProfile.email} onChangeText={(text) => setEditedProfile({ ...editedProfile, email: text })} keyboardType="email-address" />
                ) : (
                  <Text style={[styles.infoValue, { color: colors.text }]}>{profile.email}</Text>
                )}
              </View>

              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textLight }]}>Phone Number</Text>
                {isEditing ? (
                  <TextInput style={[styles.infoInput, { color: colors.text, borderColor: colors.border }]} value={editedProfile.phone} onChangeText={(text) => setEditedProfile({ ...editedProfile, phone: text })} keyboardType="phone-pad" />
                ) : (
                  <Text style={[styles.infoValue, { color: colors.text }]}>{profile.phone}</Text>
                )}
              </View>

              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textLight }]}>User Role</Text>
                {isEditing ? (
                  <TextInput style={[styles.infoInput, { color: colors.text, borderColor: colors.border }]} value={editedProfile.role} onChangeText={(text) => setEditedProfile({ ...editedProfile, role: text })} />
                ) : (
                  <Text style={[styles.infoValue, { color: colors.text }]}>{profile.role}</Text>
                )}
              </View>

              {isEditing && (
                <TouchableOpacity style={styles.saveButton} onPress={saveProfile}>
                  <LinearGradient colors={['#4CAF50', '#2E7D32']} style={styles.saveGradient}>
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>My Farm</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textLight }]}>Farm Name</Text>
                {isEditing ? (
                  <TextInput style={[styles.infoInput, { color: colors.text, borderColor: colors.border }]} value={editedProfile.farmName} onChangeText={(text) => setEditedProfile({ ...editedProfile, farmName: text })} />
                ) : (
                  <Text style={[styles.infoValue, { color: colors.text }]}>{profile.farmName}</Text>
                )}
              </View>

              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textLight }]}>Location</Text>
                {isEditing ? (
                  <TextInput style={[styles.infoInput, { color: colors.text, borderColor: colors.border }]} value={editedProfile.farmLocation} onChangeText={(text) => setEditedProfile({ ...editedProfile, farmLocation: text })} />
                ) : (
                  <Text style={[styles.infoValue, { color: colors.text }]}>{profile.farmLocation}</Text>
                )}
              </View>

              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textLight }]}>Connected Devices/Users</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>2</Text>
              </View>
            </View>
          </View>
        )}

        {/* Preferences Tab */}
        {activeTab === 'preferences' && (
          <View style={styles.section}>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Appearance</Text>
              <View style={styles.preferenceRow}>
                <View style={styles.preferenceLeft}>
                  <Ionicons name="moon-outline" size={22} color={colors.primary} />
                  <Text style={[styles.preferenceLabel, { color: colors.text }]}>Dark Mode</Text>
                </View>
                <Switch value={isDarkMode} onValueChange={toggleDarkMode} trackColor={{ false: '#767577', true: '#4CAF50' }} thumbColor="#fff" />
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Notifications</Text>
              <View style={styles.preferenceRow}>
                <View style={styles.preferenceLeft}>
                  <Ionicons name="notifications-outline" size={22} color={colors.primary} />
                  <Text style={[styles.preferenceLabel, { color: colors.text }]}>Push Notifications</Text>
                </View>
                <Switch value={notificationsEnabled.push} onValueChange={(val) => setNotificationsEnabled({ ...notificationsEnabled, push: val })} trackColor={{ false: '#767577', true: '#4CAF50' }} thumbColor="#fff" />
              </View>
              <View style={styles.preferenceRow}>
                <View style={styles.preferenceLeft}>
                  <Ionicons name="mail-outline" size={22} color={colors.primary} />
                  <Text style={[styles.preferenceLabel, { color: colors.text }]}>Email Notifications</Text>
                </View>
                <Switch value={notificationsEnabled.email} onValueChange={(val) => setNotificationsEnabled({ ...notificationsEnabled, email: val })} trackColor={{ false: '#767577', true: '#4CAF50' }} thumbColor="#fff" />
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Language</Text>
              <TouchableOpacity style={styles.preferenceRow}>
                <View style={styles.preferenceLeft}>
                  <Ionicons name="language-outline" size={22} color={colors.primary} />
                  <Text style={[styles.preferenceLabel, { color: colors.text }]}>English</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Support Tab */}
        {activeTab === 'support' && (
          <View style={styles.section}>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Help & Support</Text>
              <TouchableOpacity style={styles.supportRow}>
                <View style={styles.preferenceLeft}>
                  <Ionicons name="chatbubbles-outline" size={22} color={colors.primary} />
                  <Text style={[styles.supportLabel, { color: colors.text }]}>Live Chat Support</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.supportRow}>
                <View style={styles.preferenceLeft}>
                  <Ionicons name="mail-outline" size={22} color={colors.primary} />
                  <Text style={[styles.supportLabel, { color: colors.text }]}>Email Support</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.supportRow}>
                <View style={styles.preferenceLeft}>
                  <Ionicons name="call-outline" size={22} color={colors.primary} />
                  <Text style={[styles.supportLabel, { color: colors.text }]}>Hotline: (02) 1234 5678</Text>
                </View>
              </TouchableOpacity>
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>About</Text>
              <TouchableOpacity style={styles.supportRow}>
                <Text style={[styles.supportLabel, { color: colors.text }]}>Privacy Policy</Text>
                <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.supportRow}>
                <Text style={[styles.supportLabel, { color: colors.text }]}>Terms of Service</Text>
                <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.supportRow}>
                <Text style={[styles.supportLabel, { color: colors.text }]}>App Version 1.0.0</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.logoutButton} onPress={() => {
              Alert.alert(
                'Logout', 
                'Are you sure you want to logout?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: 'Logout', 
                    onPress: async () => {
  await apiLogout();
  router.replace('/login');
}
                  }
                ]
              );
            }}>
              <LinearGradient colors={['#f44336', '#d32f2f']} style={styles.logoutGradient}>
                <Ionicons name="log-out-outline" size={20} color="#fff" />
                <Text style={styles.logoutText}>Logout</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Notification Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showNotifications}
        onRequestClose={() => setShowNotifications(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.notificationModal, { backgroundColor: colors.background }]}>
            <View style={styles.notificationModalHeader}>
              <Text style={[styles.notificationModalTitle, { color: colors.text }]}>Notifications</Text>
              <TouchableOpacity onPress={() => setShowNotifications(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            {notifications.length > 0 ? (
              <>
                <View style={styles.notificationModalActions}>
                  <TouchableOpacity onPress={markAllAsRead}>
                    <Text style={[styles.notificationActionText, { color: colors.primary }]}>Mark all as read</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={clearAllNotifications}>
                    <Text style={[styles.notificationActionText, { color: colors.error }]}>Clear all</Text>
                  </TouchableOpacity>
                </View>
                
                <FlatList
                  data={notifications}
                  renderItem={renderNotificationItem}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.notificationList}
                  refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
                  }
                />
              </>
            ) : (
              <View style={styles.emptyNotifications}>
                <Ionicons name="notifications-off-outline" size={64} color={colors.textLight} />
                <Text style={[styles.emptyNotificationsText, { color: colors.textSecondary }]}>No notifications yet</Text>
                <Text style={[styles.emptyNotificationsSubtext, { color: colors.textLight }]}>When you add chickens or receive alerts, they'll appear here.</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 10 : 20,
    paddingBottom: 10,
  },
  headerPlaceholder: { width: 40 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  notificationButton: { position: 'relative', width: 40, alignItems: 'flex-end' },
  notificationBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FF9800',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  headerGradient: { paddingBottom: 30, alignItems: 'center', borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  profileImageContainer: { position: 'relative', marginBottom: 16, marginTop: 20 },
  profileImage: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: '#fff' },
  cameraIcon: { position: 'absolute', bottom: 0, right: 0 },
  cameraIconGradient: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  profileName: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  profileRole: { fontSize: 14, marginBottom: 2 },
  profileFarm: { fontSize: 14, marginBottom: 2 },
  profileDate: { fontSize: 12, marginBottom: 16 },
  editNameInput: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 4, marginBottom: 4 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', paddingHorizontal: 20, marginTop: 8 },
  statCard: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 16, marginHorizontal: 4 },
  statValue: { fontSize: 20, fontWeight: 'bold', marginTop: 4 },
  statLabel: { fontSize: 10, marginTop: 2 },
  tabBar: { flexDirection: 'row', marginHorizontal: 20, marginTop: 16, borderRadius: 30, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 14 },
  section: { padding: 16 },
  card: { borderRadius: 16, padding: 16, marginBottom: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  cardTitle: { fontSize: 18, fontWeight: 'bold' },
  editButton: { fontSize: 14, fontWeight: '600' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  infoLabel: { fontSize: 14, width: '35%' },
  infoValue: { fontSize: 14, fontWeight: '500', flex: 1, textAlign: 'right' },
  infoInput: { fontSize: 14, fontWeight: '500', flex: 1, textAlign: 'right', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  saveButton: { marginTop: 20, borderRadius: 30, overflow: 'hidden' },
  saveGradient: { paddingVertical: 12, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  preferenceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  preferenceLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  preferenceLabel: { fontSize: 16 },
  supportRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  supportLabel: { fontSize: 16 },
  logoutButton: { borderRadius: 30, overflow: 'hidden', marginTop: 16 },
  logoutGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 8 },
  logoutText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  bottomPadding: { height: 30 },
  // Notification Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  notificationModal: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    maxHeight: '80%',
    minHeight: '50%',
  },
  notificationModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  notificationModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  notificationModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  notificationActionText: {
    fontSize: 13,
    fontWeight: '500',
  },
  notificationList: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  notificationTime: {
    fontSize: 11,
  },
  notificationMessage: {
    fontSize: 12,
    lineHeight: 16,
  },
  notificationDelete: {
    padding: 8,
  },
  emptyNotifications: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyNotificationsText: {
    fontSize: 16,
    fontWeight: '500',
  },
  emptyNotificationsSubtext: {
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});