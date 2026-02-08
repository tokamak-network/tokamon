import React from 'react';

// 이미지 기반 공룡 캐릭터 (순수 CSS 애니메이션)
export default function DinoCharacter({
  animation = 'idle',
  height = '200px',
  width = '200px',
  scale = 1,
  cameraPosition = [0, 2, 4] // 3D 호환성을 위해 유지
}) {
  
  return (
    <div 
      className="dino-character-container"
      style={{
        height: height,
        width: width,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <div 
        className={`dino-character dino-${animation}`}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <img 
          src="/tokamon-char.png" 
          alt="Tokamon Character"
          style={{
            maxWidth: '90%',
            maxHeight: '90%',
            objectFit: 'contain',
            filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))'
          }}
        />
      </div>

      <style>{`
        .dino-idle img {
          animation: dino-idle-anim 2s ease-in-out infinite;
        }

        .dino-walk img {
          animation: dino-walk-anim 0.6s ease-in-out infinite;
        }

        .dino-jump img {
          animation: dino-jump-anim 0.8s ease-in-out infinite;
        }

        @keyframes dino-idle-anim {
          0%, 100% { 
            transform: translateY(0px) scale(${scale}); 
          }
          50% { 
            transform: translateY(-8px) scale(${scale}); 
          }
        }

        @keyframes dino-walk-anim {
          0% { 
            transform: translateX(-5px) rotate(-3deg) scale(${scale}); 
          }
          50% { 
            transform: translateX(5px) rotate(3deg) scale(${scale}); 
          }
          100% { 
            transform: translateX(-5px) rotate(-3deg) scale(${scale}); 
          }
        }

        @keyframes dino-jump-anim {
          0%, 100% { 
            transform: translateY(0px) scale(${scale * 1}, ${scale * 1}); 
          }
          30% { 
            transform: translateY(-35px) scale(${scale * 1.1}, ${scale * 0.9}); 
          }
          50% { 
            transform: translateY(-45px) scale(${scale * 1}, ${scale * 1}); 
          }
          70% { 
            transform: translateY(-35px) scale(${scale * 0.9}, ${scale * 1.1}); 
          }
        }
      `}</style>
    </div>
  );
}
