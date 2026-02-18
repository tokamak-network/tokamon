import React, { useState, useMemo } from 'react';
import { t } from '../translations';
import { isWithinActiveTime, isSpotClosed } from '../spotUtils';

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

export default function SpotList({ spots, userPos, onSelect, language = 'ko' }) {
  const [filter, setFilter] = useState('active');

  const distanceTo = (spot) => {
    if (!userPos) return Infinity;
    return haversineDistance(userPos.lat, userPos.lng, spot.lat, spot.lng);
  };

  const filtered = useMemo(() => {
    let list;
    if (filter === 'active') {
      list = spots.filter((s) => s.remaining >= s.reward && !isSpotClosed(s) && isWithinActiveTime(s));
    } else if (filter === 'inactive') {
      list = spots.filter((s) => s.remaining >= s.reward && !isSpotClosed(s) && !isWithinActiveTime(s));
    } else {
      list = [...spots];
    }
    // sort by distance (closest first)
    return list.sort((a, b) => distanceTo(a) - distanceTo(b));
  }, [spots, filter, userPos]);

  return (
    <div className="spot-list">
      <div className="spot-list-filter">
        <button
          className={filter === 'active' ? 'active' : ''}
          onClick={() => setFilter('active')}
        >
          {t(language, 'activeSpots')}
        </button>
        <button
          className={filter === 'inactive' ? 'active' : ''}
          onClick={() => setFilter('inactive')}
        >
          {t(language, 'inactiveSpots')}
        </button>
        <button
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          {t(language, 'allSpots')}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="spot-list-empty">
          {filter === 'active'
            ? t(language, 'noActiveSpots')
            : filter === 'inactive'
            ? t(language, 'noInactiveSpots')
            : t(language, 'noSpotsRegistered')}
        </div>
      ) : (
        filtered.map((spot) => {
          const isExhausted = spot.remaining < spot.reward;
          const closed = isSpotClosed(spot);
          const active = !closed && !isExhausted && isWithinActiveTime(spot);
          const claimsLeft =
            spot.reward > 0 ? Math.floor(spot.remaining / spot.reward) : 0;
          const cooldownHours = spot.cooldown ? spot.cooldown / 3600 : 0;
          const utc = spot.utc_offset || 0;
          const utcLabel = ` (UTC${utc >= 0 ? '+' : ''}${utc})`;
          const dist = userPos ? Math.round(distanceTo(spot)) : null;

          return (
            <div
              key={spot.id}
              className={`spot-list-item${closed ? ' spot-closed' : ''}`}
              onClick={() => onSelect(spot)}
            >
              <div className="spot-list-item-header">
                <span className="spot-list-item-name">{spot.name}</span>
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
        })
      )}
    </div>
  );
}
