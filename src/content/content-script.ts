import { MockKeyboardController, type PageWindow } from './MockKeyboardController';

(() => {
  const pageWindow = window as PageWindow;

  if (!pageWindow.__mockKeyboardController__) {
    pageWindow.__mockKeyboardController__ = new MockKeyboardController();
  }
})();
