import '@testing-library/jest-dom';
import { vi } from 'vitest';

// jsdom does not implement scrollIntoView — stub it as a vi.fn() so components
// using scrollIntoView (e.g. chat scroll-to-bottom) don't throw in tests, and
// tests can assert call counts when needed.
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// jsdom does not implement IntersectionObserver — stub it so motion/react
// viewport-based animations (whileInView) don't throw in tests.
if (typeof window.IntersectionObserver === 'undefined') {
  class IntersectionObserverMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    constructor() {}
  }
  window.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver;
}
