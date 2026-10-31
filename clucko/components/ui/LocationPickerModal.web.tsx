import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { DAVAO_BOUNDS, DAVAO_CITY_CENTER, useLeafletCss } from './FarmMap.web';
import { fallbackDavaoAddress, PinnedLocation, reverseGeocodeDavao } from './LocationPickerModal.native';

interface Coords {
  latitude: number;
  longitude: number;
  address?: string;
}

interface LocationPickerModalProps {
  visible: boolean;
  onClose: () => void;
  initialCoords?: Coords;
  onConfirm: (coords: PinnedLocation) => void;
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
  const [resolvedAddress, setResolvedAddress] = useState<string>(
    initialCoords?.address ||
      (initialCoords ? fallbackDavaoAddress(initialCoords.latitude, initialCoords.longitude) : '')
  );

  useEffect(() => {
    if (!visible) return;
    setPicked(initialCoords);
    setResolvedAddress(
      initialCoords?.address ||
        (initialCoords ? fallbackDavaoAddress(initialCoords.latitude, initialCoords.longitude) : '')
    );
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
      async click(e: any) {
        const lat = Number(e.latlng.lat);
        const lng = Number(e.latlng.lng);
        setPicked({ latitude: lat, longitude: lng });
        setResolvedAddress(fallbackDavaoAddress(lat, lng));
        const addr = await reverseGeocodeDavao(lat, lng);
        setResolvedAddress(addr);
      },
    });
    return null;
  }

  const handleConfirm = () => {
    if (picked) {
      const finalAddress =
        resolvedAddress.trim() || fallbackDavaoAddress(picked.latitude, picked.longitude);
      onConfirm({
        latitude: picked.latitude,
        longitude: picked.longitude,
        address: finalAddress,
      });
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
            {picked
              ? `Pinned: ${resolvedAddress || fallbackDavaoAddress(picked.latitude, picked.longitude)}`
              : 'Tap the map to drop a pin.'}
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
  hint: { fontSize: 12, color: '#2D5541', fontWeight: '600', marginTop: 10, marginBottom: 14, textAlign: 'center' },
  confirmButton: {
    backgroundColor: '#2D5541',
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmButtonDisabled: { backgroundColor: '#7F9489', opacity: 0.5 },
  confirmButtonText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});
