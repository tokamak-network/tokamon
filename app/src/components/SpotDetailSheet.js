import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  PanResponder,
} from 'react-native';
import { getStampInfo } from '../services/api';
import StampProgress from './StampProgress';
import ClaimButton from './ClaimButton';
import { t } from '../utils/translations';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = 340;

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatCooldown(seconds) {
  if (seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function SpotDetailSheet({ spot, userPos, wallet, onClose, onClaimed, language = 'ko' }) {
  const [stampInfo, setStampInfo] = useState(null);
  const translateY = useState(new Animated.Value(SHEET_HEIGHT))[0];

  useEffect(() => {
    if (spot) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 9,
      }).start();

      if (wallet) {
        getStampInfo(spot.id, wallet)
          .then(setStampInfo)
          .catch(() => setStampInfo(null));
      }
    } else {
      Animated.timing(translateY, {
        toValue: SHEET_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [spot, wallet]);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 10,
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > 80) {
        onClose();
      }
    },
  });

  if (!spot) return null;

  const distance = userPos
    ? Math.round(haversineDistance(userPos.lat, userPos.lng, spot.lat, spot.lng))
    : null;

  const cooldownLeft = stampInfo?.cooldown_remaining || 0;
  const isOnCooldown = cooldownLeft > 0;
  const isExhausted = spot.remaining < spot.reward;
  const isOwner = wallet && spot.creator_address?.toLowerCase() === wallet?.toLowerCase();

  const stamps = stampInfo?.stamps || 0;
  const stampGoal = spot.stamp_goal || 1;

  const claimsLeft = spot.reward > 0 ? Math.floor(spot.remaining / spot.reward) : 0;

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY }] }]}
      {...panResponder.panHandlers}
    >
      {/* Drag handle */}
      <View style={styles.handleBar}>
        <View style={styles.handle} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.name}>{spot.name}</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>{t(language, 'close')}</Text>
        </TouchableOpacity>
      </View>

      {spot.description ? (
        <Text style={styles.description}>{spot.description}</Text>
      ) : null}

      {/* Info row */}
      <View style={styles.infoRow}>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>{t(language, 'reward')}</Text>
          <Text style={styles.infoValue}>{spot.reward} TON</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>{t(language, 'remainingClaims')}</Text>
          <Text style={styles.infoValue}>{claimsLeft}{t(language, 'times')}</Text>
        </View>
        {distance !== null && (
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Distance</Text>
            <Text style={styles.infoValue}>{distance}m</Text>
          </View>
        )}
      </View>

      {/* Status */}
      <View style={styles.statusRow}>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: isExhausted
                ? '#6b7280'
                : spot.active
                ? '#059669'
                : '#ef4444',
            },
          ]}
        >
          <Text style={styles.statusText}>
            {isExhausted
              ? t(language, 'tonExhausted')
              : spot.active
              ? t(language, 'activeStatus')
              : t(language, 'inactiveStatus')}
          </Text>
        </View>
        <Text style={styles.remainingText}>
          {t(language, 'remainingTON')}: {spot.remaining?.toFixed(2)} TON
        </Text>
      </View>

      {/* Stamp Progress */}
      {wallet && (
        <StampProgress
          stamps={stamps}
          goal={stampGoal}
          bonus={spot.stamp_bonus || 0}
          language={language}
        />
      )}

      {/* Cooldown */}
      {isOnCooldown && (
        <Text style={styles.cooldownText}>
          {t(language, 'nextClaimIn').replace('{time}', formatCooldown(cooldownLeft))}
        </Text>
      )}

      {/* Claim Button */}
      <ClaimButton
        spot={spot}
        distance={distance}
        wallet={wallet}
        isOwner={isOwner}
        isExhausted={isExhausted}
        isOnCooldown={isOnCooldown}
        onClaimed={onClaimed}
        language={language}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
    maxHeight: SHEET_HEIGHT,
  },
  handleBar: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#555',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  name: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  closeBtn: {
    padding: 8,
  },
  closeBtnText: {
    color: '#888',
    fontSize: 14,
  },
  description: {
    color: '#aaa',
    fontSize: 13,
    marginTop: 4,
  },
  infoRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 16,
  },
  infoItem: {
    flex: 1,
  },
  infoLabel: {
    color: '#888',
    fontSize: 11,
    marginBottom: 2,
  },
  infoValue: {
    color: '#fbbf24',
    fontSize: 15,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 10,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  remainingText: {
    color: '#888',
    fontSize: 12,
  },
  cooldownText: {
    color: '#f59e0b',
    fontSize: 13,
    marginTop: 4,
  },
});
