import React, { useMemo, useRef } from 'react';
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

  // Determine default center & zoom
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
      var m = L.marker([${f.latitude}, ${f.longitude}], { icon: pinIcon })
        .bindPopup(${JSON.stringify(farmName)})
        .on('click', function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'markerPress', farmId: ${JSON.stringify(f.id)} }));
        });
      markersGroup.addLayer(m);
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
        var map = L.map('map', {
          center: [${centerLat}, ${centerLng}],
          zoom: ${zoomLevel},
          minZoom: 4,
          maxZoom: 18,
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        // Green farm pin icon with white chicken pen / coop SVG matching Pic 5
        var pinIcon = L.divIcon({
          className: '',
          html: '<div style="width:34px;height:34px;border-radius:50%;background:#2E7D32;border:2.5px solid #ffffff;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 6px rgba(0,0,0,0.35);"><svg width="22" height="22" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M 19 22 L 38 6 L 57 22" stroke="#ffffff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M 23 25 L 38 13 L 53 25" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="24" y="24" width="28" height="21" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><rect x="33" y="28" width="10" height="10" stroke="#ffffff" stroke-width="2"/><line x1="38" y1="28" x2="38" y2="38" stroke="#ffffff" stroke-width="1.8"/><line x1="33" y1="33" x2="43" y2="33" stroke="#ffffff" stroke-width="1.8"/><rect x="27" y="45" width="4.5" height="10" stroke="#ffffff" stroke-width="2"/><rect x="44.5" y="45" width="4.5" height="10" stroke="#ffffff" stroke-width="2"/><line x1="7" y1="55" x2="24" y2="37" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/><line x1="7" y1="52" x2="11.5" y2="56.5" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/><line x1="11.5" y1="47.5" x2="16" y2="52" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="43" x2="20.5" y2="47.5" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/><line x1="20.5" y1="38.5" x2="25" y2="43" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/></svg></div>',
          iconSize: [34, 34],
          iconAnchor: [17, 17],
          popupAnchor: [0, -17]
        });

        var markersGroup = L.featureGroup().addTo(map);
        ${markersJs}

        // Auto zoom / navigate depending on farm count
        var farmCount = markersGroup.getLayers().length;
        if (farmCount === 1) {
          var singleMarker = markersGroup.getLayers()[0];
          map.setView(singleMarker.getLatLng(), 15);
        } else if (farmCount >= 2) {
          map.fitBounds(markersGroup.getBounds().pad(0.2));
        }

        window.fitAllFarms = function() {
          var count = markersGroup.getLayers().length;
          if (count === 1) {
            var layer = markersGroup.getLayers()[0];
            map.flyTo(layer.getLatLng(), 15, { duration: 0.8 });
          } else if (count >= 2) {
            map.flyToBounds(markersGroup.getBounds().pad(0.2), { duration: 0.8 });
          } else {
            map.flyTo([${DAVAO_CITY_CENTER[0]}, ${DAVAO_CITY_CENTER[1]}], 12, { duration: 0.8 });
          }
        };
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

  const handleFarmLocations = () => {
    webviewRef.current?.injectJavaScript('window.fitAllFarms(); true;');
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
        style={styles.farmLocationsButton}
        onPress={handleFarmLocations}
        activeOpacity={0.8}
      >
        <View style={[styles.farmLocationsDot, { backgroundColor: primaryColor }]} />
        <Text style={[styles.farmLocationsText, { color: primaryColor }]}>
          Farm Locations
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', borderRadius: 16, overflow: 'hidden', position: 'relative' },
  webview: { flex: 1, backgroundColor: 'transparent' },
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