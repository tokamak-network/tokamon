import React from 'react';
import { Image } from 'react-native';
import { Marker } from 'react-native-maps';

const markerBlue = require('../../assets/marker-blue.png');
const markerGreen = require('../../assets/marker-green.png');

export default function SpotMarker({ spot, selectedSpotId, onPress }) {
  const isSelected = selectedSpotId === spot.id;

  return (
    <Marker
      coordinate={{ latitude: spot.lat, longitude: spot.lng }}
      onPress={() => onPress(spot)}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <Image
        source={isSelected ? markerGreen : markerBlue}
        style={{ width: 36, height: 36 }}
        resizeMode="contain"
      />
    </Marker>
  );
}
