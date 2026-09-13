import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// Default fallback — change this to your most common IP
const DEFAULT_API_URL = "http://192.168.1.5:5000";

let cachedApiUrl: string | null = null;

export { DEFAULT_API_URL };

/**
 * Automatically extracts the computer's WiFi IP address from the Expo packager host.
 * Whenever you switch WiFis or hotspots, Expo dynamically runs on the new IP,
 * allowing Clucko to automatically target http://<new-ip>:5000 with zero manual changes!
 */
export const getAutoDetectedHost = (): string | null => {
  try {
    const hostUri =
      Constants.expoConfig?.hostUri ||
      (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ||
      (Constants as any)?.manifest?.debuggerHost;

    if (hostUri) {
      const ip = hostUri.split(":")[0];
      if (ip && ip !== "localhost" && ip !== "127.0.0.1") {
        return `http://${ip}:5000`;
      }
    }
  } catch {
    // Ignore and fallback
  }
  return null;
};

export const getApiUrl = async (): Promise<string> => {
  if (cachedApiUrl) return cachedApiUrl;

  const mode = await AsyncStorage.getItem("api_url_mode"); // "auto" (default) or "manual"
  const saved = await AsyncStorage.getItem("api_url");

  // If user explicitly configured manual mode, respect the manual URL
  if (mode === "manual" && saved) {
    cachedApiUrl = saved;
    return cachedApiUrl;
  }

  // Otherwise (auto mode by default), detect current WiFi IP from Expo
  const autoUrl = getAutoDetectedHost();
  if (autoUrl) {
    cachedApiUrl = autoUrl;
    return cachedApiUrl;
  }

  cachedApiUrl = saved || DEFAULT_API_URL;
  return cachedApiUrl;
};

export const setApiUrl = async (url: string, mode: "auto" | "manual" = "manual") => {
  const clean = url.trim().replace(/\/$/, "");
  cachedApiUrl = clean;
  await AsyncStorage.setItem("api_url", clean);
  await AsyncStorage.setItem("api_url_mode", mode);
};

export const resetToAutoApiUrl = async (): Promise<string> => {
  await AsyncStorage.setItem("api_url_mode", "auto");
  await AsyncStorage.removeItem("api_url");
  cachedApiUrl = null;
  return await getApiUrl();
};

export const testConnection = async (url: string): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${url}/api/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
};

export const getToken = async (): Promise<string | null> => {
  const isGuest = await AsyncStorage.getItem("isGuestMode");
  if (isGuest === "true") return null;

  const token = await AsyncStorage.getItem("token");
  if (!token || token === "null" || token === "undefined" || token.trim() === "") {
    return null;
  }
  return token.trim();
};

export const clearStaleSession = async () => {
  try {
    await AsyncStorage.multiRemove([
      "token",
      "user_id",
      "userData",
      "user_role",
      "isLoggedIn",
    ]);
  } catch (e) {
    console.error("Error clearing stale session:", e);
  }
};

const headers = async () => {
  const token = await getToken();
  const h: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    h["Authorization"] = `Bearer ${token}`;
  }
  return h;
};

// ─── ROLE HELPER ──────────────────────────────────────────────
export const getUserRole = async (): Promise<string> => {
  return (await AsyncStorage.getItem("user_role")) || "owner";
};

// ─── AUTH ─────────────────────────────────────────────────────
export const apiSignup = async (data: any) => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Signup failed");
  await AsyncStorage.setItem("token", json.token);
  await AsyncStorage.setItem("user_id", String(json.user_id));
  await AsyncStorage.setItem("user_role", json.role || "owner");
  const fullName = `${data.first_name || ''} ${data.last_name || ''}`.trim() || data.first_name || 'User';
  await AsyncStorage.setItem("userName", fullName);
  await AsyncStorage.setItem("userData", JSON.stringify({
    id: json.user_id,
    first_name: data.first_name,
    last_name: data.last_name,
    email: data.email,
    role: json.role || 'owner',
    name: fullName,
    fullName,
  }));
  await AsyncStorage.setItem("isLoggedIn", "true");
  await AsyncStorage.setItem("isGuestMode", "false");
  await AsyncStorage.setItem("pending_welcome_login", "true");
  return json;
};

