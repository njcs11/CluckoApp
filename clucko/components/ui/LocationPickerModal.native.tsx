import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { DAVAO_BOUNDS, DAVAO_CITY_CENTER } from './FarmMap.web';

export interface PinnedLocation {
  latitude: number;
  longitude: number;
  address: string;
}

interface LocationPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (coords: PinnedLocation) => void;
  initialCoords?: { latitude: number; longitude: number; address?: string };
}

const DAVAO_AREAS = [
  { name: 'Poblacion, Davao City', lat: 7.0644, lng: 125.6078 },
  { name: 'Talomo, Davao City', lat: 7.0485, lng: 125.5562 },
  { name: 'Matina, Talomo, Davao City', lat: 7.0531, lng: 125.5812 },
  { name: 'Catalunan Grande, Talomo, Davao City', lat: 7.0819, lng: 125.5378 },
  { name: 'Agdao, Davao City', lat: 7.0825, lng: 125.6238 },
  { name: 'Buhangin, Davao City', lat: 7.1142, lng: 125.6165 },
  { name: 'Cabantian, Buhangin, Davao City', lat: 7.1364, lng: 125.6194 },
  { name: 'Sasa, Buhangin, Davao City', lat: 7.1228, lng: 125.6567 },
  { name: 'Panacan, Bunawan, Davao City', lat: 7.1562, lng: 125.6563 },
  { name: 'Tibungco, Bunawan, Davao City', lat: 7.1931, lng: 125.6531 },
  { name: 'Bunawan, Davao City', lat: 7.2338, lng: 125.6432 },
  { name: 'Lasang, Bunawan, Davao City', lat: 7.2692, lng: 125.6639 },
  { name: 'Paquibato, Davao City', lat: 7.3385, lng: 125.5542 },
  { name: 'Calinan, Davao City', lat: 7.1868, lng: 125.4518 },
  { name: 'Baguio (Malagos), Davao City', lat: 7.1755, lng: 125.4085 },
  { name: 'Marilog, Davao City', lat: 7.3625, lng: 125.2785 },
  { name: 'Mintal, Tugbok, Davao City', lat: 7.0908, lng: 125.5025 },
  { name: 'Tugbok, Davao City', lat: 7.0865, lng: 125.4875 },
  { name: 'Bago Oshiro, Tugbok, Davao City', lat: 7.0672, lng: 125.5056 },
  { name: 'Toril, Davao City', lat: 7.0185, lng: 125.4982 },
  { name: 'Eden, Toril, Davao City', lat: 7.0286, lng: 125.4325 },
];

export function fallbackDavaoAddress(lat: number, lng: number): string {
  let best = 'Davao City';
  let minD2 = Number.POSITIVE_INFINITY;
  for (const area of DAVAO_AREAS) {
    const d2 = (lat - area.lat) * (lat - area.lat) + (lng - area.lng) * (lng - area.lng);
    if (d2 < minD2) {
      minD2 = d2;
      best = area.name;
    }
  }
  return best;
}

