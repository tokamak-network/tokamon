import React, { useState } from 'react';
import { registerSpotMetadata } from '../api';
import { createSpotSelf } from '../contract';
import { t } from '../translations';

const MIN_DEPOSIT = 10;

export default function CreateSpot({ pinPos, wallet, balance, onClose, onCreated, language = 'ko' }) {
  const COOLDOWN_OPTIONS = [
    { label: t(language, 'oneHour'), value: 3600 },
    { label: t(language, 'sixHours'), value: 21600 },
    { label: t(language, 'twelveHours'), value: 43200 },
    { label: t(language, 'twentyFourHours'), value: 86400 },
  ];

  const [form, setForm] = useState({
    name: '',
    description: '',
    start_time: '00:00',
    end_time: '23:59',
    deposit: '30',
    reward: '0.5',
    stamp_goal: '10',
    stamp_bonus: '5',
    cooldown: '86400',
    allow_duplicate_claims: false,
  });

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const deposit = Number(form.deposit);
  const reward = Number(form.reward);
  const stampGoal = Number(form.stamp_goal);
  const stampBonus = Number(form.stamp_bonus);

  const costPerLoyal = reward > 0 && stampGoal > 0
    ? (reward * stampGoal) + stampBonus
    : 0;
  const loyalCount = costPerLoyal > 0 ? Math.floor(deposit / costPerLoyal) : 0;
  const totalVisits = reward > 0 ? Math.floor(deposit / reward) : 0;

  const cooldownLabel = COOLDOWN_OPTIONS.find(o => o.value === Number(form.cooldown))?.label || '';

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!form.name.trim()) return alert(t(language, 'errorNameRequired'));
    if (!pinPos) return alert(t(language, 'errorSelectLocation'));
    if (deposit < MIN_DEPOSIT) return alert(`${t(language, 'errorMinDeposit')} ${MIN_DEPOSIT} TON`);
    if (balance < deposit) return alert(`${t(language, 'errorInsufficientBalance')} (${Number(balance).toFixed(2)} TON)`);
    if (reward <= 0) return alert(t(language, 'errorRewardPositive'));
    if (stampGoal < 1) return alert(t(language, 'errorStampGoalMin'));
    if (stampBonus < 0) return alert(t(language, 'errorBonusMin'));

    setSubmitting(true);
    try {
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
          startTime: form.start_time,
          endTime: form.end_time,
        }
      );

      const metadataToRegister = {
        name: form.name.trim(),
        description: form.description.trim(),
        lat: pinPos.lat,
        lng: pinPos.lng,
        start_time: form.start_time,
        end_time: form.end_time,
      };

      await registerSpotMetadata(spotId, metadataToRegister);

      onCreated();
      onClose();
    } catch (err) {
      alert(err.reason || err.message || t(language, 'spotCreationFailed'));
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
            <label>{t(language, 'openingTime')}</label>
            <input type="time" value={form.start_time} onChange={update('start_time')} />
          </div>
          <div>
            <label>{t(language, 'closingTime')}</label>
            <input type="time" value={form.end_time} onChange={update('end_time')} />
          </div>
        </div>

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
        <div className="cooldown-options">
          {COOLDOWN_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`cooldown-option ${Number(form.cooldown) === opt.value ? 'selected' : ''}`}
              onClick={() => setForm({ ...form, cooldown: String(opt.value) })}
            >
              {opt.label}
            </button>
          ))}
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

        {/* Cost Summary */}
        {deposit >= MIN_DEPOSIT && reward > 0 && (
          <div className="cost-summary">
            <div className="cost-row">
              <span>{t(language, 'totalPossibleVisits')}</span>
              <span>{totalVisits}{t(language, 'visits')}</span>
            </div>
            <div className="cost-row">
              <span>{t(language, 'costPerLoyal')}</span>
              <span>{costPerLoyal} TON ({stampGoal}{t(language, 'visits')} × {reward} + {t(language, 'bonus')} {stampBonus})</span>
            </div>
            <div className="cost-row highlight">
              <span>{t(language, 'possibleLoyalCustomers')}</span>
              <span>{loyalCount}{t(language, 'people')}</span>
            </div>
          </div>
        )}
        {deposit < MIN_DEPOSIT && (
          <p style={{ color: '#f87171', fontSize: 13, marginTop: 8 }}>
            {t(language, 'minimumDeposit')}: {MIN_DEPOSIT} TON
          </p>
        )}

        <button
          className="primary"
          style={{ marginTop: 20 }}
          onClick={handleSubmit}
          disabled={deposit < MIN_DEPOSIT || balance < deposit || submitting}
        >
          {submitting ? t(language, 'waitingForMetaMask') : `${deposit} ${t(language, 'depositAndCreateSpot')}`}
        </button>
        <button className="secondary" onClick={onClose}>
          {t(language, 'cancel')}
        </button>
      </div>
    </div>
  );
}
