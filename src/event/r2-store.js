/**
 * R2EventStore — immutable event persistence using Cloudflare R2/S3.
 *
 * Events are stored with deterministic partitioning:
 *   events/year=YYYY/month=MM/day=DD/source=SYSTEM/evt_ID.json
 *
 * Artifacts are stored content-addressed:
 *   artifacts/sha256/ab/abcdef.../filename
 *
 * Implements the EventStore interface: append, get, scan, stream.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export class R2EventStore {
  constructor({ accountId, accessKeyId, secretAccessKey, bucket, prefix = '' } = {}) {
    this.accountId = accountId;
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.bucket = bucket;
    this.prefix = prefix;
    this._s3 = null;
  }

  async _getClient() {
    if (this._s3) return this._s3;
    const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    this._s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${this.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: this.accessKeyId, secretAccessKey: this.secretAccessKey },
    });
    return this._s3;
  }

  _eventKey(event) {
    const d = new Date(event.occurred_at);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const source = event.source?.system || 'unknown';
    return `${this.prefix}events/year=${year}/month=${month}/day=${day}/source=${source}/${event.event_id}.json`;
  }

  async append(event) {
    const s3 = await this._getClient();
    const key = this._eventKey(event);
    const body = Buffer.from(JSON.stringify(event, null, 2));
    await s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json',
    }));
    return { key, size: body.length };
  }

  async get(eventId) {
    const s3 = await this._getClient();
    const prefix = `${this.prefix}events/`;
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
      MaxKeys: 1000,
    }));
    const match = (list.Contents || []).find(c => c.Key?.includes(eventId));
    if (!match) return null;
    const obj = await s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: match.Key }));
    return JSON.parse(await obj.Body.transformToString());
  }

  async scan({ since, until, source, limit = 100 } = {}) {
    const s3 = await this._getClient();
    let prefix = `${this.prefix}events/`;
    if (source) prefix += `source=${source}/`;
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
      MaxKeys: Math.min(limit * 2, 1000),
    }));
    const events = [];
    for (const obj of list.Contents || []) {
      if (events.length >= limit) break;
      const item = await s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: obj.Key }));
      const event = JSON.parse(await item.Body.transformToString());
      if (since && event.occurred_at < since) continue;
      if (until && event.occurred_at > until) continue;
      events.push(event);
    }
    return events;
  }
}

/**
 * LocalR2Fallback — deterministic local filesystem storage matching R2 layout.
 * Use for development, testing, and offline mode.
 */
export class LocalR2Fallback {
  constructor(baseDir) {
    this.baseDir = baseDir;
  }

  _eventKey(event) {
    const d = new Date(event.occurred_at);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const source = event.source?.system || 'unknown';
    return path.join(this.baseDir, 'events', `year=${year}`, `month=${month}`, `day=${day}`, `source=${source}`, `${event.event_id}.json`);
  }

  async append(event) {
    const filePath = this._eventKey(event);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(event, null, 2), 'utf8');
    return { key: filePath, size: (await fs.stat(filePath)).size };
  }

  async get(eventId) {
    const glob = await this._findFile(eventId);
    if (!glob) return null;
    return JSON.parse(await fs.readFile(glob, 'utf8'));
  }

  async _findFile(eventId) {
    const { execSync } = await import('node:child_process');
    try {
      const result = execSync(`find "${this.baseDir}/events" -name "${eventId}.json" 2>/dev/null`, { encoding: 'utf8' });
      return result.trim().split('\n')[0] || null;
    } catch {
      return null;
    }
  }

  async scan({ since, until, source, limit = 100 } = {}) {
    const { execSync } = await import('node:child_process');
    const events = [];
    try {
      const files = execSync(`find "${this.baseDir}/events" -name "*.json" | head -${limit * 2}`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      for (const f of files) {
        if (events.length >= limit) break;
        const event = JSON.parse(await fs.readFile(f, 'utf8'));
        if (since && event.occurred_at < since) continue;
        if (until && event.occurred_at > until) continue;
        if (source && event.source?.system !== source) continue;
        events.push(event);
      }
    } catch {}
    return events;
  }
}

/**
 * ArtifactStore — content-addressed artifact storage.
 */
export class ArtifactStore {
  constructor(r2Store) {
    this.r2 = r2Store;
  }

  _artifactKey(sha256, filename) {
    const ab = sha256.slice(0, 2);
    const rest = sha256.slice(2);
    return `artifacts/sha256/${ab}/${rest}/${filename}`;
  }

  async store(data, filename, producerEventId) {
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');
    const key = this._artifactKey(sha256, filename);
    if (this.r2 instanceof LocalR2Fallback) {
      const filePath = path.join(this.r2.baseDir, key);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, data);
    } else {
      const s3 = await this.r2._getClient();
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      await s3.send(new PutObjectCommand({
        Bucket: this.r2.bucket,
        Key: key,
        Body: data,
      }));
    }
    return {
      artifact_id: `art_${sha256.slice(0, 16)}`,
      sha256,
      size_bytes: data.length,
      storage_uri: `r2://${this.r2.bucket || 'local'}/${key}`,
      producer_event_id: producerEventId,
    };
  }

  async verify(sha256, filename) {
    const key = this._artifactKey(sha256, filename);
    if (this.r2 instanceof LocalR2Fallback) {
      const filePath = path.join(this.r2.baseDir, key);
      const data = await fs.readFile(filePath);
      const actual = crypto.createHash('sha256').update(data).digest('hex');
      return actual === sha256;
    }
    return false;
  }
}
