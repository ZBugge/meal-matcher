import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const limits = { state: 8192, readme: 8192, digest: 12288, summary: 8, queue: 10 };

function sectionLines(text, heading) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  let active = false;
  let fenced = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    if (/^#{1,2}\s/.test(line)) active = line.trim() === `## ${heading}`;
    else if (active) sections.push(line);
  }
  return sections;
}

function prose(text) {
  return text.replace(/<!--[^]*?-->/g, '').replace(/^\s*(```|~~~)[^]*?^\s*\1[^\n]*$/gm, '');
}

export async function checkBrain(root = defaultRoot) {
  root = path.resolve(root);
  const errors = [];
  const files = new Map();
  const fail = (file, message) => errors.push({ file, message });

  async function readMarkdown(relative) {
    try {
      const absolute = path.join(root, relative);
      const stat = await lstat(absolute);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        fail(relative, 'Expected a regular file, not a directory or symbolic link.');
        return;
      }
      files.set(relative.replaceAll('\\', '/'), await readFile(absolute, 'utf8'));
    } catch (error) {
      fail(relative, error.code === 'ENOENT' ? 'Required file is missing.' : `Cannot read file: ${error.message}`);
    }
  }

  async function walkBrain(relative) {
    let entries;
    try {
      const stat = await lstat(path.join(root, relative));
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        fail(relative, 'Expected a directory; symbolic links are not followed.');
        return;
      }
      entries = await readdir(path.join(root, relative), { withFileTypes: true });
    } catch (error) {
      if (error.code !== 'ENOENT') fail(relative, `Cannot inspect directory: ${error.message}`);
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) continue;
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walkBrain(child);
      else if (entry.isFile() && /\.md$/i.test(entry.name)) await readMarkdown(child);
    }
  }

  await readMarkdown('Ideas.md');
  await walkBrain('brain');
  for (const required of ['brain/README.md', 'brain/STATE.md', 'brain/DECISIONS.md']) {
    if (!files.has(required) && !errors.some(error => error.file === required)) fail(required, 'Required file is missing.');
  }

  for (const [file, text] of files) {
    const content = prose(text);
    const digest = file.startsWith('brain/digests/');
    const maximum = file === 'brain/STATE.md' ? limits.state : file === 'brain/README.md' ? limits.readme : digest ? limits.digest : null;
    if (maximum && Buffer.byteLength(text, 'utf8') > maximum) {
      fail(file, `${Buffer.byteLength(text, 'utf8')} bytes exceeds ${maximum} bytes; move older detail into a linked brief or archive.`);
    }

    if (digest || file === 'brain/STATE.md') {
      const summary = sectionLines(content, 'Summary').filter(line => /^\s*[-*+]\s/.test(line));
      if (summary.length > limits.summary) fail(file, `Summary has ${summary.length} bullet lines; keep at most ${limits.summary}.`);
      const queue = sectionLines(content, 'Decision queue');
      const open = queue.filter(line => /^\s*-\s+\[ \]\s/.test(line));
      if (open.length > limits.queue) fail(file, `Decision queue has ${open.length} open entries; keep at most ${limits.queue}.`);
      for (const line of open) {
        const ids = line.match(/\bMM-D[A-Za-z0-9#_-]*/g) || [];
        if (ids.length !== 1 || !/^MM-D\d{3}$/.test(ids[0])) fail(file, `Each open decision needs exactly one stable MM-D### ID: ${line.trim()}`);
      }
      const seen = new Set();
      for (const line of queue.filter(line => /^\s*-\s+\[[ xX]\]\s/.test(line))) {
        const id = line.match(/\bMM-D\d{3}\b/)?.[0];
        if (!id) continue;
        if (seen.has(id)) fail(file, `Duplicate decision ID ${id} in Decision queue; give each decision a unique ID.`);
        seen.add(id);
      }
    }

    if (file === 'Ideas.md') {
      const seen = new Set();
      for (const id of content.match(/\bMM-I[A-Za-z0-9#_-]*/g) || []) {
        if (!/^MM-I\d{3}$/.test(id)) fail(file, `Malformed idea ID ${id}; use MM-I followed by exactly three digits.`);
        else if (seen.has(id)) fail(file, `Duplicate idea ID ${id}; keep one definition in Ideas.md.`);
        seen.add(id);
      }
    }

    // Intentionally check inline file links only, not reference links or anchors.
    for (const match of content.matchAll(/\[[^\]\n]*\]\((<[^>\n]+>|[^)\n]+)\)/g)) {
      let destination = match[1].trim();
      if (destination.startsWith('<')) destination = destination.match(/^<([^>]+)>/)?.[1] ?? destination;
      else destination = destination.replace(/\s+["'][^]*["']$/, '');
      if (/^(?:[a-z][a-z0-9+.-]*:|\/|\\|#)/i.test(destination)) continue;
      destination = destination.split('#')[0];
      if (!destination) continue;
      try {
        destination = decodeURIComponent(destination);
        await lstat(path.resolve(root, path.dirname(file), destination));
      } catch (error) {
        fail(file, `Broken file link "${destination}": ${error.code === 'ENOENT' ? 'target does not exist' : error.message}.`);
      }
    }
  }

  return { ok: errors.length === 0, root, checkedFiles: [...files.keys()].sort(), limits, errors };
}

async function main() {
  let root = defaultRoot;
  let json = false;
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--json') json = true;
    else if (args[index] === '--root' && args[index + 1] && !args[index + 1].startsWith('--')) root = args[++index];
    else throw new Error(`Unknown or incomplete argument: ${args[index]}. Usage: node scripts/check-brain.mjs [--root <directory>] [--json]`);
  }
  const result = await checkBrain(root);
  if (json) console.log(JSON.stringify(result, null, 2));
  else if (result.ok) console.log(`Brain check passed (${result.checkedFiles.length} Markdown files).`);
  else {
    console.error(`Brain check failed (${result.errors.length} issues):`);
    for (const error of result.errors) console.error(`- ${error.file}: ${error.message}`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
