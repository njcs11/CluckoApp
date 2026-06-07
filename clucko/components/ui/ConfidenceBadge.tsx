import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface ConfidenceBadgeProps {
  score: number;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
}

export default function ConfidenceBadge({ 
  score, 
  size = 'medium', 
  showLabel = true 
}: ConfidenceBadgeProps) {
  const getColor = () => {
    if (score >= 90) return '#4CAF50';
    if (score >= 70) return '#FF9800';
    return '#F44336';
  };

  const getStatusText = () => {
    if (score >= 90) return 'High Confidence';
    if (score >= 70) return 'Medium Confidence';
    return 'Low Confidence - Consider Rescan';
  };

  const getIcon = () => {
    if (score >= 90) return 'checkmark-circle';
    if (score >= 70) return 'warning';
    return 'alert-circle';
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return { barHeight: 4, fontSize: 11, padding: 4, iconSize: 14 };
      case 'large':
        return { barHeight: 12, fontSize: 18, padding: 12, iconSize: 24 };
      default:
        return { barHeight: 8, fontSize: 14, padding: 8, iconSize: 18 };
    }
  };

  const sizeStyles = getSizeStyles();
  const color = getColor();
  const icon = getIcon();

  return (
    <View style={[styles.container, { padding: sizeStyles.padding }]}>
      {showLabel && (
        <View style={styles.labelContainer}>
          <View style={styles.labelLeft}>
            <Ionicons name={icon as any} size={sizeStyles.iconSize} color={color} />
            <Text style={[styles.label, { fontSize: sizeStyles.fontSize - 2 }]}>
              Confidence Score
            </Text>
          </View>
          <Text style={[styles.score, { fontSize: sizeStyles.fontSize, color }]}>
            {score}%
          </Text>
        </View>
      )}
      
      <View style={[styles.barBackground, { height: sizeStyles.barHeight }]}>
        <View 
          style={[
            styles.barFill, 
            { 
              width: `${score}%`, 
              height: sizeStyles.barHeight,
              backgroundColor: color 
            }
          ]} 
        />
      </View>

      {showLabel && (
        <Text style={[styles.statusText, { fontSize: sizeStyles.fontSize - 4, color }]}>
          {getStatusText()}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  labelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  labelLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    color: '#666',
  },
  score: {
    fontWeight: 'bold',
  },
  barBackground: {
    backgroundColor: '#E0E0E0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  barFill: {
    borderRadius: 10,
  },
  statusText: {
    marginTop: 4,
  },
});