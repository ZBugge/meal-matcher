// Mutation success requires the intended assertion mismatch, not a test-process error.
export function validateMutationFailure(execution, report, controlCount, mutation) {
  const assertions = (report.testResults ?? []).flatMap(result => result.assertionResults ?? []);
  const failures = assertions.filter(result => result.status === 'failed');
  const matchingAssertion = failures.some(result =>
    `${result.fullName} ${result.title}`.includes(mutation.expected)
    && (result.failureMessages ?? []).some(message => mutation.assertion.test(message)));
  if (execution.exitCode !== 1 || report.numTotalTests !== controlCount || report.numPassedTests < 1
      || assertions.length !== controlCount || assertions.some(result => !['passed', 'failed'].includes(result.status))
      || report.numFailedTests !== failures.length || !matchingAssertion) {
    throw new Error(`${mutation.id}: survived or did not fail the intended regression assertion`);
  }
  return failures.map(result => result.fullName);
}
