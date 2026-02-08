import React from 'react';
import DinoCharacter from './DinoCharacter';

// 작은 3D 캐릭터를 마커용으로
export default function DinoMarker({
  animation = 'idle',
  size = 60,
  status = 'active' // 'active', 'exhausted', 'inactive'
}) {
  // 상태에 따른 필터 효과
  const filterStyle = {
    active: 'none',
    exhausted: 'grayscale(100%) brightness(0.6)',
    inactive: 'hue-rotate(90deg) brightness(0.8)'
  };

  return (
    <div style={{
      width: `${size}px`,
      height: `${size}px`,
      filter: filterStyle[status] || 'none',
      pointerEvents: 'none'
    }}>
      <DinoCharacter
        animation={animation}
        width={`${size}px`}
        height={`${size}px`}
        scale={0.8}
        cameraPosition={[0, 2, 3.5]}
      />
    </div>
  );
}
