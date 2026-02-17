import React, { useState, useEffect, useRef } from 'react';
import { TouchableOpacity, Text, View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { claimSelf } from '../services/contract';
import { requestDeviceCode, verifyAndClaimDevice } from '../services/api';
import { COLLECT_RADIUS } from '../utils/constants';
import { t } from '../utils/translations';

export default function ClaimButton({
  spot, distance, userPos, wallet, pushToken, receivedCode, isOwner, isExhausted, isOnCooldown,
  onClaimed, language = 'ko',
}) {
  const [claiming, setClaiming] = useState(false);
  const [claimPhase, setClaimPhase] = useState('idle'); // idle → requesting → waiting_code → verifying
  const pendingSpotId = useRef(null);

  // 지갑이 있으면 기존 방식, 없으면 pushToken으로 디바이스 클레임
  const hasWallet = !!wallet;
  const hasDevice = !!pushToken;
  const canClaim = (hasWallet || hasDevice) && !isOwner && !isExhausted && !isOnCooldown && spot.active;

  // FCM 푸시 알림에서 인증번호 수신 시 자동으로 검증+클레임
  useEffect(() => {
    if (receivedCode && claimPhase === 'waiting_code' && receivedCode.spotId === String(spot.id)) {
      autoVerify(receivedCode.code);
    }
  }, [receivedCode, claimPhase, spot.id]);

  const autoVerify = async (code) => {
    setClaimPhase('verifying');
    try {
      const result = await verifyAndClaimDevice(pushToken, spot.id, code);
      const total = (result.reward || 0) + (result.bonus || 0);
      Alert.alert('', t(language, 'claimSuccess').replace('{amount}', total.toFixed(4)));
      setClaimPhase('idle');
      pendingSpotId.current = null;
      onClaimed?.();
    } catch (err) {
      Alert.alert(t(language, 'claimFailed'), err.message || '');
      setClaimPhase('idle');
      pendingSpotId.current = null;
    }
  };

  if (!canClaim) return null;

  const withinRange = distance === null || distance <= COLLECT_RADIUS;

  // 지갑 클레임 (기존)
  const handleWalletClaim = async () => {
    if (distance !== null && distance > COLLECT_RADIUS) {
      Alert.alert('', t(language, 'tooFar').replace('{distance}', distance).replace('{radius}', COLLECT_RADIUS));
      return;
    }
    setClaiming(true);
    try {
      const result = await claimSelf(spot.id);
      const total = result.reward + result.bonus;
      Alert.alert('', t(language, 'claimSuccess').replace('{amount}', total));
      onClaimed?.();
    } catch (err) {
      Alert.alert(t(language, 'claimFailed'), err.reason || err.message || '');
    } finally {
      setClaiming(false);
    }
  };

  // 디바이스 클레임 - 요청부터 완료까지 자동 처리
  const handleDeviceClaim = async () => {
    if (!userPos) {
      Alert.alert('', t(language, 'gpsRequired') || 'GPS 위치를 확인할 수 없습니다');
      return;
    }
    if (distance !== null && distance > COLLECT_RADIUS) {
      Alert.alert('', t(language, 'tooFar').replace('{distance}', distance).replace('{radius}', COLLECT_RADIUS));
      return;
    }
    setClaimPhase('requesting');
    pendingSpotId.current = spot.id;
    try {
      const result = await requestDeviceCode(pushToken, spot.id, userPos.lat, userPos.lng);
      // debug_code가 있으면 (FCM 미지원 환경) 바로 검증
      if (result.debug_code) {
        await autoVerify(result.debug_code);
        return;
      }
      // FCM 환경: 푸시 알림으로 코드가 올 때까지 대기
      setClaimPhase('waiting_code');
    } catch (err) {
      Alert.alert(t(language, 'claimFailed'), err.message || '');
      setClaimPhase('idle');
      pendingSpotId.current = null;
    }
  };

  // 취소
  const handleCancel = () => {
    setClaimPhase('idle');
    pendingSpotId.current = null;
  };

  // 처리 중 UI
  if (claimPhase === 'requesting' || claimPhase === 'verifying' || claimPhase === 'waiting_code') {
    return (
      <View>
        <View style={[styles.button, styles.buttonDisabled]}>
          <View style={styles.buttonInner}>
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.buttonText}>
                {claimPhase === 'requesting'
                  ? t(language, 'requestingCode')
                  : claimPhase === 'waiting_code'
                  ? t(language, 'waitingCode')
                  : t(language, 'processing')}
              </Text>
            </View>
          </View>
        </View>
        {claimPhase === 'waiting_code' && (
          <TouchableOpacity onPress={handleCancel} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>{t(language, 'cancel')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // 메인 버튼
  const handlePress = hasWallet ? handleWalletClaim : handleDeviceClaim;
  const isLoading = claiming;

  return (
    <View>
      <TouchableOpacity
        style={[styles.button, !withinRange && styles.buttonDisabled]}
        onPress={handlePress}
        disabled={isLoading || !withinRange}
        activeOpacity={0.7}
      >
        <View style={styles.buttonInner}>
          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.buttonText}>
                {t(language, 'waitingApproval')}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.buttonText}>
                {t(language, 'claimReward').replace('{amount}', spot.reward)}
              </Text>
              {!hasWallet && (
                <Text style={styles.deviceClaimHint}>
                  {t(language, 'claimWithoutWallet')}
                </Text>
              )}
              {withinRange && distance !== null && (
                <Text style={styles.distanceOk}>{distance}m</Text>
              )}
            </>
          )}
        </View>
        {!withinRange && distance !== null && (
          <View style={styles.distanceRow}>
            <Text style={styles.distanceText}>{distance}m - {t(language, 'tooFarShort') || 'Too far'}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#10b981',
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 14,
    overflow: 'hidden',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonDisabled: {
    backgroundColor: '#333',
    shadowColor: 'transparent',
  },
  buttonInner: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  deviceClaimHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginTop: 2,
  },
  distanceOk: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 2,
  },
  distanceRow: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingVertical: 6,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  distanceText: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '500',
  },
  cancelBtn: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelBtnText: {
    color: '#888',
    fontSize: 13,
  },
});
