/**
 * CanonicalEventIngestor — single ingestion path for all events.
 *
 * Flow: validate → persist exact envelope → project into graph → acknowledge.
 * No legacy bus.emit(). No event regeneration. The received envelope is truth.
 */

import crypto from 'node:crypto';
import { validateEvent, CONTRACT_VERSION } from '../../contracts/index.js';

export class CanonicalEventIngestor {
  constructor({ eventStore, graph, projector, checkpointStore }) {
    this.eventStore = eventStore;
    this.graph = graph;
    this.projector = projector;
    this.checkpointStore = checkpointStore;
  }

  async ingest(event) {
    // 1. Validate envelope structure
    const validation = validateEvent(event);
    if (!validation.valid) {
      return { accepted: false, error: `invalid_envelope: ${validation.errors.join(', ')}`, event_id: event.event_id };
    }

    // 2. Verify payload integrity
    const expectedHash = crypto.createHash('sha256').update(JSON.stringify(event.payload, null, 0)).digest('hex');
    if (event.integrity?.payload_sha256 && event.integrity.payload_sha256 !== expectedHash) {
      return { accepted: false, error: 'payload_hash_mismatch', event_id: event.event_id };
    }

    // 3. Check for existing event (idempotent / conflict detection)
    const existing = await this.eventStore.getById(event.event_id);
    if (existing) {
      const identical = JSON.stringify(existing) === JSON.stringify(event);
      if (identical) {
        return { accepted: true, duplicate: true, event_id: event.event_id };
      }
      return { accepted: false, error: 'event_id_conflict', event_id: event.event_id };
    }

    // 4. Persist EXACT received envelope (never regenerate fields)
    await this.eventStore.appendEnvelope(event);

    // 5. Project into graph (best effort, non-blocking)
    let projectionStatus = 'pending';
    try {
      const statements = this.projector(event);
      for (const stmt of statements) {
        await this.graph.query(stmt);
      }
      projectionStatus = 'projected';
    } catch (err) {
      projectionStatus = `error: ${err.message}`;
    }

    // 6. Update checkpoint
    if (this.checkpointStore) {
      await this.checkpointStore.update(event.event_id, event.occurred_at);
    }

    return { accepted: true, duplicate: false, event_id: event.event_id, projection: projectionStatus };
  }

  async ingestBatch(events) {
    const results = [];
    for (const event of events) {
      results.push(await this.ingest(event));
    }
    return {
      accepted: results.filter(r => r.accepted && !r.duplicate).map(r => r.event_id),
      duplicate: results.filter(r => r.duplicate).map(r => r.event_id),
      rejected: results.filter(r => !r.accepted).map(r => ({ event_id: r.event_id, error: r.error })),
    };
  }
}
