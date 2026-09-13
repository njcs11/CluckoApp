import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import ChickenIcon from './ChickenIcon';

interface ScanTypeSelectorProps {
  selectedType: 'head' | 'wing' | 'full';
  onSelectType: (type: 'head' | 'wing' | 'full') => void;
}

export default function ScanTypeSelector({ selectedType, onSelectType }: ScanTypeSelectorProps) {
  const options = [
    { id: 'head', label: 'Head/Eyes', icon: 'eye-outline' as const, color: '#2196F3' },
    { id: 'wing', label: 'Wings', icon: 'chicken' as const, color: '#4CAF50' },
    { id: 'full', label: 'Full Body', icon: 'scan-outline' as const, color: '#FF9800' },
  ] as const;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Scan Area</Text>
      <View style={styles.optionsContainer}>
        {options.map((option) => (
          <TouchableOpacity
            key={option.id}
            style={[
              styles.optionButton,
              selectedType === option.id && styles.selectedOption,
              { borderColor: option.color },
              selectedType === option.id && { backgroundColor: option.color + '20' }
            ]}
            onPress={() => onSelectType(option.id)}
          >
            {option.icon === 'chicken' ? (
              <ChickenIcon
                size={24}
                color={selectedType === option.id ? option.color : '#666'}
              />
            ) : (
              <Ionicons 
                name={option.icon} 
                size={24} 
                color={selectedType === option.id ? option.color : '#666'} 
              />
            )}
            <Text style={[
              styles.optionLabel,
              selectedType === option.id && { color: option.color, fontWeight: 'bold' }
            ]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  optionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 12,
  },
  optionButton: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: '#FFF',
    gap: 8,
  },
  selectedOption: {
    backgroundColor: '#F5F5F5',
  },
  optionLabel: {
    fontSize: 12,
    color: '#666',
  },
});