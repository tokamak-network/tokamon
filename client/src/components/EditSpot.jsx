import React, { useState } from 'react';
import { updateSpot } from '../contract';
import { Spinner } from './Spinner';
import { t } from '../translations';

export default function EditSpot({ spot, onUpdated, onCancel, language = 'ko', showToast }) {
  const toLocalDate = (timestamp) => {
    if (!timestamp) return '';
    const d = new Date(timestamp * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };
  const minutesToTime = (mins) => {
    if (mins == null) return '00:00';
    const h = String(Math.floor(mins / 60)).padStart(2, '0');
    const m = String(mins % 60).padStart(2, '0');
    return `${h}:${m}`;
  };

  const [form, setForm] = useState({
    name: spot.name || '',
    description: spot.description || '',
    lat: String(spot.lat || 0),
    lng: String(spot.lng || 0),
    start_date: toLocalDate(spot.start_time),
    end_date: toLocalDate(spot.end_time),
    daily_start_time: minutesToTime(spot.daily_start_time),
    daily_end_time: minutesToTime(spot.daily_end_time),
    utc_offset: String(spot.utc_offset || 0),
    reward: String(spot.reward || '0.5'),
    stamp_goal: String(spot.stamp_goal || '10'),
    stamp_bonus: String(spot.stamp_bonus || '0'),
    cooldown: String(spot.cooldown || '86400'),
    cooldown_hours: String((spot.cooldown || 86400) / 3600),
    allow_duplicate_claims: spot.allow_duplicate_claims || false,
  });

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const reward = Number(form.reward);
  const stampGoal = Number(form.stamp_goal);
  const stampBonus = Number(form.stamp_bonus);

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!form.name.trim()) return showToast('warning', t(language, 'errorNameRequired'));
    if (reward <= 0) return showToast('warning', t(language, 'errorRewardPositive'));
    if (stampGoal < 0) return showToast('warning', t(language, 'errorStampGoalMin'));
    if (stampBonus < 0) return showToast('warning', t(language, 'errorBonusMin'));
    if (stampGoal > 0 && stampBonus <= 0) return showToast('warning', t(language, 'errorBonusRequiredWithGoal'));

    const lat = Number(form.lat);
    const lng = Number(form.lng);
    if (isNaN(lat) || isNaN(lng)) return showToast('warning', t(language, 'errorInvalidCoordinates'));

    const parseTimeToMinutes = (timeStr) => {
      if (!timeStr) return 0;
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };
    const dailyStart = parseTimeToMinutes(form.daily_start_time);
    const dailyEnd = parseTimeToMinutes(form.daily_end_time);
    if (dailyStart >= 1440 || dailyEnd >= 1440) return showToast('warning', t(language, 'errorInvalidDailyTime'));
    if (form.start_date && form.end_date && form.start_date > form.end_date) return showToast('warning', t(language, 'errorStartNotAfterEnd'));
    const sameDay = !form.start_date || !form.end_date || form.start_date === form.end_date;
    if (sameDay && (dailyStart > 0 || dailyEnd > 0) && dailyStart >= dailyEnd) return showToast('warning', t(language, 'errorOpenBeforeClose'));
    const utcOffset = Number(form.utc_offset) || 0;
    if (utcOffset < -12 || utcOffset > 14) return showToast('warning', t(language, 'errorInvalidUtcOffset'));

    setSubmitting(true);
    try {

      await updateSpot(
        spot.id,
        reward,
        stampGoal,
        stampBonus,
        Number(form.cooldown),
        form.allow_duplicate_claims,
        {
          name: form.name.trim(),
          description: form.description.trim(),
          lat,
          lng,
          startDate: form.start_date ? Math.floor(new Date(form.start_date + 'T00:00:00Z').getTime() / 1000) : 0,
          endDate: form.end_date ? Math.floor(new Date(form.end_date + 'T23:59:59Z').getTime() / 1000) : 0,
          dailyStartTime: dailyStart,
          dailyEndTime: dailyEnd,
          utcOffset: Number(form.utc_offset) || 0,
        }
      );

      showToast('success', t(language, 'spotUpdateSuccess'));
      onUpdated();
    } catch (err) {
      showToast('error', err.reason || err.message || t(language, 'spotUpdateFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const browserUtcOffset = -Math.round(new Date().getTimezoneOffset() / 60);

  return (
    <div className="modal-overlay" style={{ alignItems: 'center' }} onClick={onCancel}>
      <div className="modal" style={{ borderRadius: 20 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginBottom: 8 }}>{t(language, 'editSpotTitle')}</h2>

        <label>{t(language, 'storeName')}</label>
        <input value={form.name} onChange={update('name')} placeholder={t(language, 'storeNamePlaceholder')} />

        <label>{t(language, 'storeDescription')}</label>
        <input value={form.description} onChange={update('description')} placeholder={t(language, 'storeDescPlaceholder')} />

        <div className="time-row">
          <div>
            <label>{t(language, 'latitude')}</label>
            <input type="number" value={form.lat} onChange={update('lat')} step="0.00001" />
          </div>
          <div>
            <label>{t(language, 'longitude')}</label>
            <input type="number" value={form.lng} onChange={update('lng')} step="0.00001" />
          </div>
        </div>

        <div className="time-row">
          <div><label>{t(language, 'startDate')}</label><input type="date" value={form.start_date} onChange={update('start_date')} /></div>
          <div><label>{t(language, 'endDate')}</label><input type="date" value={form.end_date} onChange={update('end_date')} /></div>
        </div>

        <div className="time-row">
          <div><label>{t(language, 'dailyOpenTime')}</label><input type="time" value={form.daily_start_time} onChange={update('daily_start_time')} /></div>
          <div><label>{t(language, 'dailyCloseTime')}</label><input type="time" value={form.daily_end_time} onChange={update('daily_end_time')} /></div>
        </div>
        <p style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
          UTC{browserUtcOffset >= 0 ? '+' : ''}{browserUtcOffset} · {t(language, 'dailyHoursDesc')}
        </p>

        <p style={{ color: '#fbbf24', fontSize: 13, marginTop: 8, marginBottom: 4 }}>
          {t(language, 'remainingTON')}: {spot.remaining} TON
        </p>

        <div className="time-row">
          <div>
            <label>{t(language, 'visitReward')} (TON)</label>
            <input type="number" value={form.reward} onChange={update('reward')} min="0.1" step="0.1" />
          </div>
          <div>
            <label>{t(language, 'revisitCooldown')}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="number" value={form.cooldown_hours} onChange={(e) => { const hours = e.target.value; setForm({ ...form, cooldown_hours: hours, cooldown: String(Math.round(Number(hours) * 3600)) }); }} min="0" step="0.5" />
              <span style={{ color: '#aaa', fontSize: 13 }}>{t(language, 'hoursUnit')}</span>
            </div>
          </div>
        </div>

        <div className="time-row">
          <div>
            <label>{t(language, 'stampGoal')}</label>
            <input type="number" value={form.stamp_goal} onChange={update('stamp_goal')} min="1" />
          </div>
          <div>
            <label>{t(language, 'achievementBonus')} (TON)</label>
            <input type="number" value={form.stamp_bonus} onChange={update('stamp_bonus')} min="0" step="0.1" />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 4, marginBottom: 0 }}>
          <input type="checkbox" checked={form.allow_duplicate_claims} onChange={(e) => setForm({ ...form, allow_duplicate_claims: e.target.checked })} style={{ width: 'auto', cursor: 'pointer' }} />
          <span style={{ fontSize: 13 }}>{t(language, 'allowDuplicateClaims')}</span>
        </label>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="primary btn-with-spinner" style={{ flex: 1, marginTop: 0 }} onClick={handleSubmit} disabled={submitting}>
            {submitting && <Spinner size={16} />}
            {submitting ? t(language, 'waitingForMetaMask') : t(language, 'saveChanges')}
          </button>
          <button className="secondary" style={{ flex: 1, marginTop: 0 }} onClick={onCancel}>
            {t(language, 'cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
