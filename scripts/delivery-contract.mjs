import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

function stringList(value, label, errors) {
  if (!Array.isArray(value) || !value.length || value.some(item => !nonempty(item))) {
    errors.push(`${label} must contain at least one nonempty string.`);
    return false;
  }
  return true;
}

function fileKey(value) {
  if (!nonempty(value) || /[\x00-\x1f:*?\[\]{}!]/.test(value)) return null;
  const normalized = value.replaceAll('\\', '/');
  if (normalized.startsWith('/') || normalized.split('/').some(part =>
    !part || part === '.' || part === '..' || /[. ]$/.test(part))) return null;
  return normalized.toLowerCase();
}

function worktreeKey(value) {
  if (!nonempty(value) || /[\x00-\x1f*?]/.test(value)) return null;
  const slashes = value.replaceAll('\\', '/');
  const windows = /^[a-z]:\//i.test(slashes) || /^\/\/[^/]+\/[^/]+/.test(slashes);
  if (!windows && !path.posix.isAbsolute(slashes)) return null;
  const normalized = (windows ? path.win32.normalize(slashes) : path.posix.normalize(slashes))
    .replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
  if (normalized.split('/').some(segment => /[. ]$/.test(segment))) return null;
  return normalized || '/';
}

/** Validate a proposed delivery before dispatch. This checks declarations, not a sandbox. */
export function validateContract(input) {
  const errors = [];
  if (!object(input)) return ['Contract must be a JSON object.'];
  if (input.version !== 1) errors.push('version must be 1.');
  if (!nonempty(input.id)) errors.push('id must be a nonempty string.');
  if (typeof input.baseSha !== 'string' || !/^[a-f0-9]{40}$/.test(input.baseSha)) {
    errors.push('baseSha must be the full 40-character lowercase hexadecimal commit SHA.');
  }
  stringList(input.acceptance, 'acceptance', errors);
  if (!nonempty(input.sharedContract)) errors.push('sharedContract must be a nonempty string.');
  if (!positive(input.overheadMinutes)) errors.push('overheadMinutes must be a positive finite measured estimate.');
  const builders = Array.isArray(input.builders) ? input.builders : [];
  if (builders.length < 1 || builders.length > 2) errors.push('builders must contain one or two builders.');
  if (!object(input.budget) || !Number.isInteger(input.budget.maxDelegatedTurns) ||
      input.budget.maxDelegatedTurns > 5 || input.budget.maxDelegatedTurns < builders.length + 3) {
    errors.push('budget.maxDelegatedTurns must fit the builders, one reviewer, and two repair turns, and cannot exceed 5.');
  }
  if (!object(input.budget) || !Number.isInteger(input.budget.maxImplementationAttempts) ||
      input.budget.maxImplementationAttempts < 1 || input.budget.maxImplementationAttempts > 3) {
    errors.push('budget.maxImplementationAttempts must be an integer from 1 to 3.');
  }

  const owners = new Set();
  const files = new Map();
  const worktrees = [];
  const entries = [{ entry: input.coordinator, label: 'coordinator' },
    ...builders.map((entry, index) => ({ entry, label: `builders[${index}]` }))];
  for (const { entry, label } of entries) {
    if (!object(entry)) { errors.push(`${label} must be an object.`); continue; }
    if (!nonempty(entry.owner)) errors.push(`${label}.owner must be a nonempty string.`);
    else if (owners.has(entry.owner)) errors.push(`${label}.owner duplicates owner ${entry.owner}.`);
    else owners.add(entry.owner);
    const tree = worktreeKey(entry.worktree);
    if (tree === null) errors.push(`${label}.worktree must be an absolute checkout path.`);
    else {
      for (const previous of worktrees) {
        if (tree === previous.tree || tree.startsWith(`${previous.tree.replace(/\/$/, '')}/`) ||
            previous.tree.startsWith(`${tree.replace(/\/$/, '')}/`)) {
          errors.push(`${label}.worktree overlaps ${previous.label}.worktree; use separate, non-nested checkouts.`);
        }
      }
      worktrees.push({ tree, label });
    }
    if (stringList(entry.files, `${label}.files`, errors)) {
      for (const file of entry.files) {
        const key = fileKey(file);
        if (key === null) errors.push(`${label}.files: ${JSON.stringify(file)} must be an exact relative file path without traversal, glob syntax, or ambiguous segments.`);
        else if (files.has(key)) errors.push(`${label}.files: ${file} collides with ${files.get(key)}; assign each path once.`);
        else files.set(key, `${label}:${file}`);
      }
    }
    if (label !== 'coordinator') {
      stringList(entry.acceptance, `${label}.acceptance`, errors);
      stringList(entry.checks, `${label}.checks`, errors);
      if (!positive(entry.estimatedMinutes)) errors.push(`${label}.estimatedMinutes must be positive and finite.`);
    }
  }
  if (positive(input.overheadMinutes) && builders.some(builder => object(builder) &&
      positive(builder.estimatedMinutes) && builder.estimatedMinutes <= input.overheadMinutes)) {
    errors.push('Each builder estimate, including the shorter slice, must exceed overheadMinutes; otherwise deliver serially.');
  }
  const builderOwners = builders.filter(object).map(builder => builder.owner);
  if (!Array.isArray(input.integrationOrder) || input.integrationOrder.length !== builders.length ||
      new Set(input.integrationOrder).size !== builders.length ||
      input.integrationOrder.some(owner => !builderOwners.includes(owner))) {
    errors.push('integrationOrder must list every builder owner exactly once, in the intended integration order.');
  }
  return errors;
}

