import '@testing-library/jest-dom';
import { vi } from 'vitest';

// jsdom does not implement scrollIntoView — stub it as a vi.fn() so components
// using scrollIntoView (e.g. chat scroll-to-bottom) don't throw in tests, and
// tests can assert call counts when needed.
window.HTMLElement.prototype.scrollIntoView = vi.fn();
