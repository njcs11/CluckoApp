import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { DAVAO_BOUNDS, DAVAO_CITY_CENTER } from './FarmMap.web';

interface LocationPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (coords: { latitude: number; longitude: number }) => void;
  initialCoords?: { latitude: number; longitude: number };
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
          html: '<div style="width:30px;height:30px;border-radius:50%;background:#2E7D32;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.3);"><div style="width:10px;height:10px;background:#fff;border-radius:2px;"></div></div>',
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
  const [selected, setSelected] = useState<{ latitude: number; longitude: number } | null>(initialCoords || null);
  const html = useMemo(() => buildPickerHtml(initialCoords), [visible]);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'locationPicked') {
        setSelected({ latitude: data.latitude, longitude: data.longitude });
      }
    } catch (e) {
      // ignore
    }
  };

  const handleConfirm = () => {
    if (selected) {
      onConfirm(selected);
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
              <Ionicons name="close-circle" size={30} color="#2E7D32" />
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

          <TouchableOpacity
            style={[styles.confirmButton, !selected && styles.confirmButtonDisabled]}
            onPress={handleConfirm}
            disabled={!selected}
          >
            <LinearGradient colors={['#2E7D32', '#1B5E20']} style={styles.confirmGradient}>
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
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 24, height: '75%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2E7D32' },
  hint: { fontSize: 12, color: '#666', marginBottom: 14 },
  mapWrapper: { flex: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  webview: { flex: 1 },
  confirmButton: { borderRadius: 30, overflow: 'hidden' },
  confirmButtonDisabled: { opacity: 0.5 },
  confirmGradient: { paddingVertical: 15, alignItems: 'center' },
  confirmText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});
