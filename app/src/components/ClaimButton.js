import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert } from 'react-native';
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
      <Text style={styles.buttonText}>
        {claiming
          ? t(language, 'waitingApproval')
          : t(language, 'claimReward').replace('{amount}', spot.reward)}
      </Text>
      {!withinRange && distance !== null && (
        <Text style={styles.distanceText}>{distance}m</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#10b981',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    backgroundColor: '#555',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  distanceText: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 2,
  },
});