/** Check declared changed files against the exact ownership map; never runs checks or merges. */
export function validateOwnership(contract, changes) {
  const errors = validateContract(contract);
  if (errors.length) return errors;
  if (!Array.isArray(changes)) return ['changes must be an array of {owner, files} objects.'];
  const ownership = new Map([contract.coordinator, ...contract.builders]
    .map(entry => [entry.owner, new Set(entry.files.map(fileKey))]));
  const seen = new Set();
  const seenOwners = new Set();
  for (const [index, change] of changes.entries()) {
    if (!object(change)) { errors.push(`changes[${index}] must be an object.`); continue; }
    if (!ownership.has(change.owner)) errors.push(`changes[${index}].owner is unknown: ${JSON.stringify(change.owner)}.`);
    if (seenOwners.has(change.owner)) errors.push(`changes[${index}] duplicates owner ${change.owner}; combine its files into one entry.`);
    seenOwners.add(change.owner);
    if (!Array.isArray(change.files)) { errors.push(`changes[${index}].files must be an array.`); continue; }
    for (const file of change.files) {
      const key = fileKey(file);
      if (key === null) errors.push(`changes[${index}]: ${JSON.stringify(file)} is not an exact relative file path.`);
      else {
        if (seen.has(key)) errors.push(`Changed path ${file} is listed more than once.`);
        seen.add(key);
        if (!ownership.get(change.owner)?.has(key)) errors.push(`${change.owner} does not own ${file}; update the contract before dispatch or integration.`);
      }
    }
  }
  return errors;
}

const help = `Usage: node scripts/delivery-contract.mjs check <contract.json> [changes.json]
Validate v1 delivery ownership, separate absolute worktrees, acceptance/checks,
full base SHA, integration order and the five-turn/three-attempt policy.
Include measured overheadMinutes; every builder estimate must exceed it.
changes.json: [{"owner":"builder-id","files":["exact/relative/file"]}]
Outputs JSON; invalid input exits 1. Reads only; never executes checks or merges.
Declared ownership is a preflight check, not filesystem or sandbox enforcement.`;

async function main(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { console.log(help); return; }
  let errors;
  try {
    if (args[0] !== 'check' || args.length < 2 || args.length > 3) throw new Error(help);
    const contract = JSON.parse(await readFile(args[1], 'utf8'));
    errors = args[2] ? validateOwnership(contract, JSON.parse(await readFile(args[2], 'utf8'))) : validateContract(contract);
  } catch (error) { errors = [error.message]; }
  console.log(JSON.stringify({ valid: errors.length === 0, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main(process.argv.slice(2));
}
