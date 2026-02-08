import React, { useState, useMemo } from 'react';

export default function SpotList({ spots, onSelect }) {
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
          활성 스팟
        </button>
        <button
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          전체
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="spot-list-empty">
          {filter === 'all'
            ? '등록된 스팟이 없습니다'
            : '활성 스팟이 없습니다'}
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
                  {isExhausted ? '소진' : spot.active ? '활성' : '비활성'}
                </span>
              </div>
              <div className="spot-list-item-detail">
                보상 {spot.reward} TON · 남은 횟수 {claimsLeft}회
              </div>
              <div className="spot-list-item-detail">
                {spot.start_time} ~ {spot.end_time} · 쿨다운 {cooldownHours}시간
              </div>
              {spot.stamp_goal > 0 && (
                <div className="spot-list-item-stamp">
                  스탬프 {spot.stamp_goal}회 달성 시 +{spot.stamp_bonus} TON
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
