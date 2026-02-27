/**
 * Phase 2 — 글로벌 에러 핸들러 + safeEventHandler 테스트
 */

describe('safeEventHandler 격리 검증', () => {
  function safeEventHandler(eventName, handler) {
    return async (...args) => {
      try {
        await handler(...args);
      } catch (e) {
        console.error(`[${eventName}] 이벤트 핸들러 오류:`, e.message);
      }
    };
  }

  it('여러 이벤트 핸들러 중 하나가 실패해도 다른 핸들러에 영향 없음', async () => {
    const results = [];
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const handler1 = safeEventHandler('Event1', async () => {
      results.push('event1-ok');
    });

    const handler2 = safeEventHandler('Event2', async () => {
      throw new Error('event2 failed');
    });

    const handler3 = safeEventHandler('Event3', async () => {
      results.push('event3-ok');
    });

    await handler1();
    await handler2();
    await handler3();

    expect(results).toEqual(['event1-ok', 'event3-ok']);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith('[Event2] 이벤트 핸들러 오류:', 'event2 failed');

    consoleSpy.mockRestore();
  });

  it('비동기 에러도 안전하게 잡아낸다', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const handler = safeEventHandler('AsyncError', async () => {
      await new Promise((_, reject) => setTimeout(() => reject(new Error('async fail')), 10));
    });

    await expect(handler()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith('[AsyncError] 이벤트 핸들러 오류:', 'async fail');

    consoleSpy.mockRestore();
  });

  it('핸들러의 반환값은 무시된다 (undefined 반환)', async () => {
    const handler = safeEventHandler('ReturnTest', async () => {
      return 'some value';
    });

    const result = await handler();
    expect(result).toBeUndefined();
  });
});

describe('gracefulShutdown 로직', () => {
  it('isShuttingDown 플래그로 중복 실행 방지', () => {
    let isShuttingDown = false;
    let callCount = 0;

    function shutdown() {
      if (isShuttingDown) return;
      isShuttingDown = true;
      callCount++;
    }

    shutdown();
    shutdown();
    shutdown();

    expect(callCount).toBe(1);
  });
});
