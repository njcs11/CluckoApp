import NotificationDetailModal from '@/components/ui/NotificationDetailModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  apiClearNotifications,
  apiCreateNotification,
  apiDeleteNotification,
  apiGetNotifications,
  apiMarkAllNotificationsRead,
  apiMarkNotificationRead,
  getToken,
} from '../lib/api';

export interface NotificationItem {
  id: string;
  farm_id?: number;
  farm_name?: string;
  title: string;
  message: string;
  type: 'success' | 'warning' | 'info' | 'alert';
  timestamp: Date;
  read: boolean;
  chickenId?: string;
  chickenName?: string;
  creator_name?: string;
  creator_role?: string;
}

const GENERIC_NOTIFICATIONS_KEY = 'notifications';

const resolveCurrentEmail = async (): Promise<string | null> => {
  try {
    const sessionEmail = await AsyncStorage.getItem('userEmail');
    if (sessionEmail) return sessionEmail;
    const userDataString = await AsyncStorage.getItem('userData');
    if (userDataString) {
      const userData = JSON.parse(userDataString);
      return userData.email || null;
    }
    return null;
  } catch (error) {
    console.error('Error resolving current email:', error);
    return null;
  }
};

const getNotificationsStorageKey = async (): Promise<string> => {
  const email = await resolveCurrentEmail();
  return email ? `notifications_${email}` : GENERIC_NOTIFICATIONS_KEY;
};

interface NotifyInput {
  farm_id?: number;
  title: string;
  message: string;
  type: 'success' | 'warning' | 'info' | 'alert';
  chickenId?: string;
  chickenName?: string;
}

interface NotificationContextValue {
  notifications: NotificationItem[];
  unreadCount: number;
  /** Fires the moment an action happens — pops the banner immediately,
   *  no need to visit Profile first. Auto-dismisses after a few seconds. */
  notify: (data: NotifyInput) => Promise<void>;
  /** Opens the same banner design for a notification tapped from the
   *  Profile list — stays open until dismissed, no auto-timer. */
  showDetail: (notification: NotificationItem) => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;
const POLL_INTERVAL_MS = 15000; // Poll backend notifications every 15 seconds

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [displayed, setDisplayed] = useState<NotificationItem | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const persistLocal = useCallback(async (list: NotificationItem[]) => {
    const key = await getNotificationsStorageKey();
    await AsyncStorage.setItem(key, JSON.stringify(list));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const token = await getToken();
      if (token) {
        // Authenticated: fetch from backend (farm-scoped)
        const remote = await apiGetNotifications();
        if (Array.isArray(remote) && remote.length > 0) {
          const mapped: NotificationItem[] = remote.map((r: any) => ({
            id: String(r.id),
            farm_id: r.farm_id,
            farm_name: r.farm_name,
            title: r.title,
            message: r.message,
            type: r.type || 'info',
            timestamp: new Date(r.timestamp),
            read: !!r.read,
            chickenId: r.chickenId ? String(r.chickenId) : undefined,
            chickenName: r.chickenName || undefined,
            creator_name: r.creator_name,
            creator_role: r.creator_role,
          }));
          setNotifications(mapped);
          await persistLocal(mapped);
          return;
        }
      }

      // Guest / Offline fallback to AsyncStorage
      const key = await getNotificationsStorageKey();
      const saved = await AsyncStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved).map((n: any) => ({ ...n, timestamp: new Date(n.timestamp) }));
        setNotifications(parsed);
      } else {
        setNotifications([]);
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  }, [persistLocal]);

  // Initial load and auto-polling
  useEffect(() => {
    refresh();
    const interval = setInterval(() => {
      refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const clearDismissTimer = () => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  };

  const closeToast = useCallback(() => {
    clearDismissTimer();
    setDisplayed(null);
  }, []);

  const markAsReadInternal = useCallback(
    async (id: string) => {
      setNotifications((prev) => {
        const updated = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
        persistLocal(updated);
        return updated;
      });
      // Sync with backend
      await apiMarkNotificationRead(id);
    },
    [persistLocal]
  );

  const notify = useCallback(
    async (data: NotifyInput) => {
      const newNotification: NotificationItem = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        farm_id: data.farm_id,
        title: data.title,
        message: data.message,
        type: data.type,
        timestamp: new Date(),
        read: false,
        chickenId: data.chickenId,
        chickenName: data.chickenName,
      };

      // 1. Immediately update UI locally & show toast
      setNotifications((prev) => {
        const updated = [newNotification, ...prev];
        persistLocal(updated);
        return updated;
      });

      clearDismissTimer();
      setDisplayed(newNotification);
      dismissTimer.current = setTimeout(() => {
        setDisplayed(null);
      }, AUTO_DISMISS_MS);

      // 2. Broadcast to backend so other farm members receive it
      const token = await getToken();
      if (token) {
        apiCreateNotification({
          farm_id: data.farm_id,
          title: data.title,
          message: data.message,
          type: data.type,
          chicken_id: data.chickenId ? Number(data.chickenId) : undefined,
          chicken_name: data.chickenName,
        }).catch((err) => console.warn('Could not sync notification to backend:', err));
      }
    },
    [persistLocal]
  );

  const showDetail = useCallback(
    (notification: NotificationItem) => {
      clearDismissTimer();
      setDisplayed(notification);
      markAsReadInternal(notification.id);
    },
    [markAsReadInternal]
  );

  const markAsRead = useCallback(
    async (id: string) => {
      await markAsReadInternal(id);
    },
    [markAsReadInternal]
  );

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }));
      persistLocal(updated);
      return updated;
    });
    await apiMarkAllNotificationsRead();
  }, [persistLocal]);

  const clearAllNotifications = useCallback(async () => {
    setNotifications([]);
    await persistLocal([]);
    await apiClearNotifications();
  }, [persistLocal]);

  const deleteNotification = useCallback(
    async (id: string) => {
      setNotifications((prev) => {
        const updated = prev.filter((n) => n.id !== id);
        persistLocal(updated);
        return updated;
      });
      await apiDeleteNotification(id);
    },
    [persistLocal]
  );

  const handleViewChicken = (chickenId: string) => {
    closeToast();
    router.push(`/chicken/${chickenId}`);
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        notify,
        showDetail,
        markAsRead,
        markAllAsRead,
        clearAllNotifications,
        deleteNotification,
        refresh,
      }}
    >
      {children}
      <NotificationDetailModal
        visible={!!displayed}
        notification={displayed}
        onClose={closeToast}
        onViewChicken={handleViewChicken}
      />
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return ctx;
}