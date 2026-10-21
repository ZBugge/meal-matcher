import test from 'node:test';
import assert from 'node:assert/strict';
import { browserCoverageReport, validateHistoricalCoverage } from './test-coverage.mjs';

test('a growing test count cannot conceal a lost historical assertion', () => {
  const legacy = { file: 'src/votes.test.ts', name: 'accepted votes survive late persistence failure' };
  const baseline = { version: 1, tests: [legacy] };
  const report = { numPassedTests: 500, testResults: [{ name: 'C:/fixture/server/src/votes.test.ts', assertionResults: [{ fullName: 'some new test', status: 'passed' }] }] };
  assert.throws(() => validateHistoricalCoverage(report, baseline), /Historical assertions missing/);
  report.testResults[0].assertionResults.push({ fullName: legacy.name, status: 'passed' });
  assert.equal(validateHistoricalCoverage(report, baseline).historicalAssertions, 1);
  report.testResults[0].assertionResults[1].status = 'pending';
  assert.throws(() => validateHistoricalCoverage(report, baseline), /not passed/);
});

test('browser identities preserve file, describe path and project rather than a count', () => {
  const report = { suites: [{ title: 'flow.spec.ts', file: 'flow.spec.ts', suites: [{ title: 'draft recovery', specs: [{ title: 'retains Back cursor', file: 'flow.spec.ts', tests: [{ projectName: 'chromium', expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed' }] }] }] }] }] };
  const converted = browserCoverageReport(report);
  const baseline = { version: 1, package: 'e2e', tests: [{ file: 'flow.spec.ts', name: 'chromium: draft recovery › retains Back cursor' }] };
  assert.equal(validateHistoricalCoverage(converted, baseline).historicalAssertions, 1);
  report.suites[0].suites[0].specs[0].title = 'an unrelated passing scenario';
  assert.throws(() => validateHistoricalCoverage(browserCoverageReport(report), baseline), /missing/);
});

test('explicit renames require reasons and cannot collapse multiple old tests into one', () => {
  const a = { file: 'src/votes.test.ts', name: 'disk failure' }, b = { file: 'src/votes.test.ts', name: 'reopen' };
  const replacement = { file: a.file, name: 'late D1 rollback' };
  const baseline = { version: 1, tests: [a] };
  const report = { testResults: [{ name: `C:/fixture/server/${a.file}`, assertionResults: [{ fullName: replacement.name, status: 'passed' }] }] };
  const mappings = { version: 1, renames: [{ legacy: a, replacement, reason: 'Replace filesystem failure with an actual D1 late-statement rollback.' }] };
  assert.equal(validateHistoricalCoverage(report, baseline, mappings).explicitRenames, 1);
  assert.throws(() => validateHistoricalCoverage(report, baseline, { ...mappings, renames: [{ ...mappings.renames[0], reason: '' }] }), /Invalid/);
  assert.throws(() => validateHistoricalCoverage(report, { version: 1, tests: [a, b] }, { ...mappings, renames: [...mappings.renames, { legacy: b, replacement, reason: 'Collapsed coverage' }] }), /collapsed/);
  assert.throws(() => validateHistoricalCoverage(report, { version: 1, tests: [a, replacement] }, mappings), /Collapsed/);
});

test('identical parameterized display names retain every historical occurrence', () => {
  const legacy = { file: 'src/votes.test.ts', name: 'rejects vote 0' };
  const baseline = { version: 1, tests: [{ ...legacy, occurrence: 0 }, { ...legacy, occurrence: 1 }] };
  const report = { testResults: [{ name: 'C:/fixture/server/src/votes.test.ts', assertionResults: [{ fullName: legacy.name, status: 'passed' }] }] };
  assert.throws(() => validateHistoricalCoverage(report, baseline), /missing/);
  report.testResults[0].assertionResults.push({ fullName: legacy.name, status: 'passed' });
  assert.equal(validateHistoricalCoverage(report, baseline).historicalAssertions, 2);
});
