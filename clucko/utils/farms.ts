import { apiCreateFarm, apiGetFarms } from "../lib/api";
import { checkIsGuestMode, GUEST_SAMPLE_FARMS } from "./guestMode";

export interface Farm {
  id: string;
  name: string;
  farm_name?: string;
  location?: string;
  dateCreated: string;
  capacity?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
}

// Single source of truth for farm data — used by the Add Chicken form,
// Manage Farms list, and the Farm detail screen, so a farm created from
// any of them shows up everywhere else immediately.
//
// Guest mode NEVER hits the real backend — it always gets the static
// sample farms instead, so a real account's farms can never leak into a
// guest session on the same device.
export const loadFarms = async (): Promise<Farm[]> => {
  try {
    const guest = await checkIsGuestMode();
    if (guest) {
      return GUEST_SAMPLE_FARMS;
    }

    const data = await apiGetFarms();
    return (data || []).map((f: any) => ({
      id: String(f.id),
      name: f.name || f.farm_name || "Gamefarm",
      farm_name: f.farm_name || f.name || "Gamefarm",
      location: f.farm_location || f.location || "",
      dateCreated: f.created_at ? String(f.created_at).split("T")[0] : "",
      description: f.description || "",
      latitude: f.latitude,
      longitude: f.longitude,
    }));
  } catch (error) {
    console.error("Error loading farms:", error);
    return [];
  }
};

export const addFarm = async (
  name: string,
  location?: string,
): Promise<Farm> => {
  const created = await apiCreateFarm({
    farm_name: name.trim(),
    farm_location: location?.trim() || "",
  });
  return {
    id: String(created.id),
    name: created.farm_name || created.name || name.trim(),
    farm_name: created.farm_name || created.name || name.trim(),
    location: created.farm_location || created.location || location?.trim() || "",
    dateCreated: created.created_at
      ? String(created.created_at).split("T")[0]
      : "",
  };
};

export const getFarmName = (farms: Farm[], farmId?: string | number | null): string => {
  if (!farmId) return "Unassigned";
  const farm = (farms || []).find((f) => String(f.id) === String(farmId));
  return farm ? (farm.name || farm.farm_name || "Gamefarm") : "Unassigned";
};
