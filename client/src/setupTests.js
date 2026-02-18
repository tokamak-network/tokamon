import '@testing-library/jest-dom';

// jsdom에 없는 ResizeObserver 폴리필
globalThis.ResizeObserver = class ResizeObserver {
  constructor(cb) { this._cb = cb; }
  observe() {}
  unobserve() {}
  disconnect() {}
};
