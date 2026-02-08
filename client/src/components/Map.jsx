import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

// 초록: 클레임 가능 (활성 + TON 남음) - 토카막 심볼
const activeIcon = new L.DivIcon({
  className: '',
  html: '<div style="width:45px;height:45px;background:#fff;border-radius:50%;border:3px solid #4FC3F7;box-shadow:0 3px 10px rgba(79,195,247,0.6);display:flex;align-items:center;justify-content:center;padding:6px;"><img src="/tokamak-symbol.svg" style="width:100%;height:100%;"/></div>',
  iconSize: [45, 45],
  iconAnchor: [22, 22],
});

// 회색: TON 소진
const exhaustedIcon = new L.DivIcon({
  className: '',
  html: '<div style="width:40px;height:40px;background:#f5f5f5;border-radius:50%;border:2px solid #999;box-shadow:0 2px 6px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;padding:6px;opacity:0.6;"><img src="/tokamak-symbol.svg" style="width:100%;height:100%;filter:grayscale(100%);"/></div>',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

// 빨강: 비활성 (시간 밖)
const inactiveIcon = new L.DivIcon({
  className: '',
  html: '<div style="width:40px;height:40px;background:#fff;border-radius:50%;border:2px solid #f87171;box-shadow:0 2px 6px rgba(248,113,113,0.4);display:flex;align-items:center;justify-content:center;padding:6px;opacity:0.7;"><img src="/tokamak-symbol.svg" style="width:100%;height:100%;filter:hue-rotate(300deg);"/></div>',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
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

function getSpotIcon(spot) {
  const isExhausted = spot.remaining < spot.reward;
  if (isExhausted) return exhaustedIcon;
  if (!spot.active) return inactiveIcon;
  return activeIcon;
}

function getSpotStatus(spot) {
  const isExhausted = spot.remaining < spot.reward;
  if (isExhausted) return 'TON 소진';
  if (!spot.active) return '비활성';
  return '활성';
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

export default function Map({ userPos, spots, selectedSpot, onSelectSpot, initialCenter, createMode, pinPos, onMapClick }) {
  const center = initialCenter || { lat: 37.5665, lng: 126.978 };

  return (
    <div className="map-container">
      {createMode && (
        <div className="create-mode-banner">
          지도를 탭하여 스팟 위치를 선택하세요
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

        <MapClickHandler createMode={createMode} onMapClick={onMapClick} />

        {userPos && (
          <>
            <Marker position={[userPos.lat, userPos.lng]} icon={userIcon} />
            <Circle
              center={[userPos.lat, userPos.lng]}
              radius={50}
              pathOptions={{ color: '#3b82f6', fillOpacity: 0.08, weight: 1 }}
            />
          </>
        )}

        {/* 스팟 생성 모드: 선택한 위치에 핀 */}
        {pinPos && (
          <>
            <Marker position={[pinPos.lat, pinPos.lng]} icon={pinIcon} />
            <Circle
              center={[pinPos.lat, pinPos.lng]}
              radius={50}
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
              icon={getSpotIcon(spot)}
              eventHandlers={{ click: () => !createMode && onSelectSpot(spot) }}
            >
              <Popup>
                <strong>{spot.name}</strong>
                <br />
                {spot.reward} TON · {getSpotStatus(spot)}
                <br />
                남은 횟수: {claimsLeft}회
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