export async function reverseGeocodeDavao(lat: number, lng: number): Promise<string> {
  const fallback = fallbackDavaoAddress(lat, lng);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!res.ok) return fallback;
    const data = await res.json();
    const addr = data?.address || {};
    const parts: string[] = [];
    const localName =
      addr.suburb ||
      addr.village ||
      addr.neighbourhood ||
      addr.quarter ||
      addr.hamlet ||
      addr.road ||
      addr.town;
    const districtName = addr.city_district || addr.municipality || addr.county;
    if (localName) parts.push(localName);
    if (districtName && districtName !== localName && !districtName.toLowerCase().includes('davao')) {
      parts.push(districtName);
    }
    parts.push('Davao City');
    if (parts.length >= 2) {
      return parts.join(', ');
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function buildPickerHtml(initial?: { latitude: number; longitude: number }) {
  const initMarker = initial
    ? `marker = L.marker([${initial.latitude}, ${initial.longitude}], { icon: pinIcon }).addTo(map);`
    : '';
  const centerLat = initial ? initial.latitude : DAVAO_CITY_CENTER[0];
  const centerLng = initial ? initial.longitude : DAVAO_CITY_CENTER[1];
  const initialZoom = initial ? 15 : 12;
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style>html, body, #map { height: 100%; margin: 0; padding: 0; }</style>
    </head>
    <body>
      <div id="map"></div>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <script>
        var davaoBounds = [[${DAVAO_BOUNDS[0][0]}, ${DAVAO_BOUNDS[0][1]}], [${DAVAO_BOUNDS[1][0]}, ${DAVAO_BOUNDS[1][1]}]];
        var map = L.map('map', {
          center: [${centerLat}, ${centerLng}],
          zoom: ${initialZoom},
          minZoom: 11,
          maxBounds: davaoBounds,
          maxBoundsViscosity: 1.0,
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        var pinIcon = L.divIcon({
          className: '',
          html: '<div style="width:30px;height:30px;border-radius:50%;background:#2D5541;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.3);"><div style="width:10px;height:10px;background:#fff;border-radius:2px;"></div></div>',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });

        var marker = null;
        ${initMarker}

        map.on('click', function(e) {
          if (marker) { map.removeLayer(marker); }
          marker = L.marker(e.latlng, { icon: pinIcon }).addTo(map);
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'locationPicked',
            latitude: e.latlng.lat,
            longitude: e.latlng.lng
          }));
        });
      </script>
    </body>
    </html>
  `;
}

export default function LocationPickerModal({ visible, onClose, onConfirm, initialCoords }: LocationPickerModalProps) {
  const [selected, setSelected] = useState<{ latitude: number; longitude: number } | null>(
    initialCoords ? { latitude: initialCoords.latitude, longitude: initialCoords.longitude } : null
  );
  const [resolvedAddress, setResolvedAddress] = useState<string>(
    initialCoords?.address ||
      (initialCoords ? fallbackDavaoAddress(initialCoords.latitude, initialCoords.longitude) : '')
  );
  const [resolvingAddress, setResolvingAddress] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (initialCoords) {
      setSelected({ latitude: initialCoords.latitude, longitude: initialCoords.longitude });
      setResolvedAddress(
        initialCoords.address || fallbackDavaoAddress(initialCoords.latitude, initialCoords.longitude)
      );
    } else {
      setSelected(null);
      setResolvedAddress('');
    }
  }, [visible, initialCoords]);

  const html = useMemo(() => buildPickerHtml(initialCoords), [visible]);

  const handleMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'locationPicked') {
        const lat = Number(data.latitude);
        const lng = Number(data.longitude);
        setSelected({ latitude: lat, longitude: lng });
        setResolvedAddress(fallbackDavaoAddress(lat, lng));
        setResolvingAddress(true);
        const addr = await reverseGeocodeDavao(lat, lng);
        setResolvedAddress(addr);
        setResolvingAddress(false);
      }
    } catch {
      setResolvingAddress(false);
    }
  };

  const handleConfirm = () => {
    if (selected) {
      const finalAddress =
        resolvedAddress.trim() || fallbackDavaoAddress(selected.latitude, selected.longitude);
      onConfirm({
        latitude: selected.latitude,
        longitude: selected.longitude,
        address: finalAddress,
      });
      onClose();
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Pin Farm Location</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close-circle" size={30} color="#2D5541" />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Tap anywhere on the map (within Davao City) to drop a pin.</Text>

          <View style={styles.mapWrapper}>
            <WebView
              originWhitelist={['*']}
              source={{ html }}
              style={styles.webview}
              onMessage={handleMessage}
              javaScriptEnabled
              domStorageEnabled
            />
          </View>

          {selected && (
            <View style={styles.addressBanner}>
              <Ionicons name="location" size={18} color="#2D5541" />
              <View style={{ flex: 1 }}>
                <Text style={styles.addressLabel}>Pinned Location</Text>
                <Text style={styles.addressValue} numberOfLines={1}>
                  {resolvedAddress || fallbackDavaoAddress(selected.latitude, selected.longitude)}
                </Text>
              </View>
              {resolvingAddress && <ActivityIndicator size="small" color="#2D5541" />}
            </View>
          )}

          <TouchableOpacity
            style={[styles.confirmButton, !selected && styles.confirmButtonDisabled]}
            onPress={handleConfirm}
            disabled={!selected}
          >
            <LinearGradient colors={['#2D5541', '#1B382B']} style={styles.confirmGradient}>
              <Text style={styles.confirmText}>
                {selected ? 'Confirm Location' : 'Tap the map to set a location'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 24, height: '78%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2D5541' },
  hint: { fontSize: 12, color: '#666', marginBottom: 14 },
  mapWrapper: { flex: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  webview: { flex: 1 },
  addressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F1F6F3',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#D6E5DC',
  },
  addressLabel: { fontSize: 11, color: '#5A7365', fontWeight: '600' },
  addressValue: { fontSize: 13.5, color: '#1B382B', fontWeight: '700' },
  confirmButton: { borderRadius: 30, overflow: 'hidden' },
  confirmButtonDisabled: { opacity: 0.5 },
  confirmGradient: { paddingVertical: 15, alignItems: 'center' },
  confirmText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});
