import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

// Parse as data: never source a GitHub Secret as shell code.
const values = parseEnv(process.env.ENV_FILE || '');
const publicKeys = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_DATA_MODE',
];
const fail = (message) => { throw new Error(message); };
for (const key of publicKeys) {
  if (!values[key]) fail(`ENV_FILE requires ${key}`);
}
if (values.NEXT_PUBLIC_APP_URL !== 'https://ohpin.newdawn.co.kr') {
  fail('NEXT_PUBLIC_APP_URL must be https://ohpin.newdawn.co.kr');
}
const url = new URL(values.NEXT_PUBLIC_SUPABASE_URL);
if (url.protocol !== 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
  fail('NEXT_PUBLIC_SUPABASE_URL must be the production HTTPS URL');
}
if (values.NEXT_PUBLIC_DATA_MODE !== 'supabase') fail('NEXT_PUBLIC_DATA_MODE must be supabase');
const key = values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!key.startsWith('sb_publishable_')) {
  // Legacy anon keys remain supported; service_role must never enter the browser bundle.
  let role;
  try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch { /* Invalid key. */ }
  if (role !== 'anon') fail('Use a Supabase publishable or legacy anon key, never a secret/service_role key');
}
for (const [name, value] of Object.entries(values)) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || /[\r\n\0]/.test(value)) {
    fail('ENV_FILE must contain valid names and single-line values for docker --env-file');
  }
  if (name.startsWith('NEXT_PUBLIC_') && !publicKeys.includes(name)) {
    fail(`Add ${name} to the Dockerfile and public build allowlist before using it`);
  }
}
for (const name of ['RENDER_WORKERS', 'UPLOAD_CONCURRENCY', 'SLIDE_MAX_EDGE']) {
  if (values[name] !== undefined && !/^[1-9][0-9]*$/.test(values[name])) {
    fail(`${name} must be a positive integer`);
  }
}
// Fixed deployment contract; reject accidental overrides rather than silently accepting them.
for (const [name, value] of Object.entries({ PORT: '3000', HOSTNAME: '0.0.0.0', NODE_ENV: 'production' })) {
  if (values[name] !== undefined && values[name] !== value) fail(`${name} must be ${value}`);
}
const directory = process.argv[2];
if (!directory) fail('Usage: node scripts/prepare-ec2-env.mjs OUTPUT_DIRECTORY');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const serialize = (entries) => entries.map(([name, value]) => `${name}=${value}\n`).join('');
writeFileSync(join(directory, 'runtime.env'), serialize(Object.entries(values)), { mode: 0o600 });
writeFileSync(join(directory, 'public.env'), serialize(publicKeys.map((name) => [name, values[name]])), { mode: 0o600 });
