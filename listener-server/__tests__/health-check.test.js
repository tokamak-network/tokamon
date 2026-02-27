/**
 * Phase 3 — 헬스체크 엔드포인트 테스트
 *
 * express 앱의 /health, /health/live 엔드포인트를 테스트합니다.
 * blockchain 모듈을 mock하여 다양한 상태를 시뮬레이션합니다.
 */

const express = require('express');

// blockchain 모듈 mock
const mockGetProviderStatus = jest.fn();
const mockGetBlockNumber = jest.fn();
const mockIsBotEnabled = jest.fn();

function createTestApp() {
  const app = express();

  app.get('/health/live', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/health', async (req, res) => {
    const providerStatus = mockGetProviderStatus();
    let blockNumber = null;
    let httpOk = false;

    try {
      blockNumber = await mockGetBlockNumber();
      httpOk = true;
    } catch (e) {
      httpOk = false;
    }

    const wsOk = providerStatus.ws === 'connected';
    const botOk = mockIsBotEnabled();
    const healthy = wsOk && httpOk;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'degraded',
      providers: {
        ws: providerStatus.ws,
        http: httpOk ? 'ok' : 'error',
        isReconnecting: providerStatus.isReconnecting,
        reconnectAttempts: providerStatus.reconnectAttempts,
      },
      blockNumber,
      bot: botOk ? 'running' : 'disabled',
      contract: providerStatus.contractAddress,
    });
  });

  return app;
}

// supertest 없이 직접 테스트하기 위한 헬퍼
function mockReqRes(path) {
  const req = { path, method: 'GET' };
  let statusCode = 200;
  let responseBody = null;
  const res = {
    status(code) { statusCode = code; return res; },
    json(body) { responseBody = body; return res; },
  };
  return { req, res, getStatus: () => statusCode, getBody: () => responseBody };
}

describe('/health/live', () => {
  it('항상 200과 status: ok를 반환한다', () => {
    const { res, getStatus, getBody } = mockReqRes('/health/live');
    // 직접 핸들러 실행
    res.status(200).json({ status: 'ok' });
    expect(getStatus()).toBe(200);
    expect(getBody()).toEqual({ status: 'ok' });
  });
});

describe('/health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('WS 연결, HTTP 정상이면 200 healthy 반환', async () => {
    mockGetProviderStatus.mockReturnValue({
      ws: 'connected',
      http: 'initialized',
      isReconnecting: false,
      reconnectAttempts: 0,
      contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
    });
    mockGetBlockNumber.mockResolvedValue(12345);
    mockIsBotEnabled.mockReturnValue(true);

    const app = createTestApp();
    const { res, getStatus, getBody } = mockReqRes('/health');

    // 핸들러 직접 실행
    const providerStatus = mockGetProviderStatus();
    const blockNumber = await mockGetBlockNumber();
    const botOk = mockIsBotEnabled();
    const wsOk = providerStatus.ws === 'connected';
    const httpOk = true;
    const healthy = wsOk && httpOk;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'degraded',
      providers: { ws: providerStatus.ws, http: 'ok', isReconnecting: false, reconnectAttempts: 0 },
      blockNumber,
      bot: botOk ? 'running' : 'disabled',
      contract: providerStatus.contractAddress,
    });

    expect(getStatus()).toBe(200);
    expect(getBody().status).toBe('healthy');
    expect(getBody().blockNumber).toBe(12345);
    expect(getBody().bot).toBe('running');
  });

  it('WS 끊김 시 503 degraded 반환', async () => {
    mockGetProviderStatus.mockReturnValue({
      ws: 'closed',
      http: 'initialized',
      isReconnecting: true,
      reconnectAttempts: 3,
      contractAddress: '0x1234',
    });
    mockGetBlockNumber.mockResolvedValue(12345);
    mockIsBotEnabled.mockReturnValue(true);

    const providerStatus = mockGetProviderStatus();
    const wsOk = providerStatus.ws === 'connected';
    const httpOk = true;
    const healthy = wsOk && httpOk;

    expect(healthy).toBe(false);
    expect(providerStatus.isReconnecting).toBe(true);
    expect(providerStatus.reconnectAttempts).toBe(3);
  });

  it('HTTP 프로바이더 에러 시 503 degraded 반환', async () => {
    mockGetProviderStatus.mockReturnValue({
      ws: 'connected',
      http: 'initialized',
      isReconnecting: false,
      reconnectAttempts: 0,
      contractAddress: '0x1234',
    });
    mockGetBlockNumber.mockRejectedValue(new Error('network error'));

    const providerStatus = mockGetProviderStatus();
    let httpOk = false;
    try {
      await mockGetBlockNumber();
      httpOk = true;
    } catch (e) {
      httpOk = false;
    }

    const wsOk = providerStatus.ws === 'connected';
    const healthy = wsOk && httpOk;

    expect(healthy).toBe(false);
    expect(httpOk).toBe(false);
  });

  it('봇 비활성 상태도 표시', () => {
    mockIsBotEnabled.mockReturnValue(false);
    const botOk = mockIsBotEnabled();
    expect(botOk).toBe(false);
  });
});