export const apiLogin = async (email: string, password: string) => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Login failed");
  await AsyncStorage.setItem("token", json.token);
  await AsyncStorage.setItem("user_id", String(json.user.id));
  await AsyncStorage.setItem("user_role", json.user.role || "owner");
  const fullName = `${json.user.first_name || ''} ${json.user.last_name || ''}`.trim() || json.user.first_name || json.user.name || 'User';
  await AsyncStorage.setItem("userName", fullName);
  await AsyncStorage.setItem("userData", JSON.stringify({ ...json.user, name: fullName, fullName }));
  await AsyncStorage.setItem("isLoggedIn", "true");
  await AsyncStorage.setItem("isGuestMode", "false");
  await AsyncStorage.setItem("pending_welcome_login", "true");
  return json;
};

export const apiGoogleAuth = async (googleProfile: {
  email: string;
  first_name?: string;
  last_name?: string;
  picture?: string;
  google_id?: string;
}) => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(googleProfile),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Google authentication failed");
  await AsyncStorage.setItem("token", json.token);
  await AsyncStorage.setItem("user_id", String(json.user_id || json.user?.id));
  await AsyncStorage.setItem("user_role", json.role || json.user?.role || "owner");
  const user = json.user || {};
  const fullName = `${user.first_name || googleProfile.first_name || ''} ${user.last_name || googleProfile.last_name || ''}`.trim() || user.name || 'User';
  await AsyncStorage.setItem("userName", fullName);
  await AsyncStorage.setItem("userData", JSON.stringify({ ...user, name: fullName, fullName }));
  await AsyncStorage.setItem("isLoggedIn", "true");
  await AsyncStorage.setItem("isGuestMode", "false");
  await AsyncStorage.setItem("pending_welcome_login", "true");
  return json;
};

export const apiLogout = async () => {
  await AsyncStorage.multiRemove([
    "token",
    "user_id",
    "userData",
    "userName",
    "userEmail",
    "userPhone",
    "user_role",
    "isLoggedIn",
    "isGuestMode",
  ]);
};

export const apiGetProfile = async () => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/auth/profile`, {
    headers: await headers(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

export const apiUpdateProfile = async (data: any) => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/auth/profile`, {
    method: "PUT",
    headers: await headers(),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

// ─── CHICKENS ─────────────────────────────────────────────────
export const apiGetChickens = async (farm_id?: number) => {
  const token = await getToken();
  if (!token) return [];
  const API_URL = await getApiUrl();
  const url = farm_id
    ? `${API_URL}/api/chickens?farm_id=${farm_id}`
    : `${API_URL}/api/chickens`;
  try {
    const res = await fetch(url, { headers: await headers() });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        await clearStaleSession();
        return [];
      }
      throw new Error(json.error || "Failed to load chickens");
    }
    return json;
  } catch (err: any) {
    if (err.message === "Invalid token" || err.message === "Token expired" || err.message === "Token missing") {
      await clearStaleSession();
      return [];
    }
    throw err;
  }
};

