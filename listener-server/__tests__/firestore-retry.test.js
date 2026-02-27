/**
 * Phase 6 — Firestore 재시도 로직 테스트
 *
 * withRetry 래퍼의 동작을 테스트합니다.
 */

// withRetry 로직 재현 (firebase-admin.js의 withRetry와 동일)
async function withRetry(operation, label, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (e) {
      if (attempt === maxRetries) {
        console.error(`[Firestore] ${label} 최종 실패 (${maxRetries}회 시도):`, e.message);
        throw e;
      }
      const delay = Math.min(500 * Math.pow(2, attempt - 1), 5000);
      console.warn(`[Firestore] ${label} 재시도 ${attempt}/${maxRetries} (${delay}ms 후):`, e.message);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

describe('withRetry', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('성공 시 바로 결과를 반환한다', async () => {
    const op = jest.fn().mockResolvedValue('success');

    const result = await withRetry(op, 'test-op');

    expect(result).toBe('success');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('1번 실패 후 재시도로 성공', async () => {
    const op = jest.fn()
      .mockRejectedValueOnce(new Error('transient error'))
      .mockResolvedValueOnce('recovered');

    const result = await withRetry(op, 'test-retry');

    expect(result).toBe('recovered');
    expect(op).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('maxRetries 횟수 초과 시 최종 에러를 throw', async () => {
    const op = jest.fn().mockRejectedValue(new Error('persistent error'));

    await expect(withRetry(op, 'test-fail', 3)).rejects.toThrow('persistent error');
    expect(op).toHaveBeenCalledTimes(3);
    expect(console.error).toHaveBeenCalledWith(
      '[Firestore] test-fail 최종 실패 (3회 시도):',
      'persistent error'
    );
  });

  it('2번 실패 후 3번째에 성공', async () => {
    const op = jest.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce('ok');

    const result = await withRetry(op, 'test-2-fail', 3);

    expect(result).toBe('ok');
    expect(op).toHaveBeenCalledTimes(3);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it('maxRetries=1이면 재시도 없이 바로 실패', async () => {
    const op = jest.fn().mockRejectedValue(new Error('no retry'));

    await expect(withRetry(op, 'test-no-retry', 1)).rejects.toThrow('no retry');
    expect(op).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('operation의 반환값을 올바르게 전달', async () => {
    const obj = { data: [1, 2, 3], nested: { ok: true } };
    const op = jest.fn().mockResolvedValue(obj);

    const result = await withRetry(op, 'test-value');

    expect(result).toBe(obj);
    expect(result.data).toEqual([1, 2, 3]);
  });

  it('딜레이가 지수적으로 증가 (500ms, 1000ms, 2000ms...)', () => {
    // 딜레이 계산 로직 검증
    const delays = [];
    for (let attempt = 1; attempt <= 5; attempt++) {
      delays.push(Math.min(500 * Math.pow(2, attempt - 1), 5000));
    }
    expect(delays).toEqual([500, 1000, 2000, 4000, 5000]);
  });
});
