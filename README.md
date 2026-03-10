# Mock Keyboard

Chrome DevTools Device Mode handles screen size, DPR, and touch pretty well. It does not handle the software keyboard.

That becomes a problem when building mobile UIs. Things like search bars, chat inputs, bottom docks, and anything tied to `visualViewport` behave differently once the keyboard opens. In desktop Chrome’s emulator, that state never really exists.

This extension adds a DevTools panel that overlays a mock Android keyboard and exposes the viewport changes to the page so layouts can react as they would on a real device.

## What It Looks Like In Use

This is not a replacement for Chrome’s responsive device mode. It is meant to be used with it.

Typical workflow:

1. Open your page in Chrome
2. Open DevTools
3. Turn on Device Mode
4. Pick a responsive/mobile viewport
5. Open the `Mock Keyboard` panel
6. Enable the simulator
7. Focus an input or textarea

At that point, you still use Chrome’s normal responsive viewport controls for screen size. The extension just adds the missing keyboard behavior on top:

- a Pixel-style Android keyboard overlay
- focus-driven open and close behavior
- page-visible viewport changes through the bridge script
- toggle keyboard and screen sizes to see how layouts respond
- debug information when you need to inspect what the page is actually seeing

## Running It

Install dependencies and build:

```bash
npm install
npm run build
```

Then load the unpacked extension:

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select [`dist/`](/Users/chrismacpherson/Desktop/keyextension/dist)

If you are actively changing the extension, `npm run dev` will rebuild on file changes.

## How It Works

There are four pieces:

- `src/devtools/`
  - the DevTools panel UI
  - controls enable state, preset, visibility mode, and debug state

- `src/background/service-worker.ts`
  - stores tab state
  - injects the tab runtime on supported pages
  - keeps the DevTools panel and the page in sync

- `src/content/`
  - runs in the inspected tab
  - watches focus and viewport changes
  - renders the keyboard overlay
  - tears everything down when disabled

- `src/content/page-bridge.ts`
  - runs in the page’s JS world
  - exposes simulated viewport changes where app code can actually observe them

## Scope

This stays intentionally narrow:

- Android-style keyboard only
- desktop Chrome only
- meant for development, not production

It is a simulator for keyboard-aware mobile UI work, not full mobile browser emulation.

## Limitations

- The keyboard is visual only right now. It does not type or behave like a fully interactive IME yet.
- The current Android keyboard is a simplified representation intended to make viewport and layout behavior easier to test.
- This is still a simulator. Real-device testing is still necessary before trusting complex mobile behavior.

## Upcoming

- iOS keyboard version
- interactive key behavior instead of a display-only keyboard
