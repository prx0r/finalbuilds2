/**
 * Event store factory — creates the appropriate event store based on environment.
 */

import { JsonlEventStore, InMemoryEventStore } from '../event/jsonl-store.js';
import { LocalR2Fallback, R2EventStore } from '../event/r2-store.js';

export function createEventStore(env = process.env) {
  const backend = env.EVENT_STORE_BACKEND || 'jsonl';
  const root = env.FINALBUILDS_ROOT || '.';

  switch (backend) {
    case 'r2':
      return new R2EventStore({
        accountId: env.R2_ACCOUNT_ID,
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        bucket: env.R2_BUCKET,
        prefix: env.R2_PREFIX || '',
      });
    case 'local-r2':
      return new LocalR2Fallback(`${root}/runtime/r2-events`);
    case 'jsonl':
    default:
      return new JsonlEventStore(`${root}/runtime/events.jsonl`);
  }
}
