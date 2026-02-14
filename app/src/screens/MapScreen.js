import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { Circle } from 'react-native-maps';
import useLocation from '../hooks/useLocation';
import { getSpots } from '../services/api';
import SpotMarker from '../components/SpotMarker';
import SpotDetailSheet from '../components/SpotDetailSheet';
import { t } from '../utils/translations';

const DEFAULT_REGION = {
  latitude: 37.5665,
  longitude: 126.978,
  latitudeDelta: 0.015,
  longitudeDelta: 0.015,
};

export default function MapScreen({ wallet, language = 'ko', onRefreshSpots }) {
  const { userPos, gpsStatus } = useLocation();
  const [spots, setSpots] = useState([]);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);
  const hasCentered = useRef(false);

  const fetchSpots = useCallback(async () => {
    try {
      const data = await getSpots();
      setSpots(data);
    } catch (err) {
      console.warn('Failed to fetch spots:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSpots();
    const interval = setInterval(fetchSpots, 30000);
    return () => clearInterval(interval);
  }, [fetchSpots]);

  // Auto-center on first GPS fix
  useEffect(() => {
    if (userPos && !hasCentered.current && mapRef.current) {
      hasCentered.current = true;
      mapRef.current.animateToRegion({
        latitude: userPos.lat,
        longitude: userPos.lng,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      }, 1000);
    }
  }, [userPos]);

  const handleSpotPress = (spot) => {
    setSelectedSpot(spot);
    mapRef.current?.animateToRegion({
      latitude: spot.lat,
      longitude: spot.lng,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    }, 500);
  };

  const handleLocateMe = () => {
    if (userPos && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: userPos.lat,
        longitude: userPos.lng,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      }, 500);
    }
  };

  const handleClaimed = () => {
    setSelectedSpot(null);
    fetchSpots();
    onRefreshSpots?.();
  };

  // Navigate to a specific spot (called from SpotListScreen)
  const navigateToSpot = useCallback((spot) => {
    setSelectedSpot(spot);
    mapRef.current?.animateToRegion({
      latitude: spot.lat,
      longitude: spot.lng,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    }, 500);
  }, []);

  return (
    <View style={styles.container}>
      {/* GPS Status Banner */}
      {gpsStatus === 'loading' && (
        <View style={styles.gpsBanner}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.gpsBannerText}>{t(language, 'gpsLoading')}</Text>
        </View>
      )}
      {gpsStatus === 'denied' && (
        <View style={[styles.gpsBanner, { backgroundColor: '#ef4444' }]}>
          <Text style={styles.gpsBannerText}>{t(language, 'gpsDenied')}</Text>
        </View>
      )}
      {gpsStatus === 'unavailable' && (
        <View style={[styles.gpsBanner, { backgroundColor: '#f59e0b' }]}>
          <Text style={styles.gpsBannerText}>{t(language, 'gpsUnavailable')}</Text>
        </View>
      )}

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={DEFAULT_REGION}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={true}
      >
        {/* User radius circle */}
        {userPos && (
          <Circle
            center={{ latitude: userPos.lat, longitude: userPos.lng }}
            radius={50}
            strokeColor="rgba(59,130,246,0.3)"
            fillColor="rgba(59,130,246,0.08)"
            strokeWidth={1}
          />
        )}

        {/* Spot markers */}
        {spots.map((spot) => (
          <SpotMarker
            key={spot.id}
            spot={spot}
            selectedSpotId={selectedSpot?.id}
            onPress={handleSpotPress}
          />
        ))}
      </MapView>

      {/* Locate Me button */}
      {userPos && (
        <TouchableOpacity style={styles.locateBtn} onPress={handleLocateMe}>
          <Text style={styles.locateBtnText}>◎</Text>
        </TouchableOpacity>
      )}

      {/* Loading indicator */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#4FC3F7" />
        </View>
      )}

      {/* Spot Detail Bottom Sheet */}
      <SpotDetailSheet
        spot={selectedSpot}
        userPos={userPos}
        wallet={wallet}
        onClose={() => setSelectedSpot(null)}
        onClaimed={handleClaimed}
        language={language}
      />
    </View>
  );
}

// Expose navigateToSpot via ref
MapScreen.navigateToSpot = null;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  map: {
    flex: 1,
  },
  gpsBanner: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  gpsBannerText: {
    color: '#fff',
    fontSize: 13,
  },
  locateBtn: {
    position: 'absolute',
    bottom: 360,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  locateBtnText: {
    fontSize: 20,
    color: '#333',
  },
  loadingOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -20,
    marginTop: -20,
  },
});
