import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// react-leaflet 모킹 — MapContainer 내부 children을 그대로 렌더링
const flyToMock = vi.fn();

vi.mock('react-leaflet', () => {
  const React = require('react');
  return {
    MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
    TileLayer: () => <div data-testid="tile-layer" />,
    Marker: ({ children }) => <div data-testid="marker">{children}</div>,
    Popup: ({ children }) => <div data-testid="popup">{children}</div>,
    Circle: () => <div data-testid="circle" />,
    useMapEvents: () => null,
    useMap: () => ({
      flyTo: flyToMock,
      invalidateSize: vi.fn(),
      getContainer: () => document.createElement('div'),
    }),
  };
});

vi.mock('leaflet', () => ({
  default: {
    DivIcon: class DivIcon {
      constructor() {}
    },
    Icon: class Icon {
      constructor() {}
    },
  },
  DivIcon: class DivIcon {
    constructor() {}
  },
  Icon: class Icon {
    constructor() {}
  },
}));

// t(lang, key) → key 반환
vi.mock('../translations', () => ({
  t: (lang, key) => key,
}));

vi.mock('../spotUtils', () => ({
  isWithinActiveTime: () => true,
  isSpotClosed: () => false,
}));

import Map from './Map';

describe('Map — GPS 상태 표시', () => {
  const defaultProps = {
    userPos: null,
    gpsStatus: 'active',
    spots: [],
    selectedSpot: null,
    onSelectSpot: vi.fn(),
    initialCenter: { lat: 37.5665, lng: 126.978 },
    createMode: false,
    pinPos: null,
    onMapClick: vi.fn(),
  };

  beforeEach(() => {
    flyToMock.mockClear();
  });

  it('gpsStatus="loading"일 때 findingLocation 키를 표시', () => {
    render(<Map {...defaultProps} gpsStatus="loading" />);
    expect(screen.getByText('findingLocation')).toBeInTheDocument();
  });

  it('gpsStatus="denied"일 때 locationDenied 키를 표시', () => {
    render(<Map {...defaultProps} gpsStatus="denied" />);
    expect(screen.getByText('locationDenied')).toBeInTheDocument();
  });

  it('gpsStatus="unavailable"일 때 locationUnavailable 키를 표시', () => {
    render(<Map {...defaultProps} gpsStatus="unavailable" />);
    expect(screen.getByText('locationUnavailable')).toBeInTheDocument();
  });

  it('gpsStatus="active"일 때 어떤 배너도 표시하지 않음', () => {
    render(<Map {...defaultProps} gpsStatus="active" />);
    expect(screen.queryByText('findingLocation')).not.toBeInTheDocument();
    expect(screen.queryByText('locationDenied')).not.toBeInTheDocument();
    expect(screen.queryByText('locationUnavailable')).not.toBeInTheDocument();
  });

  it('createMode일 때 tapMapToSelectLocation 키를 표시', () => {
    render(<Map {...defaultProps} createMode={true} />);
    expect(screen.getByText('tapMapToSelectLocation')).toBeInTheDocument();
  });
});

describe('Map — LocateButton', () => {
  const defaultProps = {
    gpsStatus: 'active',
    spots: [],
    selectedSpot: null,
    onSelectSpot: vi.fn(),
    initialCenter: { lat: 37.5665, lng: 126.978 },
    createMode: false,
    pinPos: null,
    onMapClick: vi.fn(),
  };

  beforeEach(() => {
    flyToMock.mockClear();
  });

  it('userPos가 없으면 locate 버튼(◎)이 없음', () => {
    render(<Map {...defaultProps} userPos={null} />);
    expect(screen.queryByText('◎')).not.toBeInTheDocument();
  });

  it('userPos가 있으면 locate 버튼(◎)이 표시됨', () => {
    render(<Map {...defaultProps} userPos={{ lat: 37.5, lng: 127.0 }} />);
    expect(screen.getByText('◎')).toBeInTheDocument();
  });

  it('locate 버튼 클릭 시 flyTo가 호출됨', () => {
    render(<Map {...defaultProps} userPos={{ lat: 37.5, lng: 127.0 }} />);
    fireEvent.click(screen.getByText('◎'));
    expect(flyToMock).toHaveBeenCalledWith([37.5, 127.0], 16);
  });
});

describe('Map — 사용자 마커', () => {
  const defaultProps = {
    gpsStatus: 'active',
    spots: [],
    selectedSpot: null,
    onSelectSpot: vi.fn(),
    initialCenter: { lat: 37.5665, lng: 126.978 },
    createMode: false,
    pinPos: null,
    onMapClick: vi.fn(),
  };

  it('userPos가 없으면 사용자 마커와 원이 없음', () => {
    const { container } = render(<Map {...defaultProps} userPos={null} />);
    const markers = container.querySelectorAll('[data-testid="marker"]');
    const circles = container.querySelectorAll('[data-testid="circle"]');
    expect(markers.length).toBe(0);
    expect(circles.length).toBe(0);
  });

  it('userPos가 있으면 사용자 마커와 반경 원이 표시됨', () => {
    const { container } = render(<Map {...defaultProps} userPos={{ lat: 37.5, lng: 127.0 }} />);
    const markers = container.querySelectorAll('[data-testid="marker"]');
    const circles = container.querySelectorAll('[data-testid="circle"]');
    expect(markers.length).toBeGreaterThanOrEqual(1);
    expect(circles.length).toBeGreaterThanOrEqual(1);
  });
});
