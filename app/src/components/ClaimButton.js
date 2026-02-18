import React, { useState, useEffect, useRef } from 'react';
import { TouchableOpacity, Text, View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { requestDeviceCode, verifyAndClaimDevice } from '../services/api';
import { COLLECT_RADIUS } from '../utils/constants';
import { t } from '../utils/translations';

function formatCooldownTime(seconds, language) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) {
    return `${h}${t(language, 'hours')} ${m}${t(language, 'minutes')}`;
  }
  return `${m}${t(language, 'minutes')}`;
}

export default function ClaimButton({
  spot, distance, userPos, deviceId, pushToken, receivedCode, isOwner, isExhausted, isOnCooldown,
  cooldownLeft = 0, onClaimed, language = 'ko',
}) {
  const [claiming, setClaiming] = useState(false);
  const [claimPhase, setClaimPhase] = useState('idle'); // idle → requesting → waiting_code → verifying
  const [remainingCooldown, setRemainingCooldown] = useState(cooldownLeft);
  const pendingSpotId = useRef(null);

  // 실시간 카운트다운
  useEffect(() => {
    setRemainingCooldown(cooldownLeft);
    if (cooldownLeft <= 0) return;
    const interval = setInterval(() => {
      setRemainingCooldown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownLeft]);

  const hasDevice = !!deviceId;
  const isCoolingDown = isOnCooldown && remainingCooldown > 0;
  const canClaim = hasDevice && !isOwner && !isExhausted && !isCoolingDown && spot.active;

  // FCM 푸시 알림에서 인증번호 수신 시 자동으로 검증+클레임
  useEffect(() => {
    if (receivedCode && claimPhase === 'waiting_code' && receivedCode.spotId === String(spot.id)) {
      autoVerify(receivedCode.code);
    }
  }, [receivedCode, claimPhase, spot.id]);

  const autoVerify = async (code) => {
    setClaimPhase('verifying');
    try {
      const result = await verifyAndClaimDevice(deviceId, spot.id, code);
      const total = (result.reward || 0) + (result.bonus || 0);
      Alert.alert('', t(language, 'claimSuccess').replace('{amount}', total.toFixed(4)));

      // 지갑 미연결 시 경고
      if (!result.has_linked_wallet) {
        setTimeout(() => {
          Alert.alert('', t(language, 'walletLinkWarning'));
        }, 500);
      }

      setClaimPhase('idle');
      pendingSpotId.current = null;
      onClaimed?.();
    } catch (err) {
      if (err.data?.cooldown_remaining > 0) {
        const cd = err.data.cooldown_remaining;
        const h = Math.floor(cd / 3600);
        const m = Math.floor((cd % 3600) / 60);
        const time = h > 0 ? `${h}${t(language, 'hours')} ${m}${t(language, 'minutes')}` : `${m}${t(language, 'minutes')}`;
        Alert.alert(t(language, 'cooldown'), t(language, 'nextClaimIn').replace('{time}', time));
      } else {
        Alert.alert(t(language, 'claimFailed'), err.message || '');
      }
      setClaimPhase('idle');
      pendingSpotId.current = null;
    }
  };

  // 쿨다운 중: 비활성 버튼 + 남은 시간 표시
  if (isCoolingDown) {
    return (
      <View>
        <View style={[styles.button, styles.buttonCooldown]}>
          <View style={styles.buttonInner}>
            <Text style={styles.buttonText}>⏳ {t(language, 'cooldown')}</Text>
            <Text style={styles.cooldownTime}>
              {t(language, 'nextClaimIn').replace('{time}', formatCooldownTime(remainingCooldown, language))}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (!canClaim) return null;

  const withinRange = distance === null || distance <= COLLECT_RADIUS;

  // 디바이스 클레임 - 요청부터 완료까지 자동 처리
  const handleDeviceClaim = async () => {
    // 클라이언트 사전 검증
    if (remainingCooldown > 0) {
      Alert.alert(t(language, 'cooldown'),
        t(language, 'nextClaimIn').replace('{time}', formatCooldownTime(remainingCooldown, language)));
      return;
    }
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
      await requestDeviceCode(deviceId, pushToken, spot.id, userPos.lat, userPos.lng);
      // 인증번호는 푸시로만 전달됨 → 푸시 수신 시 자동 검증
      setClaimPhase('waiting_code');
    } catch (err) {
      if (err.data?.cooldown_remaining > 0) {
        const cd = err.data.cooldown_remaining;
        const h = Math.floor(cd / 3600);
        const m = Math.floor((cd % 3600) / 60);
        const time = h > 0 ? `${h}${t(language, 'hours')} ${m}${t(language, 'minutes')}` : `${m}${t(language, 'minutes')}`;
        Alert.alert(t(language, 'cooldown'), t(language, 'nextClaimIn').replace('{time}', time));
      } else {
        Alert.alert(t(language, 'claimFailed'), err.message || '');
      }
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
  const handlePress = handleDeviceClaim;
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
  buttonCooldown: {
    backgroundColor: '#1e293b',
    shadowColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.2)',
  },
  cooldownTime: {
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
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
