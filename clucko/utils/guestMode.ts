import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Alert } from 'react-native';

export const exitGuestMode = () => {
  Alert.alert(
    'Exit Guest Mode',
    'You will be taken back to the login screen. Continue?',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Exit',
        style: 'destructive',
        onPress: async () => {
          try {
            await AsyncStorage.setItem('isGuestMode', 'false');
            await AsyncStorage.setItem('isLoggedIn', 'false');
          } catch (error) {
            console.error('Error exiting guest mode:', error);
          }
          router.replace('/login');
        },
      },
    ]
  );
};

// Single source of truth for "are we in guest mode right now" — every
// screen/util that loads chickens, farms, or tasks checks this FIRST,
// before ever touching the real AsyncStorage keys ('chickens', 'farms',
// 'tasks'). Guest mode must never read (or write) those keys — they
// belong exclusively to a logged-in account. This prevents a real
// account's data from ever leaking into a guest session on the same
// device, and vice versa.
export const checkIsGuestMode = async (): Promise<boolean> => {
  try {
    const flag = await AsyncStorage.getItem('isGuestMode');
    return flag === 'true';
  } catch (error) {
    console.error('Error checking guest mode:', error);
    return false;
  }
};

// Static, hardcoded sample data for guest mode. Never persisted, never
// mutated, never mixed with real account data. Guest mode is read-only
// by design (every add/edit/complete action is blocked behind a
// guestAlert() call in chickens.tsx / home.tsx), so these arrays are all
// guest mode ever needs to render.
//
// Field set is a superset covering both screens that consume chickens:
// chickens.tsx (chickenId, healthStatus, statusColor, lastScan) and
// home.tsx (idNumber, status as a display label, timeAgo).
export const GUEST_SAMPLE_FARMS = [
  {
    id: 'guest-farm-1',
    name: 'Sample Farm',
    location: 'Demo Location',
    dateCreated: '2026-01-01',
  },
];

export const GUEST_SAMPLE_CHICKENS = [
  {
    id: 'guest-1',
    name: 'Ginger',
    chickenId: 'CK-DEMO-1',
    idNumber: 'CK-DEMO-1',
    status: 'HEALTHY',
    statusColor: '#4CAF50',
    farmId: 'guest-farm-1',
    lastScan: '2026-01-15',
    timeAgo: '2 days ago',
    healthStatus: 'Healthy',
    photo: null,
    dateAdded: '2026-01-01',
  },
  {
    id: 'guest-2',
    name: 'Clucky',
    chickenId: 'CK-DEMO-2',
    idNumber: 'CK-DEMO-2',
    status: 'WARNING',
    statusColor: '#FF9800',
    farmId: 'guest-farm-1',
    lastScan: '2026-01-14',
    timeAgo: '3 days ago',
    healthStatus: 'Warning',
    photo: null,
    dateAdded: '2026-01-01',
  },
];