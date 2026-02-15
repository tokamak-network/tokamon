import React from 'react';

export function Spinner({ size = 16 }) {
  return (
    <span
      className="spinner-inline"
      style={{ width: size, height: size }}
    />
  );
}

export function OverlaySpinner({ text }) {
  return (
    <div className="spinner-overlay">
      <div className="spinner-overlay-content">
        <span className="spinner-large" />
        {text && <p className="spinner-text">{text}</p>}
      </div>
    </div>
  );
}
