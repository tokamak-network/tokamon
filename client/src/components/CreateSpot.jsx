import React, { useState } from 'react';
import { createSpotSelf } from '../contract';
import { Spinner } from './Spinner';
import { t } from '../translations';

const MIN_DEPOSIT = 10;

export default function CreateSpot({ pinPos, wallet, balance, onClose, onCreated, language = 'ko', showToast }) {
  // 기본값: 오늘 ~ 내일, 영업시간 09:00~18:00
  const toLocalDate = (date) => {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };
  const now = new Date();
  const nextMonth = new Date(now.getTime() + 30 * 86400000);
  const browserUtcOffset = -Math.round(now.getTimezoneOffset() / 60);

  const [form, setForm] = useState({
    name: '',
    description: '',
    start_date: toLocalDate(now),
    end_date: toLocalDate(nextMonth),
    daily_start_time: '09:00',
    daily_end_time: '18:00',
    utc_offset: String(browserUtcOffset),
    deposit: '30',
    reward: '0.5',
    stamp_goal: '10',
    stamp_bonus: '5',
    cooldown: '86400',
    cooldown_hours: '24',
    allow_duplicate_claims: false,
  });

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const deposit = Number(form.deposit);
  const reward = Number(form.reward);
  const stampGoal = Number(form.stamp_goal);
  const stampBonus = Number(form.stamp_bonus);


  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!form.name.trim()) return showToast('warning', t(language, 'errorNameRequired'));
    if (!pinPos) return showToast('warning', t(language, 'errorSelectLocation'));
    if (deposit < MIN_DEPOSIT) return showToast('warning', `${t(language, 'errorMinDeposit')} ${MIN_DEPOSIT} TON`);
    if (balance < deposit) return showToast('warning', `${t(language, 'errorInsufficientBalance')} (${Number(balance).toFixed(2)} TON)`);
    if (reward <= 0) return showToast('warning', t(language, 'errorRewardPositive'));
    if (stampGoal < 1) return showToast('warning', t(language, 'errorStampGoalMin'));
    if (stampBonus < 0) return showToast('warning', t(language, 'errorBonusMin'));

    setSubmitting(true);
    try {
      // 시간 파싱: HH:MM → 자정 기준 분
      const parseTimeToMinutes = (timeStr) => {
        if (!timeStr) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
      };
      const dailyStart = parseTimeToMinutes(form.daily_start_time);
      const dailyEnd = parseTimeToMinutes(form.daily_end_time);

      const spotId = await createSpotSelf(
        deposit,
        reward,
        stampGoal,
        stampBonus,
        Number(form.cooldown),
        form.allow_duplicate_claims,
        {
          name: form.name.trim(),
          description: form.description.trim(),
          lat: pinPos.lat,
          lng: pinPos.lng,
          startDate: form.start_date ? Math.floor(new Date(form.start_date + 'T00:00:00Z').getTime() / 1000) : 0,
          endDate: form.end_date ? Math.floor(new Date(form.end_date + 'T23:59:59Z').getTime() / 1000) : 0,
          dailyStartTime: dailyStart,
          dailyEndTime: dailyEnd,
          utcOffset: Number(form.utc_offset) || 0,
        }
      );

      // 서버는 SpotCreated 이벤트를 구독하여 컨트랙트에서 메타데이터를 자동 수집/저장
      showToast('success', t(language, 'spotCreationSuccess') || '스팟이 생성되었습니다!');
      onCreated();
      onClose();
    } catch (err) {
      showToast('error', err.reason || err.message || t(language, 'spotCreationFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t(language, 'createSpotTitle')}</h2>
        <p style={{ color: '#aaa', fontSize: 13, marginBottom: 4 }}>
          {t(language, 'location')}: {pinPos.lat.toFixed(5)}, {pinPos.lng.toFixed(5)}
        </p>
        <p style={{ color: '#fbbf24', fontSize: 13, marginBottom: 12 }}>
          {t(language, 'myBalance')}: {Number(balance).toFixed(2)} TON
        </p>

        <label>{t(language, 'storeName')}</label>
        <input value={form.name} onChange={update('name')} placeholder={t(language, 'storeNamePlaceholder')} />

        <label>{t(language, 'storeDescription')}</label>
        <input value={form.description} onChange={update('description')} placeholder={t(language, 'storeDescPlaceholder')} />

        <div className="time-row">
          <div>
            <label>{t(language, 'startDate')}</label>
            <input type="date" value={form.start_date} onChange={update('start_date')} />
          </div>
          <div>
            <label>{t(language, 'endDate')}</label>
            <input type="date" value={form.end_date} onChange={update('end_date')} />
          </div>
        </div>

        <div className="time-row">
          <div>
            <label>{t(language, 'dailyOpenTime')}</label>
            <input type="time" value={form.daily_start_time} onChange={update('daily_start_time')} />
          </div>
          <div>
            <label>{t(language, 'dailyCloseTime')}</label>
            <input type="time" value={form.daily_end_time} onChange={update('daily_end_time')} />
          </div>
        </div>
        <p style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
          UTC{browserUtcOffset >= 0 ? '+' : ''}{browserUtcOffset} · {t(language, 'dailyHoursDesc')}
        </p>

        <div className="time-row">
          <div>
            <label>{t(language, 'totalDeposit')}</label>
            <input type="number" value={form.deposit} onChange={update('deposit')} min={MIN_DEPOSIT} />
          </div>
          <div>
            <label>{t(language, 'visitReward')}</label>
            <input type="number" value={form.reward} onChange={update('reward')} min="0.1" step="0.1" />
          </div>
        </div>

        <div className="form-divider" />

        <div className="form-section-title">{t(language, 'stampSettings')}</div>

        <div className="time-row">
          <div>
            <label>{t(language, 'stampGoal')}</label>
            <input type="number" value={form.stamp_goal} onChange={update('stamp_goal')} min="1" />
          </div>
          <div>
            <label>{t(language, 'achievementBonus')}</label>
            <input type="number" value={form.stamp_bonus} onChange={update('stamp_bonus')} min="0" step="0.1" />
          </div>
        </div>

        <label>{t(language, 'revisitCooldown')}</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="number"
            value={form.cooldown_hours}
            onChange={(e) => {
              const hours = e.target.value;
              setForm({ ...form, cooldown_hours: hours, cooldown: String(Math.round(Number(hours) * 3600)) });
            }}
            min="0"
            step="0.5"
            style={{ width: 100 }}
          />
          <span style={{ color: '#aaa', fontSize: 13 }}>{t(language, 'hoursUnit')}</span>
        </div>

        <div style={{ marginTop: 16, marginBottom: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.allow_duplicate_claims}
              onChange={(e) => setForm({ ...form, allow_duplicate_claims: e.target.checked })}
              style={{ width: 'auto', cursor: 'pointer' }}
            />
            <span>{t(language, 'allowDuplicateClaims')}</span>
          </label>
          <p style={{ fontSize: 12, color: '#888', marginTop: 4, marginLeft: 28 }}>
            {t(language, 'duplicateClaimsDesc')}
          </p>
        </div>

        {deposit < MIN_DEPOSIT && (
          <p style={{ color: '#f87171', fontSize: 13, marginTop: 8 }}>
            {t(language, 'minimumDeposit')}: {MIN_DEPOSIT} TON
          </p>
        )}

        <button
          className="primary btn-with-spinner"
          style={{ marginTop: 20 }}
          onClick={handleSubmit}
          disabled={deposit < MIN_DEPOSIT || balance < deposit || submitting}
        >
          {submitting && <Spinner size={16} />}
          {submitting ? t(language, 'waitingForMetaMask') : `${deposit} ${t(language, 'depositAndCreateSpot')}`}
        </button>
        <button className="secondary" onClick={onClose}>
          {t(language, 'cancel')}
        </button>
      </div>
    </div>
  );
}
