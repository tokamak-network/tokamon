import React, { useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { t } from '../translations';
import { isWithinActiveTime, isSpotClosed } from '../spotUtils';

// 활성: 노란 T 코인 (파란 테두리)
const activeIcon = new L.Icon({
  iconUrl: '/marker-blue.png',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18],
});

// TON 소진: 회색 처리
const exhaustedIcon = new L.DivIcon({
  className: '',
  html: '<div style="width:32px;height:32px;opacity:0.5;"><img src="/marker-blue.png" style="width:100%;height:100%;filter:grayscale(100%) brightness(0.8);"/></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// 비활성 (운영시간 밖): 어둡게
const inactiveIcon = new L.DivIcon({
  className: '',
  html: '<div style="width:32px;height:32px;opacity:0.6;"><img src="/marker-blue.png" style="width:100%;height:100%;filter:saturate(0.3) brightness(0.7);"/></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// 종료됨 (날짜 만료): 회색 + 더 투명
const closedIcon = new L.DivIcon({
  className: '',
  html: '<div style="width:30px;height:30px;opacity:0.4;"><img src="/marker-blue.png" style="width:100%;height:100%;filter:grayscale(100%) brightness(0.6);"/></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

// 파랑: 사용자 위치
const userIcon = new L.DivIcon({
  className: '',
  html: '<div style="width:16px;height:16px;background:#3b82f6;border-radius:50%;border:3px solid #fff;box-shadow:0 0 8px #3b82f6"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// 주황: 스팟 생성 핀
const pinIcon = new L.DivIcon({
  className: '',
  html: '<div style="width:18px;height:18px;background:#f59e0b;border-radius:50%;border:3px solid #fff;box-shadow:0 0 10px #f59e0b;animation:pulse 1s infinite"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// + 스팟 추가 버튼 (핀 옆에 표시)
const addSpotButtonIcon = new L.DivIcon({
  className: 'add-spot-btn-marker',
  html: '<div class="add-spot-btn" style="width:36px;height:36px;background:#10b981;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:bold;cursor:pointer;line-height:1;">+</div>',
  iconSize: [36, 36],
  iconAnchor: [0, 18],
});

// 선택됨 (하단 정보 표시 중) - 초록 테두리 T 코인
const selectedSpotIcon = new L.Icon({
  iconUrl: '/marker-green.png',
  iconSize: [44, 44],
  iconAnchor: [22, 22],
  popupAnchor: [0, -22],
  className: 'selected-spot-marker',
});

// 내 스팟 (본인 소유) - 스팟 생성자 로그인 시 구분용 (핑크 테두리)
const mySpotIcon = new L.DivIcon({
  className: 'my-spot-marker',
  html: '<div class="my-spot-pin" style="width:38px;height:38px;border-radius:50%;border:3px solid #ec4899;box-shadow:0 2px 8px rgba(236,72,153,0.5);overflow:hidden;"><img src="/marker-blue.png" style="width:100%;height:100%;"/></div>',
  iconSize: [38, 38],
  iconAnchor: [19, 19],
});

function getSpotIcon(spot, wallet, role, selectedSpot) {
  // 고객 지도에서만: 선택된 스팟(하단 정보 표시 중)은 초록 테두리
  if (role === 'customer' && selectedSpot && selectedSpot.id === spot.id) return selectedSpotIcon;
  // 비활성/소진/종료 스팟은 상태 아이콘 우선 (핑크 테두리 X)
  const isExhausted = spot.remaining < spot.reward;
  if (isExhausted) return exhaustedIcon;
  if (isSpotClosed(spot)) return closedIcon;
  if (!spot.active || !isWithinActiveTime(spot)) return inactiveIcon;
  // 스팟 생성자: 활성 상태인 내 스팟만 핑크 테두리 표시
  if (role === 'owner') {
    const normalizeAddr = (a) => (a || '').toString().toLowerCase();
    const isMine = wallet && normalizeAddr(spot.creator_address || spot.creator) === normalizeAddr(wallet);
    if (isMine) return mySpotIcon;
  }
  return activeIcon;
}

function getSpotStatus(spot, language) {
  const isExhausted = spot.remaining < spot.reward;
  if (isExhausted) return t(language, 'tonExhausted');
  if (isSpotClosed(spot)) return t(language, 'closedStatus');
  if (!spot.active || !isWithinActiveTime(spot)) return t(language, 'outsideActiveTime');
  return t(language, 'active');
}

// 지도 클릭 이벤트 핸들러
function MapClickHandler({ createMode, onMapClick }) {
  useMapEvents({
    click(e) {
      if (createMode) {
        onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    },
  });
  return null;
}

// GPS 위치가 처음 잡히면 자동으로 이동
function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function AutoCenter({ userPos }) {
  const map = useMap();
  const hasCentered = useRef(false);

  useEffect(() => {
    if (userPos && !hasCentered.current) {
      hasCentered.current = true;
      map.flyTo([userPos.lat, userPos.lng], 16);
    }
  }, [userPos, map]);

  return null;
}

// 지도 뷰 상태 저장 (탭 전환 시 복원용)
function TrackView({ onViewChange }) {
  const map = useMap();
  useEffect(() => {
    const save = () => {
      const c = map.getCenter();
      onViewChange({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    };
    map.on('moveend', save);
    map.on('zoomend', save);
    return () => {
      map.off('moveend', save);
      map.off('zoomend', save);
    };
  }, [map, onViewChange]);
  return null;
}

// 선택된 스팟으로 지도 이동 (줌 레벨은 현재 상태 유지)
function FlyToSpot({ selectedSpot }) {
  const map = useMap();
  const prevSpotId = useRef(null);

  useEffect(() => {
    if (selectedSpot && selectedSpot.id !== prevSpotId.current) {
      prevSpotId.current = selectedSpot.id;
      requestAnimationFrame(() => {
        map.invalidateSize();
        map.flyTo([selectedSpot.lat, selectedSpot.lng]);
      });
    }
  }, [selectedSpot, map]);

  return null;
}

// 내 위치로 이동 버튼
function LocateButton({ userPos }) {
  const map = useMap();
  if (!userPos) return null;
  return (
    <button
      onClick={() => map.flyTo([userPos.lat, userPos.lng], 16)}
      style={{
        position: 'absolute', bottom: '20px', right: '10px', zIndex: 1000,
        width: '40px', height: '40px', borderRadius: '50%',
        background: '#fff', border: '2px solid #ccc', boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', fontSize: '18px', padding: 0,
      }}
      title=""
    >
      ◎
    </button>
  );
}

export default function Map({ userPos, gpsStatus, spots, selectedSpot, onSelectSpot, initialCenter, createMode, pinPos, onMapClick, onConfirmAddSpot, wallet, role, language = 'ko', mapView, onViewChange }) {
  const firstSpot = spots?.length > 0 ? { lat: spots[0].lat, lng: spots[0].lng } : null;
  const center = mapView || initialCenter || firstSpot;
  const zoom = mapView?.zoom || 16;

  if (!center) {
    return (
      <div className="map-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
        <div style={{ textAlign: 'center', color: '#6b7280', padding: '20px' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📍</div>
          <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>{t(language, 'locationDenied')}</div>
          <div style={{ fontSize: '13px' }}>{t(language, 'locationUnavailable')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="map-container">
      {createMode && (
        <div className="create-mode-banner">
          {t(language, 'tapMapToSelectLocation')}
        </div>
      )}
      {gpsStatus === 'loading' && (
        <div style={{
          position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
          background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '8px 16px', borderRadius: '20px',
          fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          {t(language, 'findingLocation')}
        </div>
      )}
      {gpsStatus === 'denied' && (
        <div style={{
          position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
          background: '#ef4444', color: '#fff', padding: '8px 16px', borderRadius: '20px',
          fontSize: '13px',
        }}>
          {t(language, 'locationDenied')}
        </div>
      )}
      {gpsStatus === 'unavailable' && (
        <div style={{
          position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
          background: '#f59e0b', color: '#fff', padding: '8px 16px', borderRadius: '20px',
          fontSize: '13px',
        }}>
          {t(language, 'locationUnavailable')}
        </div>
      )}
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapResizeHandler />
        {onViewChange && <TrackView onViewChange={onViewChange} />}
        <MapClickHandler createMode={createMode} onMapClick={onMapClick} />
        <AutoCenter userPos={userPos} />
        <FlyToSpot selectedSpot={selectedSpot} />
        <LocateButton userPos={userPos} />

        {userPos && (
          <>
            <Marker position={[userPos.lat, userPos.lng]} icon={userIcon} />
            <Circle
              center={[userPos.lat, userPos.lng]}
              radius={12}
              pathOptions={{ color: '#3b82f6', fillOpacity: 0.08, weight: 1 }}
            />
          </>
        )}

        {/* 스팟 생성 모드: 선택한 위치에 핀 + 추가 버튼 */}
        {pinPos && (
          <>
            <Marker position={[pinPos.lat, pinPos.lng]} icon={pinIcon} />
            {createMode && onConfirmAddSpot && wallet && (
              <Marker
                position={[pinPos.lat, pinPos.lng + 0.00008]}
                icon={addSpotButtonIcon}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e);
                    onConfirmAddSpot();
                  },
                }}
              />
            )}
            <Circle
              center={[pinPos.lat, pinPos.lng]}
              radius={12}
              pathOptions={{ color: '#f59e0b', fillOpacity: 0.1, weight: 2, dashArray: '5,5' }}
            />
          </>
        )}

        {!createMode && spots.map((spot) => {
          const claimsLeft = spot.reward > 0 ? Math.floor(spot.remaining / spot.reward) : 0;
          return (
            <Marker
              key={spot.id}
              position={[spot.lat, spot.lng]}
              icon={getSpotIcon(spot, wallet, role, selectedSpot)}
              eventHandlers={{
                click: () => {
                  if (!createMode) {
                    if (role === 'owner') {
                      console.log('[스팟 생성자] 지도 스팟 상세정보 조회:', spot);
                    }
                    onSelectSpot(spot);
                  }
                },
              }}
            >
              <Popup>
                <strong>{spot.name}</strong>
                <br />
                {spot.reward} TON · {getSpotStatus(spot, language)}
                <br />
                {t(language, 'popupRemaining')}: {claimsLeft}{t(language, 'times')}
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