export const apiCreateChicken = async (data: {
  qr_code: string;
  chicken_name: string;
  location?: string;
  photo_url?: string;
  farm_id?: number; // ← ADDED
}) => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/chickens`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

export const apiGetChicken = async (id: string) => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/chickens/${id}`, {
    headers: await headers(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

export const apiDeleteChicken = async (id: string) => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/chickens/${id}`, {
    method: "DELETE",
    headers: await headers(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

export const apiUpdateChicken = async (
  id: string | number,
  data: {
    chicken_name?: string;
    farm_id?: number | null;
    photo_url?: string;
    location?: string;
  },
) => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/chickens/${id}`, {
    method: "PUT",
    headers: await headers(),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

export const apiGetChickenHistory = async (id: string) => {
  const API_URL = await getApiUrl();
  try {
    const res = await fetch(`${API_URL}/api/chickens/${encodeURIComponent(id)}/history`, {
      headers: await headers(),
    });
    const json = await res.json().catch(() => []);
    if (!res.ok) {
      if (res.status === 401) {
        await clearStaleSession();
      }
      return [];
    }
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
};

export const apiGetStats = async () => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/stats`, {
    headers: await headers(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

// ─── SCANS ────────────────────────────────────────────────────
export const apiSaveScan = async (data: any) => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/scans`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

// ─── ALERTS ───────────────────────────────────────────────────
export const apiGetAlerts = async () => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/alerts`, {
    headers: await headers(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

export const apiMarkAllAlertsRead = async () => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/alerts/read-all`, {
    method: "PUT",
    headers: await headers(),
  });
  return res.json();
};

// ─── NOTIFICATIONS (FARM-SCOPED) ──────────────────────────────
export const apiGetNotifications = async () => {
  const token = await getToken();
  if (!token) return [];
  const API_URL = await getApiUrl();
  try {
    const res = await fetch(`${API_URL}/api/notifications`, {
      headers: await headers(),
    });
    const json = await res.json().catch(() => []);
    if (!res.ok) return [];
    return json;
  } catch {
    return [];
  }
};

export const apiCreateNotification = async (data: {
  farm_id?: number;
  title: string;
  message: string;
  type?: 'success' | 'warning' | 'info' | 'alert';
  chicken_id?: number;
  chicken_name?: string;
}) => {
  const token = await getToken();
  if (!token) return null;
  const API_URL = await getApiUrl();
  try {
    const res = await fetch(`${API_URL}/api/notifications`, {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify(data),
    });
    return await res.json();
  } catch {
    return null;
  }
};

export const apiMarkNotificationRead = async (id: string | number) => {
  const token = await getToken();
  if (!token) return;
  const API_URL = await getApiUrl();
  try {
    await fetch(`${API_URL}/api/notifications/${id}/read`, {
      method: 'PUT',
      headers: await headers(),
    });
  } catch {}
};

export const apiMarkAllNotificationsRead = async () => {
  const token = await getToken();
  if (!token) return;
  const API_URL = await getApiUrl();
  try {
    await fetch(`${API_URL}/api/notifications/read-all`, {
      method: 'PUT',
      headers: await headers(),
    });
  } catch {}
};

export const apiDeleteNotification = async (id: string | number) => {
  const token = await getToken();
  if (!token) return;
  const API_URL = await getApiUrl();
  try {
    await fetch(`${API_URL}/api/notifications/${id}`, {
      method: 'DELETE',
      headers: await headers(),
    });
  } catch {}
};

export const apiClearNotifications = async () => {
  const token = await getToken();
  if (!token) return;
  const API_URL = await getApiUrl();
  try {
    await fetch(`${API_URL}/api/notifications`, {
      method: 'DELETE',
      headers: await headers(),
    });
  } catch {}
};

// ─── RECENT ACTIVITIES ─────────────────────────────────────────
export const apiGetActivities = async () => {
  const token = await getToken();
  if (!token) return [];
  const API_URL = await getApiUrl();
  try {
    const res = await fetch(`${API_URL}/api/activities`, {
      headers: await headers(),
    });
    const json = await res.json().catch(() => []);
    if (!res.ok) return [];
    return json;
  } catch {
    return [];
  }
};

// ─── REPORTS ──────────────────────────────────────────────────
export const apiGetReports = async () => {
  const token = await getToken();
  if (!token) return { total_scans: 0, scans: [] };
  const API_URL = await getApiUrl();
  try {
    const res = await fetch(`${API_URL}/api/reports`, {
      headers: await headers(),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        await clearStaleSession();
        return { total_scans: 0, scans: [] };
      }
      throw new Error(json.error || "Failed to load reports");
    }
    return json;
  } catch (err: any) {
    if (err.message === "Invalid token" || err.message === "Token expired" || err.message === "Token missing") {
      await clearStaleSession();
      return { total_scans: 0, scans: [] };
    }
    throw err;
  }
};

// ─── AI DETECT ────────────────────────────────────────────────
export const apiDetect = async (base64Image: string, module: string = "auto") => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64Image, module }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Detection failed");
  return json;
};

