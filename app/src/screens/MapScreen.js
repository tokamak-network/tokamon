import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import MapView, { Circle } from 'react-native-maps';
import useLocation from '../hooks/useLocation';
import { getSpots } from '../services/api';
import SpotMarker from '../components/SpotMarker';
import SpotDetailSheet from '../components/SpotDetailSheet';
import { t } from '../utils/translations';

const DEFAULT_REGION = {
  latitude: 37.495,
  longitude: 127.063,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

export default function MapScreen({ route, wallet, pushToken, language = 'ko', onRefreshSpots }) {
  const { userPos, gpsStatus } = useLocation();
  const [spots, setSpots] = useState([]);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);
  const hasCentered = useRef(false);

  const fetchSpots = useCallback(async () => {
    try {
      const data = await getSpots();
      console.log('[MapScreen] spots loaded:', data.length, JSON.stringify(data.map(s => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng }))));
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
    console.log('[MapScreen] userPos:', userPos, 'gpsStatus:', gpsStatus);
    if (userPos && !hasCentered.current && mapRef.current) {
      hasCentered.current = true;
      console.log('[MapScreen] auto-centering to GPS:', userPos.lat, userPos.lng);
      mapRef.current.animateToRegion({
        latitude: userPos.lat,
        longitude: userPos.lng,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      }, 1000);
    }
  }, [userPos]);

  // Auto-center to first spot if no GPS after loading spots
  useEffect(() => {
    if (!hasCentered.current && !userPos && spots.length > 0 && mapRef.current) {
      hasCentered.current = true;
      const firstSpot = spots[0];
      console.log('[MapScreen] no GPS, centering to first spot:', firstSpot.lat, firstSpot.lng);
      mapRef.current.animateToRegion({
        latitude: firstSpot.lat,
        longitude: firstSpot.lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
  }, [spots, userPos]);

  // Handle selectedSpot from SpotListScreen navigation
  useEffect(() => {
    const incoming = route?.params?.selectedSpot;
    if (incoming && mapRef.current) {
      setSelectedSpot(incoming);
      mapRef.current.animateToRegion({
        latitude: incoming.lat,
        longitude: incoming.lng,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 500);
    }
  }, [route?.params?.selectedSpot]);

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

  const activeSpotCount = spots.filter(s => s.active && s.remaining >= s.reward).length;

  return (
    <View style={styles.container}>
      {/* GPS Status Banner */}
      {gpsStatus === 'loading' && (
        <View style={styles.gpsBanner}>
          <ActivityIndicator size="small" color="#4FC3F7" />
          <Text style={styles.gpsBannerText}>{t(language, 'gpsLoading')}</Text>
        </View>
      )}
      {gpsStatus === 'denied' && (
        <View style={[styles.gpsBanner, styles.gpsBannerDenied]}>
          <Text style={styles.gpsBannerIcon}>📡</Text>
          <Text style={styles.gpsBannerText}>{t(language, 'gpsDenied')}</Text>
        </View>
      )}
      {gpsStatus === 'unavailable' && (
        <View style={[styles.gpsBanner, styles.gpsBannerWarn]}>
          <Text style={styles.gpsBannerIcon}>⚠️</Text>
          <Text style={styles.gpsBannerText}>{t(language, 'gpsUnavailable')}</Text>
        </View>
      )}

      {/* Spot count badge */}
      {!loading && spots.length > 0 && (
        <View style={styles.spotCountBadge}>
          <View style={styles.spotCountDot} />
          <Text style={styles.spotCountText}>
            {activeSpotCount} spots
          </Text>
        </View>
      )}

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={DEFAULT_REGION}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={true}
        userInterfaceStyle="light"
      >
        {/* User radius circle */}
        {userPos && (
          <Circle
            center={{ latitude: userPos.lat, longitude: userPos.lng }}
            radius={10}
            strokeColor="rgba(79,195,247,0.4)"
            fillColor="rgba(79,195,247,0.08)"
            strokeWidth={1.5}
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
        <TouchableOpacity
          style={styles.locateBtn}
          onPress={handleLocateMe}
          activeOpacity={0.8}
        >
          <View style={styles.locateBtnInner}>
            <Text style={styles.locateBtnText}>◎</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Refresh button */}
      <TouchableOpacity
        style={styles.refreshBtn}
        onPress={() => { setLoading(true); fetchSpots(); }}
        activeOpacity={0.8}
      >
        <Text style={styles.refreshBtnText}>↻</Text>
      </TouchableOpacity>

      {/* Loading indicator */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#4FC3F7" />
            <Text style={styles.loadingText}>Loading spots...</Text>
          </View>
        </View>
      )}

      {/* Spot Detail Bottom Sheet */}
      <SpotDetailSheet
        spot={selectedSpot}
        userPos={userPos}
        wallet={wallet}
        pushToken={pushToken}
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
    backgroundColor: '#0a0a1a',
  },
  map: {
    flex: 1,
  },
  gpsBanner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 16,
    right: 16,
    zIndex: 100,
    backgroundColor: 'rgba(17,17,34,0.92)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(79,195,247,0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  gpsBannerDenied: {
    borderColor: 'rgba(239,68,68,0.3)',
    backgroundColor: 'rgba(50,10,10,0.92)',
  },
  gpsBannerWarn: {
    borderColor: 'rgba(245,158,11,0.3)',
    backgroundColor: 'rgba(50,40,10,0.92)',
  },
  gpsBannerIcon: {
    fontSize: 16,
  },
  gpsBannerText: {
    color: '#e0e0e0',
    fontSize: 13,
    fontWeight: '500',
  },
  spotCountBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 16,
    zIndex: 90,
    backgroundColor: 'rgba(17,17,34,0.9)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(79,195,247,0.15)',
  },
  spotCountDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  spotCountText: {
    color: '#ccc',
    fontSize: 12,
    fontWeight: '600',
  },
  locateBtn: {
    position: 'absolute',
    bottom: 400,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    shadowColor: '#4FC3F7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  locateBtnInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#12122a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(79,195,247,0.4)',
  },
  locateBtnText: {
    fontSize: 22,
    color: '#4FC3F7',
  },
  refreshBtn: {
    position: 'absolute',
    bottom: 456,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(17,17,34,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  refreshBtnText: {
    fontSize: 18,
    color: '#888',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  loadingCard: {
    backgroundColor: 'rgba(17,17,34,0.95)',
    paddingVertical: 24,
    paddingHorizontal: 32,
    borderRadius: 16,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(79,195,247,0.15)',
    shadowColor: '#4FC3F7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  loadingText: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '500',
  },
});
