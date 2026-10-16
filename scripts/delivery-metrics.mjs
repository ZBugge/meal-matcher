import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const kinds = new Set(['setup', 'builder', 'integration', 'repair', 'review', 'verification', 'other']);
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && value.trim().length > 0;

function timestamp(value, field) {
  const parts = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  requireValue(parts, `${field} must be an ISO timestamp with timezone`);
  const [, year, month, day, hour, minute, second, , offsetHour = '0', offsetMinute = '0'] = parts;
  const calendar = new Date(0);
  calendar.setUTCFullYear(Number(year), Number(month), 0);
  requireValue(Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= calendar.getUTCDate()
    && Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59
    && Number(offsetHour) <= 23 && Number(offsetMinute) <= 59, `${field} is not a valid ISO timestamp`);
  const result = Date.parse(value);
  requireValue(Number.isFinite(result), `${field} is not a valid ISO timestamp`);
  return result;
}

function union(intervals) {
  let elapsed = 0;
  let end = -Infinity;
  for (const [start, finish] of [...intervals].sort((a, b) => a[0] - b[0])) {
    elapsed += Math.max(0, finish - Math.max(start, end));
    end = Math.max(end, finish);
  }
  return elapsed;
}

/** Summarize recorded intervals; the sequential comparison is a counterfactual only. */
export function summarizeDelivery(input) {
  requireValue(object(input) && input.version === 1, 'version must be 1');
  requireValue(identifier(input.id), 'id must be a nonempty string');
  const start = timestamp(input.startedAt, 'startedAt');
  const finish = timestamp(input.finishedAt, 'finishedAt');
  requireValue(finish >= start, 'finishedAt must be at or after startedAt');
  requireValue(Array.isArray(input.phases), 'phases must be an array');
  const ids = new Set();
  const phases = input.phases.map((phase, index) => {
    requireValue(object(phase), `phases[${index}] must be an object`);
    requireValue(identifier(phase.id) && !ids.has(phase.id), 'phase ids must be nonempty and unique');
    ids.add(phase.id);
    requireValue(kinds.has(phase.kind), `invalid phase kind: ${phase.kind}`);
    const begin = timestamp(phase.startedAt, `phase ${phase.id} startedAt`);
    const end = timestamp(phase.finishedAt, `phase ${phase.id} finishedAt`);
    requireValue(begin >= start && end <= finish && end >= begin, `phase ${phase.id} must be ordered and inside the run`);
    return { kind: phase.kind, interval: [begin, end] };
  });
  const builders = phases.filter(phase => phase.kind === 'builder').map(phase => phase.interval);
  const finalGates = phases.filter(phase => phase.kind === 'review' || phase.kind === 'verification').map(phase => phase.interval);
  const events = builders.filter(([begin, end]) => begin < end).flatMap(([begin, end]) => [[begin, 1], [end, -1]])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let active = 0;
  for (const [, delta] of events) {
    active += delta;
    requireValue(active <= 2, 'at most two builders may run simultaneously');
  }
  const lastBuilderEnd = builders.reduce((end, interval) => Math.max(end, interval[1]), start);
  requireValue(finalGates.every(([begin]) => begin >= lastBuilderEnd), 'final review and verification must start after all builders finish');
  requireValue(object(input.quality), 'quality is required');
  for (const key of ['verificationPassed', 'reviewPassed', 'ownershipPassed']) {
    requireValue(typeof input.quality[key] === 'boolean', `quality.${key} must be boolean`);
  }
  requireValue(object(input.usage), 'usage is required (use null for unknown token counts)');
  for (const key of ['totalTokens', 'sequentialBaselineTokens']) {
    const value = input.usage[key];
    requireValue(value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0), `usage.${key} must be a nonnegative finite number or null`);
  }
  const elapsedMs = finish - start;
  const builderUnionMs = union(builders);
  const builderSummedMs = builders.reduce((sum, [begin, end]) => sum + end - begin, 0);
  const finalGateUnionMs = union(finalGates);
  const finalGateSummedMs = finalGates.reduce((sum, [begin, end]) => sum + end - begin, 0);
  const estimatedSequentialMs = elapsedMs - builderUnionMs + builderSummedMs - finalGateUnionMs + finalGateSummedMs;
  const estimatedSavingPercent = estimatedSequentialMs > 0 ? 100 * (estimatedSequentialMs - elapsedMs) / estimatedSequentialMs : null;
  const { totalTokens, sequentialBaselineTokens } = input.usage;
  const ratio = totalTokens !== null && sequentialBaselineTokens > 0 ? totalTokens / sequentialBaselineTokens : NaN;
  const usageRatio = Number.isFinite(ratio) ? ratio : null;
  const qualityPassed = input.quality.verificationPassed && input.quality.reviewPassed && input.quality.ownershipPassed;
  return {
    version: 1, id: input.id,
    observed: { elapsedMs, builderUnionMs, builderSummedMs, builderOverlapMs: builderSummedMs - builderUnionMs,
      nonbuilderElapsedMs: elapsedMs - builderUnionMs, finalGateUnionMs, finalGateSummedMs },
    counterfactual: { label: 'Estimated sequential critical path; not a measured sequential benchmark or causal speedup',
      estimatedSequentialMs, estimatedSavingPercent },
    qualityPassed,
    timingTarget: { minimumSavingPercent: 20, met: estimatedSavingPercent === null ? null : estimatedSavingPercent >= 20 },
    usage: { totalTokens, sequentialBaselineTokens, ratio: usageRatio, status: usageRatio === null ? 'unknown' : 'available' },
    costNeutralityTarget: { maximumUsageIncreasePercent: 10, met: usageRatio === null ? null : usageRatio <= 1.1 },
    adoption: 'Not established: counterfactual timing does not establish adoption or measured causal speedup',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    requireValue(process.argv.length === 4 && process.argv[2] === 'report', 'Usage: node scripts/delivery-metrics.mjs report <file.json>');
    const input = JSON.parse(await readFile(process.argv[3], 'utf8'));
    console.log(JSON.stringify(summarizeDelivery(input), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exitCode = 1;
  }
}
