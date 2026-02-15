import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Platform,
} from 'react-native';
import { getSpots } from '../services/api';
import { t } from '../utils/translations';

export default function SpotListScreen({ navigation, language = 'ko' }) {
  const [spots, setSpots] = useState([]);
  const [filter, setFilter] = useState('active');
  const [refreshing, setRefreshing] = useState(false);

  const fetchSpots = useCallback(async () => {
    try {
      const data = await getSpots();
      setSpots(data);
    } catch (err) {
      console.warn('Failed to fetch spots:', err.message);
    }
  }, []);

  useEffect(() => {
    fetchSpots();
  }, [fetchSpots]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSpots();
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    if (filter === 'all') return spots;
    return spots.filter((s) => s.remaining >= s.reward);
  }, [spots, filter]);

  const handleSpotPress = (spot) => {
    // Navigate to Map tab and select this spot
    navigation.navigate('MapTab', { selectedSpot: spot });
  };

  const renderSpotCard = ({ item: spot }) => {
    const isExhausted = spot.remaining < spot.reward;
    const claimsLeft = spot.reward > 0 ? Math.floor(spot.remaining / spot.reward) : 0;
    const cooldownHours = spot.cooldown ? spot.cooldown / 3600 : 0;
    const statusColor = isExhausted ? '#6b7280' : spot.active ? '#059669' : '#ef4444';

    return (
      <TouchableOpacity
        style={[styles.card, isExhausted && styles.cardExhausted]}
        onPress={() => handleSpotPress(spot)}
        activeOpacity={0.7}
      >
        {/* Left accent bar */}
        <View style={[styles.cardAccent, { backgroundColor: statusColor }]} />

        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardName, isExhausted && styles.cardNameExhausted]} numberOfLines={1}>
              {spot.name}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.statusText}>
                {isExhausted
                  ? t(language, 'exhausted')
                  : spot.active
                  ? t(language, 'active')
                  : t(language, 'inactive')}
              </Text>
            </View>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statIcon}>💰</Text>
              <Text style={styles.statValue}>{spot.reward} TON</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statIcon}>🎯</Text>
              <Text style={styles.statValue}>{claimsLeft}{t(language, 'times')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statIcon}>⏱️</Text>
              <Text style={styles.statValue}>{cooldownHours}{t(language, 'hours')}</Text>
            </View>
          </View>

          <Text style={styles.cardDetail}>
            {spot.start_time || spot.end_time
              ? `${
                  spot.start_time
                    ? new Date(spot.start_time * 1000).toLocaleString()
                    : ''
                } ~ ${
                  spot.end_time
                    ? new Date(spot.end_time * 1000).toLocaleString()
                    : ''
                }`
              : t(language, 'alwaysOpen') || '항상'}
          </Text>

          {spot.stamp_goal > 0 && (
            <View style={styles.stampRow}>
              <Text style={styles.stampIcon}>⭐</Text>
              <Text style={styles.stampInfo}>
                {t(language, 'stampGoalAchievement')} {spot.stamp_goal}
                {t(language, 'stampGoalAchievement2')} +{spot.stamp_bonus} TON
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Filter tabs */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterBtn, filter === 'active' && styles.filterBtnActive]}
          onPress={() => setFilter('active')}
        >
          <View style={styles.filterInner}>
            <View style={[styles.filterDot, filter === 'active' && styles.filterDotActive]} />
            <Text
              style={[
                styles.filterText,
                filter === 'active' && styles.filterTextActive,
              ]}
            >
              {t(language, 'activeSpots')}
            </Text>
            {filter === 'active' && (
              <View style={styles.filterCountBadge}>
                <Text style={styles.filterCount}>{filtered.length}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, filter === 'all' && styles.filterBtnActive]}
          onPress={() => setFilter('all')}
        >
          <View style={styles.filterInner}>
            <Text
              style={[
                styles.filterText,
                filter === 'all' && styles.filterTextActive,
              ]}
            >
              {t(language, 'allSpots')}
            </Text>
            {filter === 'all' && (
              <View style={styles.filterCountBadge}>
                <Text style={styles.filterCount}>{filtered.length}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderSpotCard}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#4FC3F7"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {filter === 'all'
                ? t(language, 'noSpotsRegistered')
                : t(language, 'noActiveSpots')}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
  },
  filterBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  filterBtnActive: {
    backgroundColor: 'rgba(79,195,247,0.15)',
    borderColor: 'rgba(79,195,247,0.4)',
  },
  filterInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#555',
  },
  filterDotActive: {
    backgroundColor: '#10b981',
  },
  filterText: {
    color: '#777',
    fontSize: 14,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#4FC3F7',
  },
  filterCountBadge: {
    backgroundColor: 'rgba(79,195,247,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    minWidth: 20,
    alignItems: 'center',
  },
  filterCount: {
    color: '#4FC3F7',
    fontSize: 11,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: '#12122a',
    borderRadius: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.08)',
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  cardExhausted: {
    opacity: 0.6,
  },
  cardAccent: {
    width: 4,
  },
  cardBody: {
    flex: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
    marginRight: 8,
    letterSpacing: -0.2,
  },
  cardNameExhausted: {
    color: '#888',
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
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  statIcon: {
    fontSize: 12,
  },
  statValue: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cardDetail: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  stampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    backgroundColor: 'rgba(251,191,36,0.08)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  stampIcon: {
    fontSize: 11,
  },
  stampInfo: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    color: '#666',
    fontSize: 15,
  },
});
