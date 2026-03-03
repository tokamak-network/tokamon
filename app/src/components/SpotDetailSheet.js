import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  PanResponder,
  Platform,
} from 'react-native';
import { getStampInfo, getDeviceStampInfo } from '../services/api';
import StampProgress from './StampProgress';
import ClaimButton from './ClaimButton';
import { t } from '../utils/translations';
import { isWithinActiveTime, isSpotClosed } from '../utils/spotUtils';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = 380;

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

export default function SpotDetailSheet({ spot, userPos, wallet, deviceId, pushToken, receivedCode, onClose, onClaimed, language = 'ko' }) {
  const [stampInfo, setStampInfo] = useState(null);
  const translateY = useState(new Animated.Value(SHEET_HEIGHT))[0];
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 10,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 80) {
          onCloseRef.current();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (spot) {
      translateY.setValue(SHEET_HEIGHT);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 9,
      }).start();

      setStampInfo(null);
      if (deviceId) {
        getDeviceStampInfo(deviceId, spot.id)
          .then(setStampInfo)
          .catch(() => setStampInfo(null));
      } else if (wallet) {
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
  }, [spot, wallet, deviceId]);

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

  const closed = isSpotClosed(spot);
  const active = !closed && !isExhausted && isWithinActiveTime(spot);
  const statusColor = isExhausted ? '#6b7280' : closed ? '#6b7280' : active ? '#059669' : '#ef4444';
  const statusLabel = isExhausted
    ? t(language, 'tonExhausted')
    : closed
    ? t(language, 'closedStatus')
    : active
    ? t(language, 'activeStatus')
    : t(language, 'inactiveStatus');

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
        <View style={styles.headerLeft}>
          <Text style={styles.name} numberOfLines={1}>{spot.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {spot.description ? (
        <Text style={styles.description} numberOfLines={2}>{spot.description}</Text>
      ) : null}

      {/* Info cards */}
      <View style={styles.infoRow}>
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>💰</Text>
          <Text style={styles.infoValue}>{spot.reward} TON</Text>
          <Text style={styles.infoLabel}>{t(language, 'reward')}</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>🎯</Text>
          <Text style={styles.infoValue}>{claimsLeft}</Text>
          <Text style={styles.infoLabel}>{t(language, 'remainingClaims')}</Text>
        </View>
        {distance !== null && (
          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>📍</Text>
            <Text style={styles.infoValue}>
              {distance >= 1000 ? `${(distance / 1000).toFixed(1)}km` : `${distance}m`}
            </Text>
            <Text style={styles.infoLabel}>{t(language, 'distance')}</Text>
          </View>
        )}
      </View>

      {/* Active time */}
      {(spot.start_time > 0 || spot.end_time > 0 || spot.daily_start_time > 0 || spot.daily_end_time > 0) && (
        <View style={styles.remainingBar}>
          <Text style={styles.remainingLabel}>{t(language, 'activeTime')}</Text>
          <Text style={styles.remainingValue}>
            {spot.start_time || spot.end_time
              ? `${spot.start_time ? (() => { const d = new Date(spot.start_time * 1000); return `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}`; })() : ''} ~ ${spot.end_time ? (() => { const d = new Date(spot.end_time * 1000); return `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}`; })() : ''}`
              : t(language, 'alwaysOpen')}
            {(spot.daily_start_time > 0 || spot.daily_end_time > 0)
              ? ` | ${String(Math.floor(spot.daily_start_time / 60)).padStart(2, '0')}:${String(spot.daily_start_time % 60).padStart(2, '0')}~${String(Math.floor(spot.daily_end_time / 60)).padStart(2, '0')}:${String(spot.daily_end_time % 60).padStart(2, '0')}`
              : ''}
          </Text>
        </View>
      )}

      {/* Remaining TON bar */}
      <View style={styles.remainingBar}>
        <Text style={styles.remainingLabel}>{t(language, 'remainingTON')}</Text>
        <Text style={styles.remainingValue}>{spot.remaining?.toFixed(2)} TON</Text>
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

      {/* Claim Button */}
      <ClaimButton
        spot={spot}
        distance={distance}
        userPos={userPos}
        deviceId={deviceId}
        pushToken={pushToken}
        receivedCode={receivedCode}
        isOwner={isOwner}
        isExhausted={isExhausted}
        isOnCooldown={isOnCooldown}
        cooldownLeft={cooldownLeft}
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
    backgroundColor: '#12122a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    shadowColor: '#a78bfa',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 15,
    maxHeight: SHEET_HEIGHT,
    borderTopWidth: 1,
    borderTopColor: 'rgba(167,139,250,0.15)',
  },
  handleBar: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginRight: 12,
  },
  name: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    flex: 1,
    letterSpacing: -0.3,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#888',
    fontSize: 14,
  },
  description: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  infoRow: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 10,
  },
  infoCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  infoIcon: {
    fontSize: 16,
    marginBottom: 4,
  },
  infoLabel: {
    color: '#666',
    fontSize: 10,
    marginTop: 2,
    fontWeight: '500',
  },
  infoValue: {
    color: '#fbbf24',
    fontSize: 16,
    fontWeight: '700',
  },
  remainingBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
  },
  remainingLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '500',
  },
  remainingValue: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: '600',
  },
});
