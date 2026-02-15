import { useState, useCallback, useRef } from 'react';

let toastIdCounter = 0;

export default function useToast() {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const removeToast = useCallback((id) => {
    clearTimeout(timersRef.current[id]);
    delete timersRef.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((type, message, duration = 3000) => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, type, message }]);

    if (duration > 0) {
      timersRef.current[id] = setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  }, [removeToast]);

  return { toasts, showToast, removeToast };
}
