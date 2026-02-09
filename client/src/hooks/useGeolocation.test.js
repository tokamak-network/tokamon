import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import useGeolocation from './useGeolocation';

describe('useGeolocation', () => {
  let watchPositionMock;
  let clearWatchMock;
  let originalGeolocation;

  beforeEach(() => {
    watchPositionMock = vi.fn().mockReturnValue(1);
    clearWatchMock = vi.fn();
    originalGeolocation = navigator.geolocation;
  });

  afterEach(() => {
    cleanup();
    // 원래 상태로 복원
    Object.defineProperty(navigator, 'geolocation', {
      value: originalGeolocation,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  function mockGeolocation(geo) {
    Object.defineProperty(navigator, 'geolocation', {
      value: geo,
      writable: true,
      configurable: true,
    });
  }

  it('geolocation API가 없으면 gpsStatus="unavailable"', () => {
    mockGeolocation(undefined);

    const { result } = renderHook(() => useGeolocation());

    expect(result.current.gpsStatus).toBe('unavailable');
    expect(result.current.userPos).toBeNull();
  });

  it('초기 상태는 gpsStatus="loading" (콜백 호출 전)', () => {
    // watchPosition을 호출하지만 콜백은 실행하지 않음
    watchPositionMock.mockReturnValue(1);
    mockGeolocation({ watchPosition: watchPositionMock, clearWatch: clearWatchMock });

    const { result } = renderHook(() => useGeolocation());

    expect(result.current.gpsStatus).toBe('loading');
    expect(result.current.userPos).toBeNull();
    expect(watchPositionMock).toHaveBeenCalledTimes(1);
  });

  it('위치 성공 시 gpsStatus="active"이고 userPos가 설정됨', () => {
    watchPositionMock.mockImplementation((success) => {
      // 비동기처럼 동작하지 않고 바로 호출
      setTimeout(() => success({
        coords: { latitude: 37.5665, longitude: 126.978 },
      }), 0);
      return 1;
    });
    mockGeolocation({ watchPosition: watchPositionMock, clearWatch: clearWatchMock });

    const { result } = renderHook(() => useGeolocation());

    // 초기엔 loading
    expect(result.current.gpsStatus).toBe('loading');

    // 비동기 콜백 후 active
    return vi.waitFor(() => {
      expect(result.current.gpsStatus).toBe('active');
      expect(result.current.userPos).toEqual({ lat: 37.5665, lng: 126.978 });
    });
  });

  it('위치가 업데이트되면 userPos도 업데이트됨', async () => {
    let successCallback;
    watchPositionMock.mockImplementation((success) => {
      successCallback = success;
      return 1;
    });
    mockGeolocation({ watchPosition: watchPositionMock, clearWatch: clearWatchMock });

    const { result } = renderHook(() => useGeolocation());

    // 첫 위치 전송
    act(() => {
      successCallback({ coords: { latitude: 37.0, longitude: 127.0 } });
    });

    expect(result.current.userPos).toEqual({ lat: 37.0, lng: 127.0 });

    // 위치 업데이트
    act(() => {
      successCallback({ coords: { latitude: 37.5, longitude: 127.5 } });
    });

    expect(result.current.userPos).toEqual({ lat: 37.5, lng: 127.5 });
    expect(result.current.gpsStatus).toBe('active');
  });

  it('권한 거부 시 gpsStatus="denied"', () => {
    watchPositionMock.mockImplementation((_success, error) => {
      setTimeout(() => error({ code: 1, PERMISSION_DENIED: 1 }), 0);
      return 1;
    });
    mockGeolocation({ watchPosition: watchPositionMock, clearWatch: clearWatchMock });

    const { result } = renderHook(() => useGeolocation());

    return vi.waitFor(() => {
      expect(result.current.gpsStatus).toBe('denied');
      expect(result.current.userPos).toBeNull();
    });
  });

  it('위치 타임아웃 등 기타 에러 시 gpsStatus="unavailable"', () => {
    watchPositionMock.mockImplementation((_success, error) => {
      setTimeout(() => error({ code: 3, PERMISSION_DENIED: 1 }), 0);
      return 1;
    });
    mockGeolocation({ watchPosition: watchPositionMock, clearWatch: clearWatchMock });

    const { result } = renderHook(() => useGeolocation());

    return vi.waitFor(() => {
      expect(result.current.gpsStatus).toBe('unavailable');
    });
  });

  it('enableHighAccuracy: true 옵션이 전달됨', () => {
    mockGeolocation({ watchPosition: watchPositionMock, clearWatch: clearWatchMock });

    renderHook(() => useGeolocation());

    const options = watchPositionMock.mock.calls[0][2];
    expect(options.enableHighAccuracy).toBe(true);
    expect(options.maximumAge).toBe(5000);
    expect(options.timeout).toBe(15000);
  });

  it('언마운트 시 clearWatch가 호출됨', () => {
    watchPositionMock.mockReturnValue(42);
    mockGeolocation({ watchPosition: watchPositionMock, clearWatch: clearWatchMock });

    const { unmount } = renderHook(() => useGeolocation());

    unmount();

    expect(clearWatchMock).toHaveBeenCalledWith(42);
  });
});
