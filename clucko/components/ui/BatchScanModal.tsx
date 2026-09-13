import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    Dimensions,
    FlatList,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const { width } = Dimensions.get('window');

interface Chicken {
  id: string;
  name: string;
  scanned: boolean;
}

interface BatchScanModalProps {
  visible: boolean;
  onClose: () => void;
  onComplete: (scannedChickens: string[]) => void;
}

export default function BatchScanModal({ visible, onClose, onComplete }: BatchScanModalProps) {
  const [chickens, setChickens] = useState<Chicken[]>([
    { id: 'CK-001', name: 'Rocky', scanned: false },
    { id: 'CK-002', name: 'Thunder', scanned: false },
    { id: 'CK-003', name: 'Lightning', scanned: false },
    { id: 'CK-004', name: 'Eagle', scanned: false },
    { id: 'CK-005', name: 'Falcon', scanned: false },
  ]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scanning, setScanning] = useState(false);

  const handleScan = (chickenId: string) => {
    setChickens(prev => 
      prev.map(c => 
        c.id === chickenId ? { ...c, scanned: true } : c
      )
    );
    
    if (currentIndex < chickens.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // All scanned
      const scannedIds = chickens.filter(c => c.scanned).map(c => c.id);
      onComplete(scannedIds);
      onClose();
    }
  };

  const progress = (chickens.filter(c => c.scanned).length / chickens.length) * 100;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Batch Scan Mode</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {chickens.filter(c => c.scanned).length} of {chickens.length} scanned
            </Text>
          </View>

          {/* Current Chicken to Scan */}
          {!scanning && currentIndex < chickens.length && (
            <View style={styles.currentCard}>
              <Text style={styles.currentLabel}>Now Scanning:</Text>
              <Text style={styles.currentName}>{chickens[currentIndex].name}</Text>
              <Text style={styles.currentId}>ID: {chickens[currentIndex].id}</Text>
              <TouchableOpacity 
                style={styles.scanButton}
                onPress={() => {
                  setScanning(true);
                  // Simulate scan - replace with actual camera
                  setTimeout(() => {
                    handleScan(chickens[currentIndex].id);
                    setScanning(false);
                  }, 1500);
                }}
              >
                <Ionicons name="scan" size={24} color="#FFF" />
                <Text style={styles.scanButtonText}>Scan QR Code</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Scanning Animation */}
          {scanning && (
            <View style={styles.scanningContainer}>
              <Ionicons name="scan-circle" size={64} color="#4CAF50" />
              <Text style={styles.scanningText}>Scanning...</Text>
              <Text style={styles.scanningSubtext}>Position QR code in frame</Text>
            </View>
          )}

          {/* List of Chickens */}
          <Text style={styles.listTitle}>Batch Queue</Text>
          <FlatList
            data={chickens}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={[styles.listItem, item.scanned && styles.listItemCompleted]}>
                <View style={styles.listItemLeft}>
                  <View style={[styles.listItemDot, item.scanned && styles.listItemDotCompleted]} />
                  <View>
                    <Text style={[styles.listItemName, item.scanned && styles.listItemNameCompleted]}>
                      {item.name}
                    </Text>
                    <Text style={styles.listItemId}>{item.id}</Text>
                  </View>
                </View>
                {item.scanned ? (
                  <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                ) : (
                  <Text style={styles.listItemPending}>Pending</Text>
                )}
              </View>
            )}
            style={styles.list}
          />
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
  },
  modalContainer: {
    width: width * 0.9,
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  progressContainer: {
    marginBottom: 24,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  currentCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  currentLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  currentName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  currentId: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  scanButton: {
    flexDirection: 'row',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 30,
    alignItems: 'center',
    gap: 8,
  },
  scanButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  scanningContainer: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    marginBottom: 24,
  },
  scanningText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  scanningSubtext: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  list: {
    maxHeight: 300,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  listItemCompleted: {
    opacity: 0.6,
  },
  listItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listItemDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF9800',
  },
  listItemDotCompleted: {
    backgroundColor: '#4CAF50',
  },
  listItemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  listItemNameCompleted: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  listItemId: {
    fontSize: 10,
    color: '#999',
  },
  listItemPending: {
    fontSize: 12,
    color: '#FF9800',
  },
});