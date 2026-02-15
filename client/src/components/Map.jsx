import React, { useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { t } from '../translations';

// 초록: 클레임 가능 (활성 + TON 남음) - 토카막 심볼
const activeIcon = new L.DivIcon({
  className: '',
  html: '<div style="width:36px;height:36px;background:#fff;border-radius:50%;border:2px solid #4FC3F7;box-shadow:0 2px 8px rgba(79,195,247,0.5);display:flex;align-items:center;justify-content:center;padding:4px;"><img src="/tokamak-symbol.svg" style="width:100%;height:100%;"/></div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

// 회색: TON 소진
const exhaustedIcon = new L.DivIcon({
  className: '',
  html: '<div style="width:32px;height:32px;background:#f5f5f5;border-radius:50%;border:2px solid #999;box-shadow:0 2px 5px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;padding:4px;opacity:0.6;"><img src="/tokamak-symbol.svg" style="width:100%;height:100%;filter:grayscale(100%);"/></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// 빨강: 비활성 (시간 밖)
const inactiveIcon = new L.DivIcon({
  className: '',
  html: '<div style="width:32px;height:32px;background:#fff;border-radius:50%;border:2px solid #f87171;box-shadow:0 2px 5px rgba(248,113,113,0.4);display:flex;align-items:center;justify-content:center;padding:4px;opacity:0.7;"><img src="/tokamak-symbol.svg" style="width:100%;height:100%;filter:hue-rotate(300deg);"/></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
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

// 선택됨 (하단 정보 표시 중) - 두꺼운 초록 테두리 + 강한 그림자
const selectedSpotIcon = new L.DivIcon({
  className: 'selected-spot-marker',
  html: '<div class="selected-spot-pin" style="width:40px;height:40px;background:#fff;border-radius:50%;border:4px solid #059669;box-shadow:0 0 0 2px #fff,0 4px 16px rgba(5,150,105,0.7);display:flex;align-items:center;justify-content:center;padding:4px;"><img src="/tokamak-symbol.svg" style="width:100%;height:100%;"/></div>',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

// 내 스팟 (점주 본인 소유) - 매장관리자 로그인 시 구분용 (핑크 테두리 + 깜박임)
const mySpotIcon = new L.DivIcon({
  className: 'my-spot-marker',
  html: '<div class="my-spot-pin" style="width:36px;height:36px;background:#fff;border-radius:50%;border:2px solid #ec4899;box-shadow:0 2px 8px rgba(236,72,153,0.5);display:flex;align-items:center;justify-content:center;padding:4px;"><img src="/tokamak-symbol.svg" style="width:100%;height:100%;"/></div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

function getSpotIcon(spot, wallet, role, selectedSpot) {
  // 고객 지도에서만: 선택된 스팟(하단 정보 표시 중)은 초록 테두리
  if (role === 'customer' && selectedSpot && selectedSpot.id === spot.id) return selectedSpotIcon;
  // 매장관리자일 때만 내 스팟 구분 표시, 고객 지도는 지갑 연결 여부와 관계없이 동일
  if (role === 'owner') {
    const normalizeAddr = (a) => (a || '').toString().toLowerCase();
    const isMine = wallet && normalizeAddr(spot.creator_address || spot.creator) === normalizeAddr(wallet);
    if (isMine) return mySpotIcon;
  }
  const isExhausted = spot.remaining < spot.reward;
  if (isExhausted) return exhaustedIcon;
  if (!spot.active) return inactiveIcon;
  return activeIcon;
}

function getSpotStatus(spot, language) {
  const isExhausted = spot.remaining < spot.reward;
  if (isExhausted) return t(language, 'tonExhausted');
  if (!spot.active) return t(language, 'inactive');
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

export default function Map({ userPos, gpsStatus, spots, selectedSpot, onSelectSpot, initialCenter, createMode, pinPos, onMapClick, onConfirmAddSpot, wallet, role, language = 'ko' }) {
  const center = initialCenter || { lat: 37.5665, lng: 126.978 };

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
        zoom={16}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapResizeHandler />
        <MapClickHandler createMode={createMode} onMapClick={onMapClick} />
        <AutoCenter userPos={userPos} />
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

        {spots.map((spot) => {
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
                      console.log('[매장관리자] 지도 스팟 상세정보 조회:', spot);
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
