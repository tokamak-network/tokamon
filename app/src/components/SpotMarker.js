import React from 'react';
import { Platform } from 'react-native';
import { Marker } from 'react-native-maps';

const markerBlue = require('../../assets/marker-blue.png');
const markerGreen = require('../../assets/marker-green.png');

export default function SpotMarker({ spot, selectedSpotId, onPress }) {
  const isSelected = selectedSpotId === spot.id;

  return (
    <Marker
      identifier={String(spot.id)}
      coordinate={{ latitude: spot.lat, longitude: spot.lng }}
      image={isSelected ? markerGreen : markerBlue}
      onPress={() => onPress(spot)}
      anchor={{ x: 0.5, y: 0.5 }}
    />
  );
}
