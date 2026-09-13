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
  // Holds a live reference to the Leaflet map instance once it mounts, so
  // the "My Location" button (rendered outside react-leaflet's own tree)
  // can call flyTo/setView on it directly.
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [locating, setLocating] = useState(false);

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

  const handleMyLocation = () => {
    if (!mapInstance || typeof navigator === 'undefined' || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        mapInstance.flyTo([pos.coords.latitude, pos.coords.longitude], 15, { duration: 1 });
      },
      () => {
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  if (!mods) {
    return (
      <View style={[styles.container, styles.loadingContainer, { height }]}>
        <Text style={styles.loadingText}>Loading map…</Text>
      </View>
    );
  }

  const { L, MapContainer, Marker, Popup, TileLayer, useMap } = mods;
  const pinnedFarms = farms.filter((f: any) => f.latitude != null && f.longitude != null);
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
    html: `<div style="width:30px;height:30px;border-radius:50%;background:${primaryColor};border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.3);"><div style="width:10px;height:10px;background:#fff;border-radius:2px;"></div></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

  function ForceInitialView() {
    const map = useMap();
    useEffect(() => {
      const timer = setTimeout(() => {
        map.invalidateSize();
        map.setView(targetCenter, targetZoom);
      }, 100);
      return () => clearTimeout(timer);
    }, [map]);
    return null;
  }

  // Grabs the Leaflet map instance the moment react-leaflet mounts it,
  // purely so the external "My Location" button can drive it.
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
        minZoom={11}
        maxZoom={18}
        maxBounds={DAVAO_BOUNDS}
        maxBoundsViscosity={1.0}
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
        style={styles.myLocationButton}
        onPress={handleMyLocation}
        activeOpacity={0.8}
      >
        <Text style={[styles.myLocationDot, { color: primaryColor }]}>◎</Text>
        <Text style={[styles.myLocationText, { color: primaryColor }]}>
          {locating ? 'Locating…' : 'My Location'}
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
  myLocationButton: {
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
  myLocationDot: { fontSize: 13, fontWeight: '700' },
  myLocationText: { fontSize: 12, fontWeight: '700' },
});