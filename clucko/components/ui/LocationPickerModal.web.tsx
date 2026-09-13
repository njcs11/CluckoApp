import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { DAVAO_BOUNDS, DAVAO_CITY_CENTER, useLeafletCss } from './FarmMap.web';

interface Coords {
  latitude: number;
  longitude: number;
}

interface LocationPickerModalProps {
  visible: boolean;
  onClose: () => void;
  initialCoords?: Coords;
  onConfirm: (coords: Coords) => void;
}

export default function LocationPickerModal({
  visible,
  onClose,
  initialCoords,
  onConfirm,
}: LocationPickerModalProps) {
  useLeafletCss();
  const [mods, setMods] = useState<any>(null);
  const [picked, setPicked] = useState<Coords | undefined>(initialCoords);

  useEffect(() => {
    if (!visible) return;
    setPicked(initialCoords);
  }, [visible, initialCoords]);

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

  if (!visible) return null;

  const { MapContainer, Marker, TileLayer, useMapEvents } = mods || {};

  function ClickHandler() {
    useMapEvents({
      click(e: any) {
        setPicked({ latitude: e.latlng.lat, longitude: e.latlng.lng });
      },
    });
    return null;
  }

  const handleConfirm = () => {
    if (picked) {
      onConfirm(picked);
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Pin Farm Location</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.mapWrapper}>
            {!mods ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading map…</Text>
              </View>
            ) : (
              <MapContainer
                center={picked ? [picked.latitude, picked.longitude] : DAVAO_CITY_CENTER}
                zoom={13}
                minZoom={11}
                maxZoom={18}
                maxBounds={DAVAO_BOUNDS}
                maxBoundsViscosity={1.0}
                style={{ width: '100%', height: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <ClickHandler />
                {picked && <Marker position={[picked.latitude, picked.longitude]} />}
              </MapContainer>
            )}
          </View>

          <Text style={styles.hint}>
            {picked ? 'Tap the map to move the pin.' : 'Tap the map to drop a pin.'}
          </Text>

          <TouchableOpacity
            style={[styles.confirmButton, !picked && styles.confirmButtonDisabled]}
            onPress={handleConfirm}
            disabled={!picked}
          >
            <Text style={styles.confirmButtonText}>Confirm Location</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 17, fontWeight: 'bold', color: '#222' },
  closeText: { fontSize: 18, color: '#666', padding: 4 },
  mapWrapper: {
    width: '100%',
    height: 320,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#eee',
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 12, color: '#777' },
  hint: { fontSize: 12, color: '#777', marginTop: 10, marginBottom: 14, textAlign: 'center' },
  confirmButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmButtonDisabled: { backgroundColor: '#a5c9a8' },
  confirmButtonText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});