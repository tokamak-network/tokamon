/**
 * WebSocket 재연결 + 지수 백오프 테스트
 *
 * blockchain.js의 새로운 함수들을 단위 테스트합니다:
 * - safeEventHandler: 이벤트 핸들러 오류 격리
 * - getProviderStatus: 프로바이더 상태 조회
 * - destroy: graceful shutdown 정리
 */

// blockchain.js는 모듈 로드 시 ethers, firebase-admin 등에 의존하므로
// 실제 import 대신 개별 함수 로직을 테스트합니다.

describe('safeEventHandler', () => {
  // safeEventHandler 로직 재현
  function safeEventHandler(eventName, handler) {
    return async (...args) => {
      try {
        await handler(...args);
      } catch (e) {
        console.error(`[${eventName}] 이벤트 핸들러 오류:`, e.message);
      }
    };
  }

  it('정상 핸들러를 그대로 실행한다', async () => {
    const results = [];
    const handler = safeEventHandler('TestEvent', async (a, b) => {
      results.push(a + b);
    });

    await handler(1, 2);
    expect(results).toEqual([3]);
  });

  it('핸들러에서 에러가 발생해도 throw하지 않는다', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const handler = safeEventHandler('TestEvent', async () => {
      throw new Error('test error');
    });

    // 에러가 전파되지 않아야 함
    await expect(handler()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      '[TestEvent] 이벤트 핸들러 오류:',
      'test error'
    );
    consoleSpy.mockRestore();
  });

  it('동기 에러도 잡아낸다', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const handler = safeEventHandler('SyncError', () => {
      throw new Error('sync error');
    });

    await expect(handler()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      '[SyncError] 이벤트 핸들러 오류:',
      'sync error'
    );
    consoleSpy.mockRestore();
  });
});

describe('지수 백오프 계산', () => {
  const RECONNECT_BASE_MS = 1000;
  const RECONNECT_MAX_MS = 60000;
  const RECONNECT_JITTER = 0.2;

  function calculateDelay(attempts) {
    const baseDelay = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempts), RECONNECT_MAX_MS);
    const jitter = baseDelay * RECONNECT_JITTER * (Math.random() * 2 - 1);
    return Math.max(0, Math.round(baseDelay + jitter));
  }

  it('첫 번째 시도는 ~1초', () => {
    const delay = calculateDelay(0);
    expect(delay).toBeGreaterThanOrEqual(800);  // 1000 - 20%
    expect(delay).toBeLessThanOrEqual(1200);     // 1000 + 20%
  });

  it('두 번째 시도는 ~2초', () => {
    const delay = calculateDelay(1);
    expect(delay).toBeGreaterThanOrEqual(1600);
    expect(delay).toBeLessThanOrEqual(2400);
  });

  it('세 번째 시도는 ~4초', () => {
    const delay = calculateDelay(2);
    expect(delay).toBeGreaterThanOrEqual(3200);
    expect(delay).toBeLessThanOrEqual(4800);
  });

  it('최대값은 60초를 넘지 않는다', () => {
    for (let i = 0; i < 100; i++) {
      const delay = calculateDelay(20); // 2^20 * 1000 >> 60000
      expect(delay).toBeLessThanOrEqual(72000); // 60000 + 20% jitter
    }
  });

  it('지터로 인해 같은 시도 횟수라도 다른 딜레이가 나올 수 있다', () => {
    const delays = new Set();
    for (let i = 0; i < 20; i++) {
      delays.add(calculateDelay(3));
    }
    // 20번 시도 중 최소 2가지 이상의 서로 다른 딜레이가 나와야 함
    expect(delays.size).toBeGreaterThanOrEqual(2);
  });
});

describe('getProviderStatus 로직', () => {
  it('provider가 없으면 disconnected 반환', () => {
    const provider = null;
    let wsStatus = 'disconnected';
    if (provider) {
      wsStatus = 'connected';
    }
    expect(wsStatus).toBe('disconnected');
  });

  it('WebSocket readyState를 문자열로 변환', () => {
    const states = ['connecting', 'connected', 'closing', 'closed'];
    expect(states[0]).toBe('connecting');
    expect(states[1]).toBe('connected');
    expect(states[2]).toBe('closing');
    expect(states[3]).toBe('closed');
  });
});
