import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── CHANGE THIS TO YOUR LAPTOP IP ───────────────────────────
const API_URL = "http://192.168.1.11:5000";
// ─────────────────────────────────────────────────────────────

const getToken = async () => AsyncStorage.getItem("token");

const headers = async () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${await getToken()}`,
});

// ─── AUTH ─────────────────────────────────────────────────────
export const apiSignup = async (data: {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  phone_number?: string;
  farm_name?: string;
}) => {
  const res = await fetch(`${API_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Signup failed");
  await AsyncStorage.setItem("token", json.token);
  await AsyncStorage.setItem("user_id", String(json.user_id));
  return json;
};

export const apiLogin = async (email: string, password: string) => {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Login failed");
  await AsyncStorage.setItem("token", json.token);
  await AsyncStorage.setItem("user_id", String(json.user.id));
  await AsyncStorage.setItem("userData", JSON.stringify(json.user));
  return json;
};

export const apiLogout = async () => {
  await AsyncStorage.multiRemove(["token", "user_id", "userData"]);
};

export const apiGetProfile = async () => {
  const res = await fetch(`${API_URL}/api/auth/profile`, {
    headers: await headers(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

export const apiUpdateProfile = async (data: any) => {
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
export const apiGetChickens = async () => {
  const res = await fetch(`${API_URL}/api/chickens`, {
    headers: await headers(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

export const apiCreateChicken = async (data: {
  qr_code: string;
  chicken_name: string;
  breed?: string;
  age?: string;
  weight?: string;
  color?: string;
  location?: string;
  photo_url?: string;
}) => {
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
  const res = await fetch(`${API_URL}/api/chickens/${id}`, {
    headers: await headers(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

export const apiDeleteChicken = async (id: string) => {
  const res = await fetch(`${API_URL}/api/chickens/${id}`, {
    method: "DELETE",
    headers: await headers(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

export const apiGetChickenHistory = async (id: string) => {
  const res = await fetch(`${API_URL}/api/chickens/${id}/history`, {
    headers: await headers(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

export const apiGetStats = async () => {
  const res = await fetch(`${API_URL}/api/stats`, { headers: await headers() });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

// ─── SCANS ────────────────────────────────────────────────────
export const apiSaveScan = async (data: {
  chicken_id: number;
  image_type: string;
  predicted_condition: string;
  confidence_score: number;
  severity_level: string;
  symptoms: string[];
  all_predictions: any[];
}) => {
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
  const res = await fetch(`${API_URL}/api/alerts`, {
    headers: await headers(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

export const apiMarkAllAlertsRead = async () => {
  const res = await fetch(`${API_URL}/api/alerts/read-all`, {
    method: "PUT",
    headers: await headers(),
  });
  return res.json();
};

// ─── REPORTS ──────────────────────────────────────────────────
export const apiGetReports = async () => {
  const res = await fetch(`${API_URL}/api/reports`, {
    headers: await headers(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};

// ─── AI DETECT (existing) ─────────────────────────────────────
export const apiDetect = async (base64Image: string) => {
  const res = await fetch(`${API_URL}/api/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64Image }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
};
