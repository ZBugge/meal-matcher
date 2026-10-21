// Counts alone cannot establish that legacy regression coverage survived a port.
export function browserCoverageReport(report) {
  const files = new Map();
  const visit = (suite, parents = []) => {
    const titles = suite.title && suite.title !== suite.file ? [...parents, suite.title] : parents;
    for (const spec of suite.specs ?? []) {
      const file = spec.file.replaceAll('\\', '/');
      const assertions = files.get(file) ?? [];
      for (const result of spec.tests ?? []) assertions.push({ fullName: `${result.projectName}: ${[...titles, spec.title].join(' › ')}`, status: result.status === 'expected' && result.expectedStatus === 'passed' && result.results?.length === 1 && result.results[0].status === 'passed' ? 'passed' : result.status });
      files.set(file, assertions);
    }
    for (const nested of suite.suites ?? []) visit(nested, titles);
  };
  for (const suite of report.suites ?? []) visit(suite);
  return { testResults: [...files].map(([file, assertionResults]) => ({ name: `/e2e/${file}`, assertionResults })) };
}

export function validateHistoricalCoverage(report, baseline, mappings = { version: 1, renames: [] }) {
  if (baseline.version !== 1 || mappings.version !== 1 || !Array.isArray(baseline.tests) || !Array.isArray(mappings.renames)) throw new Error('Malformed historical test inventory');
  const key = ({ file, name, occurrence = 0 }) => `${file}\0${name}\0${occurrence}`;
  const originals = new Set(baseline.tests.map(key));
  if (originals.size !== baseline.tests.length) throw new Error('Duplicate historical assertion identity');
  const replacements = new Map();
  const targets = new Set();
  for (const mapping of mappings.renames) {
    if (!mapping.reason?.trim() || !originals.has(key(mapping.legacy)) || replacements.has(key(mapping.legacy)) || targets.has(key(mapping.replacement))) throw new Error('Invalid or collapsed historical test mapping');
    replacements.set(key(mapping.legacy), key(mapping.replacement));
    targets.add(key(mapping.replacement));
  }
  const actual = new Map();
  const occurrences = new Map();
  const effective = baseline.tests.map(legacy => replacements.get(key(legacy)) ?? key(legacy));
  if (new Set(effective).size !== effective.length) throw new Error('Collapsed historical assertions through an unmapped identity');
  for (const result of report.testResults ?? []) {
    const normalized = result.name.replaceAll('\\', '/');
    const packageName = baseline.package || 'server';
    const markerText = `/${packageName}/`;
    const marker = normalized.lastIndexOf(markerText);
    const file = marker < 0 ? normalized : normalized.slice(marker + markerText.length);
    for (const assertion of result.assertionResults ?? []) {
      const base = `${file}\0${assertion.fullName}`;
      const occurrence = occurrences.get(base) ?? 0;
      occurrences.set(base, occurrence + 1);
      const identity = key({ file, name: assertion.fullName, occurrence });
      if (actual.has(identity)) throw new Error('Duplicate actual assertion identity');
      actual.set(identity, assertion.status);
    }
  }
  const missing = [];
  for (const legacy of baseline.tests) {
    const identity = replacements.get(key(legacy)) ?? key(legacy);
    if (actual.get(identity) !== 'passed') missing.push(`${legacy.file}: ${legacy.name}`);
  }
  if (missing.length) throw new Error(`Historical assertions missing or not passed (${missing.length}):\n${missing.join('\n')}`);
  return { historicalAssertions: baseline.tests.length, explicitRenames: replacements.size };
}
