// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import SpotInfo from './SpotInfo';

// contract 모듈 전체 모킹
vi.mock('../contract', () => ({
  redepositSelf: vi.fn(),
  getStampInfoFromContract: vi.fn().mockResolvedValue(null),
}));

// translations 모킹
vi.mock('../translations', () => ({
  t: (lang, key) => key,
}));

// spotUtils 모킹 — 활성 상태로 고정
vi.mock('../spotUtils', () => ({
  isWithinActiveTime: () => true,
  isSpotClosed: () => false,
}));

// ─── UTC 정규화 날짜 표시 테스트 ───

describe('SpotInfo — UTC 정규화 날짜 표시', () => {
  const baseSpot = {
    id: 0,
    name: 'Test Spot',
    description: 'Test',
    lat: 37.566535,
    lng: 126.977969,
    reward: 1,
    remaining: 10,
    stamp_goal: 5,
    stamp_bonus: 0,
    active: true,
    daily_start_time: 0,
    daily_end_time: 0,
    utc_offset: 0,
  };

  // 전체 렌더 텍스트에서 검증 (detail div 순서에 의존하지 않음)
  function getRenderedText(spot) {
    const { container } = render(<SpotInfo spot={spot} language="ko" />);
    return container.textContent || '';
  }

  it('start_time=0, end_time=0 → "alwaysActive" 표시', () => {
    const text = getRenderedText({ ...baseSpot, start_time: 0, end_time: 0 });
    expect(text).toContain('alwaysActive');
  });

  it('Feb 18 UTC → 타임존 무관하게 "2026.2.18" 표시', () => {
    // start_time = 1771372800 (Feb 18 00:00 UTC), utc_offset = 9 (KST)
    const text = getRenderedText({
      ...baseSpot, start_time: 1771372800, end_time: 1774051199, utc_offset: 9,
    });
    expect(text).toContain('2026.2.18');
    expect(text).toContain('2026.3.20');
    expect(text).toContain('UTC+9');
  });

  it('UTC-5 스팟도 동일한 UTC 날짜 표시 (Feb 18)', () => {
    const text = getRenderedText({
      ...baseSpot, start_time: 1771372800, end_time: 1774051199, utc_offset: -5,
    });
    // EST 브라우저에서도 "Feb 17"이 아닌 "Feb 18"이어야 함
    expect(text).toContain('2026.2.18');
    expect(text).toContain('2026.3.20');
    expect(text).toContain('UTC-5');
  });

  it('일별 영업시간 표시 (09:00~18:00)', () => {
    const text = getRenderedText({
      ...baseSpot,
      start_time: 1771372800, end_time: 1774051199,
      daily_start_time: 540, daily_end_time: 1080, utc_offset: 9,
    });
    expect(text).toContain('09:00~18:00');
  });

  it('야간 영업시간 표시 (22:00~06:00)', () => {
    const text = getRenderedText({
      ...baseSpot,
      start_time: 1771372800, end_time: 1774051199,
      daily_start_time: 1320, daily_end_time: 360, utc_offset: 9,
    });
    expect(text).toContain('22:00~06:00');
  });

  it('활성 상태 표시 — 활성시간 내', () => {
    const { container } = render(
      <SpotInfo spot={{ ...baseSpot, start_time: 0, end_time: 0, active: true }} language="ko" />
    );
    const statusEl = container.querySelector('.status');
    expect(statusEl?.textContent).toBe('activeStatus');
    expect(statusEl?.classList.contains('active')).toBe(true);
  });
});
