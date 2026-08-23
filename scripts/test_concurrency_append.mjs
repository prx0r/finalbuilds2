/**
 * Concurrency torture for JsonlEventStore append (P2).
 * N independent processes append numbered events to ONE file while some get
 * SIGKILLed mid-flight at random moments. Afterwards:
 *   - every acknowledged event number appears EXACTLY once
 *   - every line parses
 *   - no partial lines
 */
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
const exec = promisify(require('child_process').execFile);
function require1(p){ return require('fs').readFileSync(p,'utf8'); }
