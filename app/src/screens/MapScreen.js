import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Platform,
} from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { getCurrentPosition, watchPosition, clearWatch } from '../services/location';
import { getSecurityStatus, isLocationMocked } from '../services/security';
import { getSpots, requestClaim } from '../services/api';
import { buildClaimTx } from '../services/ton';
import { haversineDistance } from '../utils/distance';

const COLLECT_RADIUS = 50;

export default function MapScreen({ walletAddress, sendTransaction }) {
  const [userPos, setUserPos] = useState(null);
  const [spots, setSpots] = useState([]);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [message, setMessage] = useState(null);

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

  // 클레임 처리
  const handleClaim = async (spot) => {
    if (!userPos || !walletAddress) return;

    const distance = haversineDistance(userPos.lat, userPos.lng, spot.lat, spot.lng);
    if (distance > COLLECT_RADIUS) {
      setMessage({ type: 'error', text: `너무 멀어요 (${Math.round(distance)}m)` });
      return;
    }

    setClaiming(true);
    setMessage(null);

    try {
      // 1. 서버에 클레임 요청 (위치+시간 검증 → 서명 받기)
      const result = await requestClaim(walletAddress, spot.id, userPos.lat, userPos.lng);

      if (result.error) {
        setMessage({ type: 'error', text: result.error });
        setClaiming(false);
        return;
      }

      // 2. 서명으로 컨트랙트에 직접 클레임 TX 전송
      const tx = buildClaimTx(
        result.signature,
        result.contract_spot_id,
        result.claim_id,
        result.valid_until,
      );

      await sendTransaction(tx);
      setMessage({ type: 'success', text: 'TON 클레임 성공!' });
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
      <MapView
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
