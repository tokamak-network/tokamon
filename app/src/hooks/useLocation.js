import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

/**
 * GPS location tracking hook using expo-location
 * @returns {{ userPos: {lat, lng} | null, gpsStatus: 'loading'|'active'|'denied'|'unavailable' }}
 */
export default function useLocation() {
  const [userPos, setUserPos] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('loading');

  useEffect(() => {
    let subscription = null;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setGpsStatus('denied');
          return;
        }

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000,
            distanceInterval: 5,
          },
          (location) => {
            setUserPos({
              lat: location.coords.latitude,
              lng: location.coords.longitude,
            });
            setGpsStatus('active');
          }
        );
      } catch (error) {
        console.error('Location error:', error);
        setGpsStatus('unavailable');
      }
    })();

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  return { userPos, gpsStatus };
}
