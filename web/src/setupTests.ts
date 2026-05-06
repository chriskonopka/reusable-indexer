import '@testing-library/jest-dom';
import { randomUUID } from 'crypto';
import { serialize, deserialize } from 'v8';
import { TextDecoder, TextEncoder } from 'util';
import { IDBFactory } from 'fake-indexeddb';
import { toHaveNoViolations } from 'jest-axe';

// jsdom 20 omits TextEncoder/TextDecoder from the global; install them
// before anything (including `undici` below) tries to use them.
if (typeof globalThis.TextEncoder === 'undefined') {
  Object.defineProperty(globalThis, 'TextEncoder', {
    value: TextEncoder,
    configurable: true,
    writable: true,
  });
}
if (typeof globalThis.TextDecoder === 'undefined') {
  Object.defineProperty(globalThis, 'TextDecoder', {
    value: TextDecoder,
    configurable: true,
    writable: true,
  });
}

// Register the jest-axe matcher globally so every component test can call
// `expect(...).toHaveNoViolations()` without re-extending.
expect.extend(toHaveNoViolations);

// jsdom 20 omits fetch / Response / Headers / Request from the global. The
// `whatwg-fetch` polyfill installs all four on `globalThis` and `window` —
// it ships with the test toolchain and is not bundled into the production
// build. After import, individual tests can stub `global.fetch` with jest
// mocks against the polyfilled implementation.
import 'whatwg-fetch';

// jsdom does not expose crypto.randomUUID — polyfill using Node's built-in crypto
Object.defineProperty(global, 'crypto', {
  value: { randomUUID },
  configurable: true,
});

// jsdom does not implement window.matchMedia — provide a no-op stub so components
// that read prefers-color-scheme (e.g. useTheme) work in the test environment.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// jsdom 20 does not expose structuredClone on the window global. fake-indexeddb
// v6 requires it to deep-clone stored values. Use Node's v8 serialize/deserialize
// for a correct structured-clone implementation in the test environment.
global.structuredClone = <T>(value: T): T => deserialize(serialize(value)) as T;

// jsdom does not implement Element.scrollIntoView — install a no-op so any
// component code that calls it (e.g. revealDocument's row scroll) doesn't
// throw in the test environment. Individual tests that want to assert on
// scroll behavior can replace this with a jest.fn().
if (!Element.prototype.scrollIntoView) {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: () => {},
  });
}

// jsdom does not implement IndexedDB. Replace it with fake-indexeddb before
// each test and reset it to a fresh instance so tests are fully isolated.
beforeEach(() => {
  global.indexedDB = new IDBFactory();
});
