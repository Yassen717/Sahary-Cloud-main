module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
        // Repo has heavy @ts-nocheck/type noise; transpile only.
        diagnostics: false
      }
    ]
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!**/node_modules/**',
    '!**/coverage/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // Docker-backed tests (VM start/stop/restart) create and wait on real
  // containers — well above the old 10s ceiling.
  testTimeout: 30000,
  verbose: true,
  forceExit: true,
  clearMocks: true,
  // resetMocks deliberately stays OFF: it wipes implementations declared in
  // module-scope jest.mock() factories (e.g. the Stripe SDK mock), making
  // them silently return undefined. clearMocks keeps call assertions
  // per-test, restoreMocks still unwinds jest.spyOn handles.
  restoreMocks: true
};
