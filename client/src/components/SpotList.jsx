import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getSpots } from '../api';
import { t } from '../translations';
import { isWithinActiveTime, isSpotClosed } from '../spotUtils';

const PAGE_SIZE = 50;

export default function SpotList({ userPos, onSelect, language = 'ko' }) {
  const [filter, setFilter] = useState('active');
  const [spots, setSpots] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const offsetRef = useRef(0);
  const listRef = useRef(null);

  const fetchPage = useCallback(async (reset = true) => {
    try {
      const newOffset = reset ? 0 : offsetRef.current;
      const params = {
        limit: PAGE_SIZE,
        offset: newOffset,
        filter,
      };
      if (userPos) {
        params.lat = userPos.lat;
        params.lng = userPos.lng;
      }
      const data = await getSpots(params);
      const { spots: pageSpots, pagination } = data;

      if (reset) {
        setSpots(pageSpots);
      } else {
        setSpots((prev) => [...prev, ...pageSpots]);
      }
      setHasMore(pagination.hasMore);
      setTotal(pagination.total);
      offsetRef.current = pagination.offset + pagination.limit;
    } catch (err) {
      console.warn('Failed to fetch spots:', err.message);
    } finally {
      setInitialLoading(false);
    }
  }, [filter, userPos]);

  useEffect(() => {
    setSpots([]);
    offsetRef.current = 0;
    setHasMore(true);
    setInitialLoading(true);
    fetchPage(true);
  }, [fetchPage]);

  const handleFilterChange = (newFilter) => {
    if (newFilter === filter) return;
    setFilter(newFilter);
  };

  const handleScroll = useCallback((e) => {
    if (!hasMore || loadingMore) return;
    const el = e.target;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) {
      setLoadingMore(true);
      fetchPage(false).finally(() => setLoadingMore(false));
    }
  }, [hasMore, loadingMore, fetchPage]);

  const distanceTo = (spot) => {
    if (spot.distance != null) return spot.distance;
    if (!userPos) return null;
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(spot.lat - userPos.lat);
    const dLng = toRad(spot.lng - userPos.lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(userPos.lat)) * Math.cos(toRad(spot.lat)) * Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };

  return (
    <div className="spot-list">
      <div className="spot-list-filter">
        <button
          className={filter === 'active' ? 'active' : ''}
          onClick={() => handleFilterChange('active')}
        >
          {t(language, 'activeSpots')}{filter === 'active' && total > 0 ? ` (${total})` : ''}
        </button>
        <button
          className={filter === 'inactive' ? 'active' : ''}
          onClick={() => handleFilterChange('inactive')}
        >
          {t(language, 'inactiveSpots')}{filter === 'inactive' && total > 0 ? ` (${total})` : ''}
        </button>
        <button
          className={filter === 'all' ? 'active' : ''}
          onClick={() => handleFilterChange('all')}
        >
          {t(language, 'allSpots')}{filter === 'all' && total > 0 ? ` (${total})` : ''}
        </button>
      </div>

      <div
        className="spot-list-scroll"
        ref={listRef}
        onScroll={handleScroll}
        style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 200px)' }}
      >
        {initialLoading ? (
          <div className="spot-list-empty">{t(language, 'loadingSpots') || 'Loading...'}</div>
        ) : spots.length === 0 ? (
          <div className="spot-list-empty">
            {filter === 'active'
              ? t(language, 'noActiveSpots')
              : filter === 'inactive'
              ? t(language, 'noInactiveSpots')
              : t(language, 'noSpotsRegistered')}
          </div>
        ) : (
          <>
            {spots.map((spot) => {
              const isExhausted = spot.remaining < spot.reward;
              const closed = isSpotClosed(spot);
              const active = spot.active !== undefined ? spot.active : (!closed && !isExhausted && isWithinActiveTime(spot));
              const claimsLeft =
                spot.reward > 0 ? Math.floor(spot.remaining / spot.reward) : 0;
              const cooldownHours = spot.cooldown ? spot.cooldown / 3600 : 0;
              const utc = spot.utc_offset || 0;
              const utcLabel = ` (UTC${utc >= 0 ? '+' : ''}${utc})`;
              const dist = distanceTo(spot);

              return (
                <div
                  key={spot.id}
                  className={`spot-list-item${closed ? ' spot-closed' : ''}`}
                  onClick={() => onSelect(spot)}
                >
                  <div className="spot-list-item-header">
                    <span className="spot-list-item-name">{spot.name}{spot.description ? ` · ${spot.description}` : ''}</span>
                    <span
                      className={`spot-list-item-status ${isExhausted ? 'exhausted' : closed ? 'closed' : active ? 'active' : 'inactive'}`}
                    >
                      {isExhausted ? t(language, 'exhausted') : closed ? t(language, 'closedStatus') : active ? t(language, 'active') : t(language, 'outsideActiveTime')}
                    </span>
                  </div>
                  <div className="spot-list-item-detail">
                    {t(language, 'reward')} {spot.reward} TON · {t(language, 'remainingClaims')} {claimsLeft}{t(language, 'times')}
                    {dist !== null && <span style={{ color: '#94a3b8', marginLeft: 8 }}>📍 {dist >= 1000 ? `${(dist / 1000).toFixed(1)}km` : `${dist}m`}</span>}
                  </div>
                  <div className="spot-list-item-detail">
                    {spot.start_time || spot.end_time
                      ? `${spot.start_time ? (() => { const d = new Date(spot.start_time * 1000); return `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}`; })() : ''} ~ ${spot.end_time ? (() => { const d = new Date(spot.end_time * 1000); return `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}`; })() : ''}${utcLabel}`
                      : t(language, 'alwaysActive')}
                    {(spot.daily_start_time > 0 || spot.daily_end_time > 0) && ` | ${String(Math.floor(spot.daily_start_time / 60)).padStart(2, '0')}:${String(spot.daily_start_time % 60).padStart(2, '0')}~${String(Math.floor(spot.daily_end_time / 60)).padStart(2, '0')}:${String(spot.daily_end_time % 60).padStart(2, '0')}`}
                    {' · '}{t(language, 'cooldown')} {cooldownHours}{t(language, 'hours')}
                  </div>
                  {spot.stamp_goal > 0 && (
                    <div className="spot-list-item-stamp">
                      {t(language, 'stampGoalAchievement')} {spot.stamp_goal}{t(language, 'stampGoalAchievement2')} +{spot.stamp_bonus} TON
                    </div>
                  )}
                </div>
              );
            })}
            {loadingMore && (
              <div className="spot-list-empty" style={{ padding: '12px 0' }}>Loading...</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
