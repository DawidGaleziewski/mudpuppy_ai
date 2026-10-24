import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom has no modal dialogs: open and close by the attribute, as a browser shows them
// (a test that counts the calls replaces showModal with a mock).
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
  this.removeAttribute('open');
};

// Vitest runs without globals, so Testing Library's automatic cleanup is wired here.
afterEach(() => {
  cleanup();
});
