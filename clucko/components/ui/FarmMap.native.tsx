import * as Location from 'expo-location';
import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';

export const DAVAO_CITY_CENTER: [number, number] = [7.0731, 125.6128];
export const DAVAO_BOUNDS: [[number, number], [number, number]] = [
  [6.95, 125.2],
  [7.45, 125.7],
];

interface FarmMapProps {
  farms: { id: string; name?: string; farm_name?: string; latitude?: number; longitude?: number }[];
  onMarkerPress?: (farmId: string) => void;
  height?: number;
  primaryColor?: string;
  initialCenter?: [number, number];
  initialZoom?: number;
}

function buildHtml(
  farms: FarmMapProps['farms'],
  primaryColor: string,
  initialCenter?: [number, number],
  initialZoom?: number
) {
  const pinned = farms.filter((f) => f.latitude != null && f.longitude != null);

  // Determine center & zoom
  let centerLat = DAVAO_CITY_CENTER[0];
  let centerLng = DAVAO_CITY_CENTER[1];
  let zoomLevel = 12;

  if (initialCenter && initialCenter[0] != null && initialCenter[1] != null) {
    centerLat = initialCenter[0];
    centerLng = initialCenter[1];
    zoomLevel = initialZoom || 15;
  } else if (pinned.length === 1 && pinned[0].latitude != null && pinned[0].longitude != null) {
    centerLat = pinned[0].latitude;
    centerLng = pinned[0].longitude;
    zoomLevel = initialZoom || 15;
  }

  const markersJs = pinned
    .map(
      (f) => {
        const farmName = f.name || f.farm_name || 'Farm';
        return `
      L.marker([${f.latitude}, ${f.longitude}], { icon: pinIcon }).addTo(map)
        .bindPopup(${JSON.stringify(farmName)})
        .on('click', function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'markerPress', farmId: ${JSON.stringify(f.id)} }));
        });
    `;
      }
    )
    .join('\n');

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
        var davaoBounds = [[6.95, 125.2], [7.45, 125.7]];
        var map = L.map('map', {
          center: [${centerLat}, ${centerLng}],
          zoom: ${zoomLevel},
          minZoom: 10,
          maxBounds: davaoBounds,
          maxBoundsViscosity: 1.0,
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        var pinIcon = L.divIcon({
          className: '',
          html: '<div style="width:30px;height:30px;border-radius:50%;background:${primaryColor};border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.3);"><div style="width:10px;height:10px;background:#fff;border-radius:2px;"></div></div>',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });

        var meMarker = null;
        var meIcon = L.divIcon({
          className: '',
          html: '<div style="width:18px;height:18px;border-radius:50%;background:#2196F3;border:3px solid #fff;box-shadow:0 0 0 2px rgba(33,150,243,0.4);"></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });

        // Called from React Native via injectJavaScript once a device
        // location has been resolved through expo-location.
        window.flyToMyLocation = function(lat, lng) {
          if (meMarker) { map.removeLayer(meMarker); }
          meMarker = L.marker([lat, lng], { icon: meIcon }).addTo(map);
          map.flyTo([lat, lng], 15, { duration: 1 });
        };

        ${markersJs}
        ${pinned.length === 1 ? `map.setView([${centerLat}, ${centerLng}], ${zoomLevel});` : ''}
      </script>
    </body>
    </html>
  `;
}

export default function FarmMap({
  farms,
  onMarkerPress,
  height = 220,
  primaryColor = '#2E7D32',
  initialCenter,
  initialZoom,
}: FarmMapProps) {
  const html = useMemo(
    () => buildHtml(farms, primaryColor, initialCenter, initialZoom),
    [farms, primaryColor, initialCenter, initialZoom]
  );
  const webviewRef = useRef<WebView>(null);
  const [locating, setLocating] = useState(false);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'markerPress') {
        onMarkerPress?.(data.farmId);
      }
    } catch (e) {
      // ignore malformed messages
    }
  };

  // Requests device location via expo-location, then hands the coordinates
  // to the Leaflet map running inside the WebView so it can fly to them.
  // Requires the "expo-location" package (and its location permission
  // entries in app.json) to already be installed — this mirrors the same
  // ImagePicker/MediaLibrary permission pattern used elsewhere in the app.
  const handleMyLocation = async () => {
    try {
      setLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocating(false);
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      webviewRef.current?.injectJavaScript(
        `window.flyToMyLocation(${position.coords.latitude}, ${position.coords.longitude}); true;`
      );
    } catch (error) {
      console.error('Error getting current location:', error);
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        ref={webviewRef}
        originWhitelist={['*']}
        source={{ html }}
        style={styles.webview}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
      />

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', borderRadius: 16, overflow: 'hidden', position: 'relative' },
  webview: { flex: 1, backgroundColor: 'transparent' },
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