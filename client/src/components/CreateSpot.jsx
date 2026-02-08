import React, { useState } from 'react';
import { registerSpotMetadata } from '../api';
import { createSpotSelf } from '../contract';

const MIN_DEPOSIT = 10;

const COOLDOWN_OPTIONS = [
  { label: '1시간', value: 3600 },
  { label: '6시간', value: 21600 },
  { label: '12시간', value: 43200 },
  { label: '24시간', value: 86400 },
];

export default function CreateSpot({ pinPos, wallet, balance, onClose, onCreated }) {
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

  // 단골 1명 비용 = (방문보상 × 스탬프목표) + 스탬프보너스
  const costPerLoyal = reward > 0 && stampGoal > 0
    ? (reward * stampGoal) + stampBonus
    : 0;
  const loyalCount = costPerLoyal > 0 ? Math.floor(deposit / costPerLoyal) : 0;
  const totalVisits = reward > 0 ? Math.floor(deposit / reward) : 0;

  const cooldownLabel = COOLDOWN_OPTIONS.find(o => o.value === Number(form.cooldown))?.label || '';

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!form.name.trim()) return alert('이름을 입력해주세요');
    if (!pinPos) return alert('지도에서 위치를 선택해주세요');
    if (deposit < MIN_DEPOSIT) return alert(`최소 예치금은 ${MIN_DEPOSIT} TON입니다`);
    if (balance < deposit) return alert(`잔액이 부족합니다 (${Number(balance).toFixed(2)} TON)`);
    if (reward <= 0) return alert('방문 보상은 0보다 커야 합니다');
    if (stampGoal < 1) return alert('스탬프 목표는 1 이상이어야 합니다');
    if (stampBonus < 0) return alert('스탬프 보너스는 0 이상이어야 합니다');

    setSubmitting(true);
    try {
      console.log('=== 스팟 생성 데이터 ===');
      console.log('예치금:', deposit);
      console.log('보상:', reward);
      console.log('스탬프 목표:', stampGoal);
      console.log('스탬프 보너스:', stampBonus);
      console.log('쿨다운:', Number(form.cooldown));
      console.log('중복 발행 허용:', form.allow_duplicate_claims);
      console.log('메타데이터:', {
        name: form.name.trim(),
        description: form.description.trim(),
        lat: pinPos.lat,
        lng: pinPos.lng,
        startTime: form.start_time,
        endTime: form.end_time,
      });
      
      // 컨트랙트에 직접 스팟 생성 (MetaMask 승인)
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
      
      console.log('생성된 스팟 ID:', spotId);

      // 서버에 메타데이터 등록
      const metadataToRegister = {
        name: form.name.trim(),
        description: form.description.trim(),
        lat: pinPos.lat,
        lng: pinPos.lng,
        start_time: form.start_time,
        end_time: form.end_time,
      };
      console.log('서버에 등록할 메타데이터:', metadataToRegister);
      
      await registerSpotMetadata(spotId, metadataToRegister);
      console.log('메타데이터 등록 완료');

      onCreated();
      onClose();
    } catch (err) {
      alert(err.reason || err.message || '스팟 생성 실패');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>스팟 만들기</h2>
        <p style={{ color: '#aaa', fontSize: 13, marginBottom: 4 }}>
          위치: {pinPos.lat.toFixed(5)}, {pinPos.lng.toFixed(5)}
        </p>
        <p style={{ color: '#fbbf24', fontSize: 13, marginBottom: 12 }}>
          내 잔액: {Number(balance).toFixed(2)} TON
        </p>

        <label>매장 이름</label>
        <input value={form.name} onChange={update('name')} placeholder="강남역 카페" />

        <label>매장 설명</label>
        <input value={form.description} onChange={update('description')} placeholder="맛있는 커피와 디저트" />

        <div className="time-row">
          <div>
            <label>영업 시작</label>
            <input type="time" value={form.start_time} onChange={update('start_time')} />
          </div>
          <div>
            <label>영업 종료</label>
            <input type="time" value={form.end_time} onChange={update('end_time')} />
          </div>
        </div>

        <div className="time-row">
          <div>
            <label>총 예치 (TON)</label>
            <input type="number" value={form.deposit} onChange={update('deposit')} min={MIN_DEPOSIT} />
          </div>
          <div>
            <label>방문 보상 (TON)</label>
            <input type="number" value={form.reward} onChange={update('reward')} min="0.1" step="0.1" />
          </div>
        </div>

        <div className="form-divider" />

        <div className="form-section-title">스탬프 설정</div>

        <div className="time-row">
          <div>
            <label>스탬프 목표 (회)</label>
            <input type="number" value={form.stamp_goal} onChange={update('stamp_goal')} min="1" />
          </div>
          <div>
            <label>달성 보너스 (TON)</label>
            <input type="number" value={form.stamp_bonus} onChange={update('stamp_bonus')} min="0" step="0.1" />
          </div>
        </div>

        <label>재방문 쿨다운</label>
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
            <span>같은 ID로 중복 톤 발행 허용 (쿨다운 무시)</span>
          </label>
          <p style={{ fontSize: 12, color: '#888', marginTop: 4, marginLeft: 28 }}>
            활성화 시 같은 텔레그램 아이디가 쿨다운 없이 반복해서 톤을 받을 수 있습니다
          </p>
        </div>

        {/* 비용 계산 */}
        {deposit >= MIN_DEPOSIT && reward > 0 && (
          <div className="cost-summary">
            <div className="cost-row">
              <span>총 지급 가능 방문</span>
              <span>{totalVisits}회</span>
            </div>
            <div className="cost-row">
              <span>단골 1명 비용</span>
              <span>{costPerLoyal} TON ({stampGoal}회 × {reward} + 보너스 {stampBonus})</span>
            </div>
            <div className="cost-row highlight">
              <span>육성 가능 단골 수</span>
              <span>{loyalCount}명</span>
            </div>
          </div>
        )}
        {deposit < MIN_DEPOSIT && (
          <p style={{ color: '#f87171', fontSize: 13, marginTop: 8 }}>
            최소 예치금: {MIN_DEPOSIT} TON
          </p>
        )}

        <button
          className="primary"
          style={{ marginTop: 20 }}
          onClick={handleSubmit}
          disabled={deposit < MIN_DEPOSIT || balance < deposit || submitting}
        >
          {submitting ? 'MetaMask 승인 대기 중...' : `${deposit} TON 예치 + 스팟 생성`}
        </button>
        <button className="secondary" onClick={onClose}>
          취소
        </button>
      </div>
    </div>
  );
}
