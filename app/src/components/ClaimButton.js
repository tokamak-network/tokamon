import React, { useState } from 'react';
import { TouchableOpacity, Text, View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { claimSelf } from '../services/contract';
import { COLLECT_RADIUS } from '../utils/constants';
import { t } from '../utils/translations';

export default function ClaimButton({ spot, distance, wallet, isOwner, isExhausted, isOnCooldown, onClaimed, language = 'ko' }) {
  const [claiming, setClaiming] = useState(false);

  const canClaim = wallet && !isOwner && !isExhausted && !isOnCooldown && spot.active;

  if (!canClaim) return null;

  const handleClaim = async () => {
    if (distance !== null && distance > COLLECT_RADIUS) {
      Alert.alert(
        '',
        t(language, 'tooFar')
          .replace('{distance}', distance)
          .replace('{radius}', COLLECT_RADIUS)
      );
      return;
    }

    setClaiming(true);
    try {
      const result = await claimSelf(spot.id);
      const total = result.reward + result.bonus;
      Alert.alert(
        '',
        t(language, 'claimSuccess').replace('{amount}', total)
      );
      onClaimed?.();
    } catch (err) {
      Alert.alert(
        t(language, 'claimFailed'),
        err.reason || err.message || ''
      );
    } finally {
      setClaiming(false);
    }
  };

  const withinRange = distance === null || distance <= COLLECT_RADIUS;

  return (
    <TouchableOpacity
      style={[styles.button, !withinRange && styles.buttonDisabled]}
      onPress={handleClaim}
      disabled={claiming || !withinRange}
      activeOpacity={0.7}
    >
      <View style={styles.buttonInner}>
        {claiming ? (
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
});
