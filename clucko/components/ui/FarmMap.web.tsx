import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export const DAVAO_CITY_CENTER: [number, number] = [7.0731, 125.6128];
export const DAVAO_BOUNDS: [[number, number], [number, number]] = [
  [6.95, 125.30],
  [7.35, 125.75],
];

export function useLeafletCss() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const id = 'leaflet-css-cdn';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
  }, []);
}

interface FarmMapProps {
  farms: { id: string; name?: string; farm_name?: string; latitude?: number; longitude?: number }[];
  onMarkerPress?: (farmId: string) => void;
  height?: number;
  primaryColor?: string;
  initialCenter?: [number, number];
  initialZoom?: number;
}

export default function FarmMap({
  farms,
  onMarkerPress,
  height = 220,
  primaryColor = '#2E7D32',
  initialCenter,
  initialZoom,
}: FarmMapProps) {
  useLeafletCss();
  const [mods, setMods] = useState<any>(null);
  const [mapInstance, setMapInstance] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    if (typeof window === 'undefined') return;
    Promise.all([import('leaflet'), import('react-leaflet')]).then(([leafletMod, reactLeafletMod]) => {
      if (mounted) setMods({ L: leafletMod.default, ...reactLeafletMod });
    });
    return () => {
      mounted = false;
    };
  }, []);

  const pinnedFarms = farms.filter((f: any) => f.latitude != null && f.longitude != null);

  const handleFarmLocations = () => {
    if (!mapInstance || !mods?.L) return;
    const { L } = mods;
    if (pinnedFarms.length === 1) {
      mapInstance.flyTo([pinnedFarms[0].latitude, pinnedFarms[0].longitude], 15, { duration: 0.8 });
    } else if (pinnedFarms.length >= 2) {
      const bounds = L.latLngBounds(pinnedFarms.map((f: any) => [f.latitude, f.longitude]));
      mapInstance.flyToBounds(bounds.pad(0.2), { duration: 0.8 });
    } else {
      mapInstance.flyTo(DAVAO_CITY_CENTER, 12, { duration: 0.8 });
    }
  };

  if (!mods) {
    return (
      <View style={[styles.container, styles.loadingContainer, { height }]}>
        <Text style={styles.loadingText}>Loading map…</Text>
      </View>
    );
  }

  const { L, MapContainer, Marker, Popup, TileLayer, useMap } = mods;
  const targetCenter: [number, number] =
    initialCenter && initialCenter[0] != null && initialCenter[1] != null
      ? initialCenter
      : pinnedFarms.length === 1 && pinnedFarms[0].latitude != null && pinnedFarms[0].longitude != null
      ? [pinnedFarms[0].latitude!, pinnedFarms[0].longitude!]
      : DAVAO_CITY_CENTER;
  const targetZoom: number =
    initialZoom || (pinnedFarms.length === 1 || initialCenter ? 15 : 12);

  const icon = L.divIcon({
    className: '',
    html: `<div style="width:34px;height:34px;border-radius:50%;background:#2E7D32;border:2.5px solid #ffffff;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 6px rgba(0,0,0,0.35);"><svg width="22" height="22" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M 19 22 L 38 6 L 57 22" stroke="#ffffff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M 23 25 L 38 13 L 53 25" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="24" y="24" width="28" height="21" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><rect x="33" y="28" width="10" height="10" stroke="#ffffff" stroke-width="2"/><line x1="38" y1="28" x2="38" y2="38" stroke="#ffffff" stroke-width="1.8"/><line x1="33" y1="33" x2="43" y2="33" stroke="#ffffff" stroke-width="1.8"/><rect x="27" y="45" width="4.5" height="10" stroke="#ffffff" stroke-width="2"/><rect x="44.5" y="45" width="4.5" height="10" stroke="#ffffff" stroke-width="2"/><line x1="7" y1="55" x2="24" y2="37" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/><line x1="7" y1="52" x2="11.5" y2="56.5" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/><line x1="11.5" y1="47.5" x2="16" y2="52" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="43" x2="20.5" y2="47.5" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/><line x1="20.5" y1="38.5" x2="25" y2="43" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/></svg></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17],
  });

  function ForceInitialView() {
    const map = useMap();
    useEffect(() => {
      const timer = setTimeout(() => {
        map.invalidateSize();
        if (pinnedFarms.length === 1) {
          map.setView([pinnedFarms[0].latitude!, pinnedFarms[0].longitude!], 15);
        } else if (pinnedFarms.length >= 2) {
          const bounds = L.latLngBounds(pinnedFarms.map((f: any) => [f.latitude, f.longitude]));
          map.fitBounds(bounds.pad(0.2));
        } else {
          map.setView(targetCenter, targetZoom);
        }
      }, 100);
      return () => clearTimeout(timer);
    }, [map]);
    return null;
  }

  function CaptureMapInstance() {
    const map = useMap();
    useEffect(() => {
      setMapInstance(map);
    }, [map]);
    return null;
  }

  return (
    <View style={[styles.container, { height }]}>
      <MapContainer
        center={targetCenter}
        zoom={targetZoom}
        minZoom={4}
        maxZoom={18}
        style={{ width: '100%', height: '100%' }}
      >
        <ForceInitialView />
        <CaptureMapInstance />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {pinnedFarms.map((farm: any) => (
          <Marker
            key={farm.id}
            position={[farm.latitude, farm.longitude]}
            icon={icon}
            eventHandlers={{ click: () => onMarkerPress?.(farm.id) }}
          >
            <Popup>{farm.name || farm.farm_name || 'Farm'}</Popup>
          </Marker>
        ))}
      </MapContainer>

      <TouchableOpacity
        style={styles.farmLocationsButton}
        onPress={handleFarmLocations}
        activeOpacity={0.8}
      >
        <View style={[styles.farmLocationsDot, { backgroundColor: primaryColor }]} />
        <Text style={[styles.farmLocationsText, { color: primaryColor }]}>
          Farm Locations
        </Text>
      </TouchableOpacity>

      {pinnedFarms.length === 0 && (
        <View style={styles.emptyOverlay} pointerEvents="none">
          <Text style={styles.emptyOverlayText}>No farm locations pinned yet</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', borderRadius: 16, overflow: 'hidden', position: 'relative' },
  loadingContainer: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#eee' },
  loadingText: { fontSize: 12, color: '#777' },
  emptyOverlay: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 1000,
  },
  emptyOverlayText: { color: '#fff', fontSize: 11 },
  farmLocationsButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  farmLocationsDot: { width: 7, height: 7, borderRadius: 3.5 },
  farmLocationsText: { fontSize: 12, fontWeight: '700' },
});