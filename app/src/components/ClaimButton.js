import React, { useState, useEffect, useRef } from 'react';
import { TouchableOpacity, Text, View, StyleSheet, Alert, ActivityIndicator, TextInput } from 'react-native';
import { claimSelf } from '../services/contract';
import { requestDeviceCode, verifyAndClaimDevice } from '../services/api';
import { COLLECT_RADIUS } from '../utils/constants';
import { t } from '../utils/translations';

export default function ClaimButton({
  spot, distance, wallet, pushToken, isOwner, isExhausted, isOnCooldown,
  onClaimed, onCodeReceived, language = 'ko',
}) {
  const [claiming, setClaiming] = useState(false);
  const [claimPhase, setClaimPhase] = useState('idle'); // idle → requesting → code_input → verifying
  const [verifyCode, setVerifyCode] = useState('');
  const codeInputRef = useRef(null);

  // 지갑이 있으면 기존 방식, 없으면 pushToken으로 디바이스 클레임
  const hasWallet = !!wallet;
  const hasDevice = !!pushToken;
  const canClaim = (hasWallet || hasDevice) && !isOwner && !isExhausted && !isOnCooldown && spot.active;

  console.log('[ClaimButton]', { hasWallet, hasDevice, pushToken: pushToken?.slice(0,15), isOwner, isExhausted, isOnCooldown, active: spot.active, canClaim });

  // 외부에서 코드 수신 시 자동 채우기
  useEffect(() => {
    if (onCodeReceived && claimPhase === 'code_input') {
      // onCodeReceived는 부모에서 전달하는 코드값
    }
  }, [onCodeReceived, claimPhase]);

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

  // 디바이스 클레임 - 인증 코드 요청
  const handleRequestCode = async () => {
    if (distance !== null && distance > COLLECT_RADIUS) {
      Alert.alert('', t(language, 'tooFar').replace('{distance}', distance).replace('{radius}', COLLECT_RADIUS));
      return;
    }
    setClaimPhase('requesting');
    try {
      const result = await requestDeviceCode(pushToken, spot.id, spot.lat, spot.lng);
      setClaimPhase('code_input');
      // 디버그 코드가 있으면 (FCM 미지원 환경) 자동 채우기
      if (result.debug_code) {
        setVerifyCode(result.debug_code);
      }
      setTimeout(() => codeInputRef.current?.focus(), 300);
    } catch (err) {
      Alert.alert(t(language, 'claimFailed'), err.message || '');
      setClaimPhase('idle');
    }
  };

  // 디바이스 클레임 - 코드 검증 + 클레임
  const handleVerifyAndClaim = async () => {
    if (!verifyCode || verifyCode.length !== 6) {
      Alert.alert('', t(language, 'enterVerificationCode'));
      return;
    }
    setClaimPhase('verifying');
    try {
      const result = await verifyAndClaimDevice(pushToken, spot.id, verifyCode);
      const total = (result.reward || 0) + (result.bonus || 0);
      Alert.alert('', t(language, 'claimSuccess').replace('{amount}', total.toFixed(4)));
      setClaimPhase('idle');
      setVerifyCode('');
      onClaimed?.();
    } catch (err) {
      Alert.alert(t(language, 'claimFailed'), err.message || '');
      setClaimPhase('code_input');
    }
  };

  // 코드 자동 채우기 (푸시 알림에서)
  const autoFillCode = (code) => {
    setVerifyCode(code);
    // 자동으로 검증 시도
    if (code.length === 6 && claimPhase === 'code_input') {
      setTimeout(() => handleVerifyAndClaim(), 500);
    }
  };

  // 취소
  const handleCancel = () => {
    setClaimPhase('idle');
    setVerifyCode('');
  };

  // 인증번호 입력 UI
  if (claimPhase === 'code_input') {
    return (
      <View style={styles.codeContainer}>
        <Text style={styles.codeLabel}>{t(language, 'enterVerificationCode')}</Text>
        <View style={styles.codeRow}>
          <TextInput
            ref={codeInputRef}
            style={styles.codeInput}
            value={verifyCode}
            onChangeText={setVerifyCode}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="000000"
            placeholderTextColor="#555"
            autoFocus
          />
          <TouchableOpacity
            style={[styles.verifyBtn, verifyCode.length !== 6 && styles.verifyBtnDisabled]}
            onPress={handleVerifyAndClaim}
            disabled={verifyCode.length !== 6}
            activeOpacity={0.7}
          >
            <Text style={styles.verifyBtnText}>{t(language, 'verify')}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={handleCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelBtnText}>{t(language, 'cancel')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 검증 중
  if (claimPhase === 'verifying' || claimPhase === 'requesting') {
    return (
      <View style={[styles.button, styles.buttonDisabled]}>
        <View style={styles.buttonInner}>
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.buttonText}>
              {claimPhase === 'requesting' ? t(language, 'requestingCode') : t(language, 'processing')}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // 메인 버튼
  const handlePress = hasWallet ? handleWalletClaim : handleRequestCode;
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

// Export autoFillCode for parent component
ClaimButton.autoFillCode = null;

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
  // 인증번호 입력 UI
  codeContainer: {
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  codeLabel: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  codeInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  verifyBtn: {
    backgroundColor: '#10b981',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  verifyBtnDisabled: {
    backgroundColor: '#333',
  },
  verifyBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
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
