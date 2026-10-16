import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// jsdom has no native dialog top-layer implementation. Browser tests verify
// actual focus containment; component tests still exercise open/close lifecycles.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

// Cleanup after each test
afterEach(() => {
  cleanup();
});
