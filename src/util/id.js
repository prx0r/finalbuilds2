import crypto from 'node:crypto';

export function stableId(prefix, ...parts) {
  const body = parts.map(v => String(v ?? '')).join('\u001f');
  const hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 20);
  return `${prefix}_${hash}`;
}

export function randomId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function stableBucket(key, buckets = 10000) {
  const hex = crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 12);
  return Number.parseInt(hex, 16) % buckets;
}
