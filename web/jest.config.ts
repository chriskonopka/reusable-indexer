import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jsdom',
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  preset: 'ts-jest',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/../shared/$1',
    '\\.module\\.(css|scss)$': '<rootDir>/src/__mocks__/styleMock.ts',
    '\\.(jpg|jpeg|png|gif|svg|webp|avif|ico|woff2?|ttf|eot)$':
      '<rootDir>/src/__mocks__/fileMock.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],

  // Coverage
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__mocks__/**',
    // Entry points — exercised end-to-end, not via jest.
    '!src/main.tsx',
    '!src/bootstrap.tsx',
    // Dev-shell-only modules (`?stub=1` fetch shim + standalone stub host).
    // Production builds expose `<IndexerApp />` to a consuming app that
    // supplies its own host; these files are exercised only by the
    // Playwright suite running against `npm run dev`.
    '!src/host/stubFetch.ts',
    '!src/host/stubHost.ts',
    // Inline pre-paint script — a string template injected by the dev
    // index.html, not runtime React code.
    '!src/theme/prePaintScript.ts',
    // Public-API barrels — re-exports only, no logic.
    '!src/features/*/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'html', 'lcov'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

export default config;
