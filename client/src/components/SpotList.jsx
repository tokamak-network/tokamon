import React, { useState, useMemo } from 'react';
import { t } from '../translations';

export default function SpotList({ spots, onSelect, language = 'ko' }) {
  const [filter, setFilter] = useState('active');

  const filtered = useMemo(() => {
    if (filter === 'all') {
      return spots;
    }
    // 'active': remaining >= reward
    return spots.filter((s) => s.remaining >= s.reward);
  }, [spots, filter]);

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
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          {t(language, 'allSpots')}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="spot-list-empty">
          {filter === 'all'
            ? t(language, 'noSpotsRegistered')
            : t(language, 'noActiveSpots')}
        </div>
      ) : (
        filtered.map((spot) => {
          const isExhausted = spot.remaining < spot.reward;
          const claimsLeft =
            spot.reward > 0 ? Math.floor(spot.remaining / spot.reward) : 0;
          const cooldownHours = spot.cooldown ? spot.cooldown / 3600 : 0;

          return (
            <div
              key={spot.id}
              className="spot-list-item"
              onClick={() => onSelect(spot)}
            >
              <div className="spot-list-item-header">
                <span className="spot-list-item-name">{spot.name}</span>
                <span
                  className={`spot-list-item-status ${isExhausted ? 'exhausted' : spot.active ? 'active' : 'inactive'}`}
                >
                  {isExhausted ? t(language, 'exhausted') : spot.active ? t(language, 'active') : t(language, 'inactive')}
                </span>
              </div>
              <div className="spot-list-item-detail">
                {t(language, 'reward')} {spot.reward} TON · {t(language, 'remainingClaims')} {claimsLeft}{t(language, 'times')}
              </div>
              <div className="spot-list-item-detail">
                {spot.start_time || spot.end_time
                  ? `${spot.start_time ? new Date(spot.start_time * 1000).toLocaleString() : ''} ~ ${spot.end_time ? new Date(spot.end_time * 1000).toLocaleString() : ''}`
                  : t(language, 'alwaysActive') || '항상'} · {t(language, 'cooldown')} {cooldownHours}{t(language, 'hours')}
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
