import { useState, useEffect } from 'react';

/**
 * 실시간 GPS 위치 추적 훅
 * @returns {{ userPos: {lat: number, lng: number} | null, gpsStatus: 'loading'|'active'|'denied'|'unavailable' }}
 */
export default function useGeolocation() {
  const [userPos, setUserPos] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('loading');

  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatus('unavailable');
      return;
    }

    setGpsStatus('loading');

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserPos({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setGpsStatus('active');
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setGpsStatus('denied');
        } else {
          setGpsStatus('unavailable');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return { userPos, gpsStatus };
}
