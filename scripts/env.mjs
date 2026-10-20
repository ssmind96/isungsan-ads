import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export const envPath = process.env.ADS_ENV_FILE || path.join(os.homedir(), '.env');
export const settings = { ...process.env };
try {
  const contents = await fs.readFile(envPath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || settings[match[1]]) continue;
    const raw = match[2];
    settings[match[1]] = /^(["']).*\1$/.test(raw) ? raw.slice(1, -1) : raw.replace(/\s+#.*$/, '').trim();
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
