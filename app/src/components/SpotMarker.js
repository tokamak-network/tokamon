import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';

function getMarkerColor(spot, selectedSpotId) {
  if (selectedSpotId === spot.id) return '#059669'; // selected - green
  const isExhausted = spot.remaining < spot.reward;
  if (isExhausted) return '#999'; // exhausted - gray
  if (!spot.active) return '#f87171'; // inactive - red
  return '#4FC3F7'; // active - blue
}

export default function SpotMarker({ spot, selectedSpotId, onPress }) {
  const color = getMarkerColor(spot, selectedSpotId);
  const isSelected = selectedSpotId === spot.id;
  const isExhausted = spot.remaining < spot.reward;
  const opacity = isExhausted ? 0.6 : 1;

  return (
    <Marker
      coordinate={{ latitude: spot.lat, longitude: spot.lng }}
      onPress={() => onPress(spot)}
      tracksViewChanges={false}
    >
      <View style={[styles.markerOuter, { borderColor: color, opacity }]}>
        <View
          style={[
            styles.markerInner,
            { backgroundColor: color },
            isSelected && styles.markerSelected,
          ]}
        />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  markerOuter: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  markerInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  markerSelected: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
});
