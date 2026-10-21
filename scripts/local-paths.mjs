import { lstat, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';

const same = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
export async function privateDirectory(root, directory, { existingOnly = false } = {}) {
  root = path.resolve(root);
  directory = path.resolve(directory);
  const relative = path.relative(root, directory);
  const parts = relative.split(path.sep);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !['.verification', '.wrangler'].includes(parts[0])) throw new Error('Private local state must stay in this checkout .verification/ or .wrangler/');
  const physicalRoot = await realpath(root);
  let current = physicalRoot;
  for (const part of parts) {
    current = path.join(current, part);
    let info;
    try { info = await lstat(current); }
    catch (error) {
      if (error.code !== 'ENOENT' || existingOnly) throw error;
      await mkdir(current);
      info = await lstat(current);
    }
    if (!info.isDirectory() || info.isSymbolicLink() || !same(await realpath(current), current)) throw new Error('Refusing redirected private local state');
  }
  return current;
}
