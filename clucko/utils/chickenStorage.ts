import {
  apiCreateChicken,
  apiDeleteChicken,
  apiGetChickens,
  apiUpdateChicken,
} from "../lib/api";

// Safely parses whatever date format the backend returns (ISO string,
// "Wed, 02 Sep 2026 06:35:00 GMT", MySQL timestamp, etc.) into a plain
// YYYY-MM-DD string. Returns '' if the value is missing or unparseable,
// so callers can fall back to "N/A" instead of showing "Invalid Date".
const parseDateSafe = (raw: any): string => {
  if (!raw) return "";
  const d = new Date(raw);
  return isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
};

// Converts a backend chicken row (chicken_name, qr_code, farm_id, photo_url,
// status, created_at, ...) into the shape every screen in this app already
// expects (name, chickenId, farmId, photo, status, healthStatus, lastScan).
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
    // NOTE: lastScan/dateAdded here are both derived from the chicken
    // record's created_at — this is "when the chicken profile was added",
    // NOT "when it was last scanned". The chicken detail screen
    // (app/chicken/[id].tsx) overrides the displayed "Last Check" value
    // using the real scan history from apiGetChickenHistory() instead of
    // this field, since a chicken can be created without ever being
    // scanned, or scanned again well after creation.
    lastScan: dateStr,
    dateAdded: dateStr,
  };
};

// Every screen (Home, Chickens, Reports, chicken detail) reads through
// this — it now always reflects exactly what the backend returns for the
// logged-in account's role: owner sees every chicken across their farms,
// caretaker sees only chickens in the farm(s) they're assigned to. No
// per-account local caching, no hardcoded data, nothing to go stale.
export const loadChickensForCurrentUser = async (): Promise<any[] | null> => {
  try {
    const data = await apiGetChickens();
    return (data || []).map(mapChickenFromApi);
  } catch (error) {
    console.error("Error loading chickens:", error);
    return null;
  }
};

// Generates a reasonably-unique QR/ID code client-side (timestamp + random
// suffix) since the backend requires qr_code to be provided and unique.
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
// AddChickenModal. Returns the newly-created record already mapped to
// this app's Bird shape, and the caller should reload the list afterward
// (loadChickensForCurrentUser) rather than trust any local array.
export const addChickenForCurrentUser = async (chicken: {
  name: string;
  photo?: string | null;
  farmId?: string | null;
}): Promise<any> => {
  const created = await apiCreateChicken({
    chicken_name: chicken.name,
    qr_code: generateChickenCode(),
    farm_id: chicken.farmId ? Number(chicken.farmId) : undefined,
    photo_url: chicken.photo || "",
  });
  return mapChickenFromApi(created);
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
  return mapChickenFromApi(updated);
};

export const deleteChickenForCurrentUser = async (
  id: string,
): Promise<void> => {
  await apiDeleteChicken(String(id));
};
