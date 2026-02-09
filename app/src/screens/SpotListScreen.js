import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { t } from '../translations';

export default function SpotListScreen({ spots, language }) {
  const [filter, setFilter] = useState('active');

  const filtered = useMemo(() => {
    if (filter === 'all') return spots;
    return spots.filter((s) => s.remaining >= s.reward);
  }, [spots, filter]);

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterBtn, filter === 'active' && styles.filterActive]}
          onPress={() => setFilter('active')}
        >
          <Text style={[styles.filterText, filter === 'active' && styles.filterTextActive]}>
            {t(language, 'activeSpots')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, filter === 'all' && styles.filterActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            {t(language, 'allSpots')}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.list}>
        {filtered.length === 0 ? (
          <Text style={styles.empty}>
            {filter === 'all'
              ? t(language, 'noSpotsRegistered')
              : t(language, 'noActiveSpots')}
          </Text>
        ) : (
          filtered.map((spot) => {
            const isExhausted = spot.remaining < spot.reward;
            const claimsLeft = spot.reward > 0 ? Math.floor(spot.remaining / spot.reward) : 0;
            const cooldownHours = spot.cooldown ? spot.cooldown / 3600 : 0;

            return (
              <View key={spot.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.spotName}>{spot.name}</Text>
                  <Text style={[
                    styles.status,
                    isExhausted ? styles.exhausted : spot.active ? styles.active : styles.inactive,
                  ]}>
                    {isExhausted
                      ? t(language, 'exhausted')
                      : spot.active
                        ? t(language, 'active')
                        : t(language, 'inactive')}
                  </Text>
                </View>
                <Text style={styles.detail}>
                  {t(language, 'reward')} {spot.reward} TON · {t(language, 'remainingClaims')} {claimsLeft}{t(language, 'times')}
                </Text>
                <Text style={styles.detail}>
                  {spot.start_time} ~ {spot.end_time} · {t(language, 'cooldown')} {cooldownHours}{t(language, 'hours')}
                </Text>
                {spot.stamp_goal > 0 && (
                  <Text style={styles.stamp}>
                    {t(language, 'stampGoalAchievement')} {spot.stamp_goal}{t(language, 'stampGoalAchievement2')} +{spot.stamp_bonus} TON
                  </Text>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  filterRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#222',
  },
  filterActive: {
    backgroundColor: '#3b82f6',
  },
  filterText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#fff',
  },
  list: { flex: 1, paddingHorizontal: 12 },
  empty: {
    color: '#666',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 40,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  spotName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  status: { fontSize: 12, fontWeight: '600' },
  exhausted: { color: '#f97316' },
  active: { color: '#4ade80' },
  inactive: { color: '#f87171' },
  detail: { color: '#aaa', fontSize: 13, marginTop: 2 },
  stamp: { color: '#facc15', fontSize: 13, marginTop: 4 },
});
