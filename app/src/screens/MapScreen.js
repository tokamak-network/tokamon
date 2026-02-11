import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Platform,
} from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';

class MapErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' }}>
          <Text style={{ color: '#f87171', fontSize: 16, textAlign: 'center', padding: 20 }}>
            지도를 불러올 수 없습니다.{'\n'}Google Maps API 키를 설정해주세요.
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}
import { getCurrentPosition, watchPosition, clearWatch } from '../services/location';
import { getSecurityStatus, isLocationMocked } from '../services/security';
import { getSpots, requestDeviceClaim } from '../services/api';
import { getDeviceId } from '../services/device';
import { haversineDistance } from '../utils/distance';

const COLLECT_RADIUS = 50;

export default function MapScreen() {
  const [userPos, setUserPos] = useState(null);
  const [spots, setSpots] = useState([]);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [message, setMessage] = useState(null);
  const mapRef = useRef(null);
  const hascentered = useRef(false);

  // 보안 체크
  useEffect(() => {
    const security = getSecurityStatus();
    if (!security.safe) {
      Alert.alert('보안 경고', security.warnings.join('\n'));
    }
  }, []);

  // 위치 추적
  useEffect(() => {
    const watchId = watchPosition((pos) => {
      if (isLocationMocked(pos)) {
        Alert.alert('경고', '가짜 GPS가 감지되었습니다');
        return;
      }
      setUserPos(pos);
      if (!hascentered.current && mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: pos.lat,
          longitude: pos.lng,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }, 1000);
        hascentered.current = true;
      }
    });
    return () => clearWatch(watchId);
  }, []);

  // 스팟 목록 갱신
  const refreshSpots = useCallback(async () => {
    const data = await getSpots();
    if (Array.isArray(data)) setSpots(data);
  }, []);

  useEffect(() => {
    refreshSpots();
    const interval = setInterval(refreshSpots, 30000);
    return () => clearInterval(interval);
  }, [refreshSpots]);

  // 클레임 처리 (기기 기반)
  const handleClaim = async (spot) => {
    if (!userPos) return;

    const distance = haversineDistance(userPos.lat, userPos.lng, spot.lat, spot.lng);
    if (distance > COLLECT_RADIUS) {
      setMessage({ type: 'error', text: `너무 멀어요 (${Math.round(distance)}m)` });
      return;
    }

    setClaiming(true);
    setMessage(null);

    try {
      const deviceId = await getDeviceId();
      const result = await requestDeviceClaim(deviceId, spot.id, userPos.lat, userPos.lng);

      if (result.error) {
        setMessage({ type: 'error', text: result.error });
        setClaiming(false);
        return;
      }

      let text = `${result.reward} TON 적립!`;
      if (result.bonus > 0) {
        text = `스탬프 달성! ${result.reward + result.bonus} TON 적립!`;
      }
      if (result.balance != null) {
        text += ` (잔액: ${result.balance} TON)`;
      }
      setMessage({ type: 'success', text });
      refreshSpots();
    } catch (e) {
      setMessage({ type: 'error', text: e.message || '클레임 실패' });
    }

    setClaiming(false);
  };

  const getSpotDistance = (spot) => {
    if (!userPos) return null;
    return Math.round(haversineDistance(userPos.lat, userPos.lng, spot.lat, spot.lng));
  };

  return (
    <View style={styles.container}>
      <MapErrorBoundary>
        <MapView
          ref={mapRef}
          style={styles.map}
          showsUserLocation
          showsMyLocationButton
          initialRegion={{
            latitude: userPos?.lat || 37.5665,
            longitude: userPos?.lng || 126.978,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          }}
        >
          {spots.map((spot) => (
            <React.Fragment key={spot.id}>
              <Marker
                coordinate={{ latitude: spot.lat, longitude: spot.lng }}
                pinColor={spot.active ? '#4ade80' : '#f87171'}
                onPress={() => setSelectedSpot(spot)}
              />
              <Circle
                center={{ latitude: spot.lat, longitude: spot.lng }}
                radius={COLLECT_RADIUS}
                fillColor={spot.active ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)'}
                strokeColor={spot.active ? '#4ade80' : '#f87171'}
                strokeWidth={1}
              />
            </React.Fragment>
          ))}
        </MapView>
      </MapErrorBoundary>

      {/* 하단 패널 */}
      <View style={styles.panel}>
        {message && (
          <View style={[styles.message, message.type === 'success' ? styles.success : styles.error]}>
            <Text style={styles.messageText}>{message.text}</Text>
          </View>
        )}

        {selectedSpot ? (
          <View>
            <Text style={styles.spotName}>{selectedSpot.name}</Text>
            <Text style={styles.spotDetail}>
              {selectedSpot.start_time}~{selectedSpot.end_time}
              {getSpotDistance(selectedSpot) !== null && ` | ${getSpotDistance(selectedSpot)}m`}
            </Text>
            <Text style={[styles.status, selectedSpot.active ? styles.active : styles.inactive]}>
              {selectedSpot.active ? '활성중' : `비활성 (${selectedSpot.start_time}에 오세요)`}
            </Text>
            <TouchableOpacity
              style={[styles.claimBtn, (!selectedSpot.active || getSpotDistance(selectedSpot) > COLLECT_RADIUS) && styles.disabled]}
              disabled={!selectedSpot.active || getSpotDistance(selectedSpot) > COLLECT_RADIUS || claiming}
              onPress={() => handleClaim(selectedSpot)}
            >
              <Text style={styles.claimBtnText}>
                {claiming ? '클레임 중...' : 'TON 클레임'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.hint}>지도에서 스팟을 선택하세요 ({spots.length}개)</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  map: { flex: 1 },
  panel: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  spotName: { color: '#fff', fontSize: 18, fontWeight: '700' },
  spotDetail: { color: '#aaa', fontSize: 13, marginTop: 4 },
  status: { fontSize: 13, marginTop: 4 },
  active: { color: '#4ade80' },
  inactive: { color: '#f87171' },
  hint: { color: '#888', fontSize: 14 },
  claimBtn: {
    backgroundColor: '#3b82f6',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  claimBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabled: { backgroundColor: '#333' },
  message: { padding: 8, borderRadius: 8, marginBottom: 8 },
  success: { backgroundColor: '#166534' },
  error: { backgroundColor: '#7f1d1d' },
  messageText: { color: '#fff', textAlign: 'center', fontSize: 14 },
});
