import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
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

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handleSpotPress(spot)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardName} numberOfLines={1}>
            {spot.name}
          </Text>
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
                ? t(language, 'exhausted')
                : spot.active
                ? t(language, 'active')
                : t(language, 'inactive')}
            </Text>
          </View>
        </View>

        <Text style={styles.cardDetail}>
          {t(language, 'reward')} {spot.reward} TON · {t(language, 'remainingClaims')}{' '}
          {claimsLeft}
          {t(language, 'times')}
        </Text>

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
            : t(language, 'alwaysOpen') || '항상'}{' '}
          · {t(language, 'cooldown')} {cooldownHours}
          {t(language, 'hours')}
        </Text>

        {spot.stamp_goal > 0 && (
          <Text style={styles.stampInfo}>
            {t(language, 'stampGoalAchievement')} {spot.stamp_goal}
            {t(language, 'stampGoalAchievement2')} +{spot.stamp_bonus} TON
          </Text>
        )}
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
          <Text
            style={[
              styles.filterText,
              filter === 'active' && styles.filterTextActive,
            ]}
          >
            {t(language, 'activeSpots')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, filter === 'all' && styles.filterBtnActive]}
          onPress={() => setFilter('all')}
        >
          <Text
            style={[
              styles.filterText,
              filter === 'all' && styles.filterTextActive,
            ]}
          >
            {t(language, 'allSpots')}
          </Text>
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
    backgroundColor: '#0f0f0f',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  filterBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: '#1e1e2e',
  },
  filterBtnActive: {
    backgroundColor: '#4FC3F7',
  },
  filterText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  cardDetail: {
    color: '#aaa',
    fontSize: 13,
    marginTop: 3,
  },
  stampInfo: {
    color: '#fbbf24',
    fontSize: 12,
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    color: '#888',
    fontSize: 15,
  },
});