// ─── GRAD-CAM HEATMAP ─────────────────────────────────────────
export const apiGetGradcam = async (base64Image: string, module: string = "eye") => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/gradcam`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64Image, module }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to generate Grad-CAM visualization");
  return json;
};

// ─── FARMS ────────────────────────────────────────────────────
export const apiGetFarms = async () => {
  const token = await getToken();
  if (!token) return [];
  const API_URL = await getApiUrl();
  try {
    const res = await fetch(`${API_URL}/api/farms`, {
      headers: await headers(),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        await clearStaleSession();
        return [];
      }
      throw new Error(json.error || "Failed to load farms");
    }
    return json;
  } catch (err: any) {
    if (err.message === "Invalid token" || err.message === "Token expired" || err.message === "Token missing") {
      await clearStaleSession();
      return [];
    }
    throw err;
  }
};

export const apiCreateFarm = async (data: {
  farm_name: string;
  farm_location?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
}) => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/farms`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

export const apiUpdateFarm = async (
  farm_id: number,
  data: {
    farm_name?: string;
    farm_location?: string;
    description?: string;
    latitude?: number;
    longitude?: number;
  },
) => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/farms/${farm_id}`, {
    method: "PUT",
    headers: await headers(),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

export const apiGetFarm = async (farm_id: number) => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/farms/${farm_id}`, {
    headers: await headers(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

export const apiDeleteFarm = async (farm_id: number) => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/farms/${farm_id}`, {
    method: "DELETE",
    headers: await headers(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

export const apiJoinFarm = async (farm_code: string) => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/farms/join`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify({ farm_code }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

export const apiGetFarmMembers = async (farm_id: number) => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/farms/${farm_id}/members`, {
    headers: await headers(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

export const apiRemoveMember = async (farm_id: number, member_id: number) => {
  const API_URL = await getApiUrl();
  const res = await fetch(
    `${API_URL}/api/farms/${farm_id}/members/${member_id}`,
    { method: "DELETE", headers: await headers() },
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

export const apiCreateCaretaker = async (data: {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  phone_number?: string;
  farm_id: number;
}) => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/auth/create-caretaker`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

// ─── TASKS ────────────────────────────────────────────────────
export const apiGetTasks = async (farm_id?: number) => {
  const token = await getToken();
  if (!token) return [];
  const API_URL = await getApiUrl();
  const url = farm_id ? `${API_URL}/api/tasks?farm_id=${farm_id}` : `${API_URL}/api/tasks`;
  const res = await fetch(url, { headers: await headers() });
  const json = await res.json().catch(() => []);
  if (!res.ok) throw new Error(json.error || "Failed to load tasks");
  return json;
};

export const apiCreateTask = async (data: {
  farm_id?: number;
  title: string;
  description?: string;
  note?: string;
  date: string;
  time?: string;
  color?: string;
  icon?: string;
  assigned_to_user_id?: number | null;
}) => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/tasks`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to create task");
  return json;
};

export const apiToggleCompleteTask = async (taskId: number | string) => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/tasks/${taskId}/complete`, {
    method: "PUT",
    headers: await headers(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to complete task");
  return json;
};

export const apiUpdateTask = async (
  taskId: number | string,
  data: {
    title?: string;
    description?: string;
    note?: string;
    date?: string;
    time?: string;
    color?: string;
    icon?: string;
    assigned_to_user_id?: number | null;
  }
) => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/tasks/${taskId}`, {
    method: "PUT",
    headers: await headers(),
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to update task");
  return json;
};

export const apiDeleteTask = async (taskId: number | string) => {
  const API_URL = await getApiUrl();
  const res = await fetch(`${API_URL}/api/tasks/${taskId}`, {
    method: "DELETE",
    headers: await headers(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to delete task");
  return json;
};
