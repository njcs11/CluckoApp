import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  apiCreateChicken,
  apiDeleteChicken,
  apiGetChickens,
  apiUpdateChicken,
} from "../lib/api";

const CACHE_KEY = "cached_chickens_list";

// Safely parses whatever date format the backend returns (ISO string,
// "Wed, 02 Sep 2026 06:35:00 GMT", MySQL timestamp, etc.) into a plain
// YYYY-MM-DD string without timezone day-shift artifacts.
const parseDateSafe = (raw: any): string => {
  if (!raw) return "";
  if (typeof raw === "string") {
    const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
    const cleaned = raw.replace(/\s*GMT$/i, "").replace(/Z$/i, "");
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  }
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Converts a backend chicken row into the shape every screen in this app expects.
const mapChickenFromApi = (c: any) => {
  const rawStatus = (c.status || "HEALTHY").toUpperCase();
  const statusColor =
    rawStatus === "WARNING"
      ? "#FF9800"
      : rawStatus === "CRITICAL"
        ? "#f44336"
        : "#4CAF50";
  const healthStatus = rawStatus.charAt(0) + rawStatus.slice(1).toLowerCase();
  const dateStr = parseDateSafe(c.created_at);

  return {
    id: String(c.id),
    chickenId: c.qr_code,
    name: c.chicken_name,
    farmId: c.farm_id != null ? String(c.farm_id) : null,
    farmName: c.farm_name || null,
    photo: c.photo_url || null,
    status: rawStatus,
    statusColor,
    healthStatus,
    lastScan: dateStr,
    dateAdded: dateStr,
    addedByName: c.added_by_name || c.addedByName || null,
    addedByRole: c.added_by_role || c.addedByRole || null,
    qrCode: c.qr_code,
  };
};

export const getCachedChickens = async (): Promise<any[] | null> => {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Error reading cached chickens:", e);
  }
  return null;
};

// Every screen (Home, Chickens, Reports, chicken detail) reads through
// this — loads fresh from backend, persists to local cache, and falls back
// to the cache instantly if the network fails or times out.
export const loadChickensForCurrentUser = async (): Promise<any[] | null> => {
  try {
    const data = await apiGetChickens();
    if (Array.isArray(data)) {
      const mapped = data.map(mapChickenFromApi);
      try {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(mapped));
      } catch (err) {
        console.warn("Error saving chickens to cache:", err);
      }
      return mapped;
    }
    const cached = await getCachedChickens();
    return cached;
  } catch (error) {
    console.warn("Network error loading chickens, falling back to local cache:", error);
    const cached = await getCachedChickens();
    return cached;
  }
};

// Computes the next unique Chicken ID/QR code scoped strictly to the specified farm.
// Looks through existing chickens on that farm for patterns like CK-001, CK-002, CH001, etc.
// Finds the highest number and increments it, while guaranteeing no collision within that farm.
export const generateNextChickenCode = (
  existingChickens: any[] = [],
  farmId?: string | number | null
): string => {
  const farmKey = farmId != null && farmId !== '' ? String(farmId) : null;

  // Filter chickens belonging to the specified farm (or unassigned if null)
  const farmChickens = (existingChickens || []).filter((c: any) => {
    const cFarm = c.farm_id != null ? String(c.farm_id) : c.farmId != null ? String(c.farmId) : null;
    return cFarm === farmKey;
  });

  const existingCodes = new Set<string>();
  const numbers: number[] = [];

  for (const c of farmChickens) {
    const code = (c.qr_code || c.chickenId || '').trim();
    if (!code) continue;
    existingCodes.add(code.toUpperCase());

    const match = code.match(/(?:CK|CH)[-_]?(\d+)/i);
    if (match && match[1]) {
      const n = parseInt(match[1], 10);
      if (!isNaN(n)) numbers.push(n);
    }
  }

  let nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  let candidate = `CK-${String(nextNum).padStart(3, '0')}`;

  while (existingCodes.has(candidate.toUpperCase())) {
    nextNum++;
    candidate = `CK-${String(nextNum).padStart(3, '0')}`;
  }

  return candidate;
};

// Generates a reasonably-unique fallback QR/ID code client-side
const generateChickenCode = () => {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 36 ** 2)
    .toString(36)
    .toUpperCase()
    .padStart(2, "0");
  return `CK-${stamp}${rand}`;
};

// Creates a chicken on the backend. `chicken` is expected to carry at
// least { name, photo, farmId } — matching ChickenFormData from
// AddChickenModal. If chickenId / qr_code is provided, that exact code
// is preserved so the generated/previewed QR code matches what is saved.
export const addChickenForCurrentUser = async (chicken: {
  name: string;
  photo?: string | null;
  farmId?: string | null;
  chickenId?: string | null;
  qr_code?: string | null;
}): Promise<any> => {
  const qrCode = chicken.qr_code || chicken.chickenId || generateChickenCode();
  const created = await apiCreateChicken({
    chicken_name: chicken.name,
    qr_code: qrCode,
    farm_id: chicken.farmId ? Number(chicken.farmId) : undefined,
    photo_url: chicken.photo || "",
  });
  const mapped = mapChickenFromApi(created);
  try {
    const cached = await getCachedChickens();
    const nextList = [mapped, ...(cached || []).filter((c: any) => String(c.id) !== String(mapped.id))];
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(nextList));
  } catch (e) {}
  return mapped;
};

// Updates a single chicken by id. Pass only the fields that changed —
// name, farmId, and/or photo.
export const updateChickenForCurrentUser = async (
  id: string,
  updates: { name?: string; photo?: string | null; farmId?: string | null },
): Promise<any> => {
  const payload: any = {};
  if (updates.name !== undefined) payload.chicken_name = updates.name;
  if (updates.photo !== undefined) payload.photo_url = updates.photo || "";
  if (updates.farmId !== undefined)
    payload.farm_id = updates.farmId ? Number(updates.farmId) : null;

  const updated = await apiUpdateChicken(id, payload);
  const mapped = mapChickenFromApi(updated);
  try {
    const cached = await getCachedChickens();
    if (cached) {
      const nextList = cached.map((c: any) => (String(c.id) === String(mapped.id) ? { ...c, ...mapped } : c));
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(nextList));
    }
  } catch (e) {}
  return mapped;
};

export const deleteChickenForCurrentUser = async (
  id: string,
): Promise<void> => {
  await apiDeleteChicken(String(id));
  try {
    const cached = await getCachedChickens();
    if (cached) {
      const nextList = cached.filter((c: any) => String(c.id) !== String(id));
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(nextList));
    }
  } catch (e) {}
};
