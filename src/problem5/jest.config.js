'use strict';

// Integration tests only: they run against the real `challenge_test` database,
// because the risks worth covering here (optimistic locking, tenant scoping,
// soft delete, DECIMAL fidelity) all live in the SQL the service emits and
// cannot be observed against a mocked repository.
//
// `--runInBand` and `TZ=UTC` are set by the `test` script, not here: they must
// hold however Jest is invoked from that script, and they are the two settings
// a reader checks first.

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: __dirname,
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  // Order matters: `setupFiles` runs before the module under test is imported,
  // `setupFilesAfterEnv` after the test framework is installed.
  setupFiles: ['<rootDir>/test/pin-environment.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  // A test that hangs is a real defect here (Express 4 drops async rejections),
  // so the timeout is generous enough for a cold connection pool and no more.
  testTimeout: 20000,
};
