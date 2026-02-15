import React from 'react';
import { Marker } from 'react-native-maps';

const markerBlue = require('../../assets/marker-blue.png');
const markerGreen = require('../../assets/marker-green.png');

export default function SpotMarker({ spot, selectedSpotId, onPress }) {
  const isSelected = selectedSpotId === spot.id;

  return (
    <Marker
      coordinate={{ latitude: spot.lat, longitude: spot.lng }}
      onPress={() => onPress(spot)}
      image={isSelected ? markerGreen : markerBlue}
    />
  );
}
