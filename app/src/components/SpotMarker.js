import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';

function getMarkerColor(spot, selectedSpotId) {
  if (selectedSpotId === spot.id) return '#059669';
  const isExhausted = spot.remaining < spot.reward;
  if (isExhausted) return '#6b7280';
  if (!spot.active) return '#f87171';
  return '#4FC3F7';
}

export default function SpotMarker({ spot, selectedSpotId, onPress }) {
  const color = getMarkerColor(spot, selectedSpotId);
  const isSelected = selectedSpotId === spot.id;
  const isExhausted = spot.remaining < spot.reward;
  const opacity = isExhausted ? 0.5 : 1;

  return (
    <Marker
      coordinate={{ latitude: spot.lat, longitude: spot.lng }}
      onPress={() => onPress(spot)}
      tracksViewChanges={false}
    >
      <View style={[styles.markerContainer, { opacity }]}>
        {/* Outer glow ring for selected */}
        {isSelected && <View style={[styles.glowRing, { borderColor: color }]} />}
        <View style={[styles.markerOuter, { borderColor: color, backgroundColor: isSelected ? color : '#fff' }]}>
          <View style={[styles.markerInner, { backgroundColor: isSelected ? '#fff' : color }]} />
        </View>
        {/* Reward label */}
        {!isExhausted && (
          <View style={[styles.rewardBadge, { backgroundColor: color }]}>
            <Text style={styles.rewardText}>{spot.reward}</Text>
          </View>
        )}
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 52,
    height: 52,
  },
  glowRing: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    opacity: 0.3,
  },
  markerOuter: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  markerInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  rewardBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    minWidth: 18,
    alignItems: 'center',
  },
  rewardText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '800',
  },
});
