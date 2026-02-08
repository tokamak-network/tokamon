import React from 'react';

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}

export default function History({ history }) {
  if (!history || history.length === 0) {
    return (
      <div className="history-empty">
        아직 클레임 기록이 없습니다
      </div>
    );
  }

  return (
    <div className="history-list">
      <div className="history-header">클레임 기록</div>
      {history.map((item, idx) => {
        const hasBonus = item.bonus && item.bonus > 0;
        const totalReward = (item.reward || 0) + (item.bonus || 0);
        return (
          <div key={idx} className="history-item">
            <div className="history-item-top">
              <span className="history-item-name">{item.spot_name || `스팟 #${item.spot_id}`}</span>
              <span className="history-item-amount">
                +{totalReward} TON
              </span>
            </div>
            <div className="history-item-detail">
              {formatTime(item.timestamp)}
              {item.stamp !== undefined && (
                <span className="history-item-stamp">
                  스탬프 {item.stamp}/{item.stamp_goal || '?'}
                </span>
              )}
            </div>
            {hasBonus && (
              <div className="history-item-bonus">
                스탬프 달성 보너스 +{item.bonus} TON
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
