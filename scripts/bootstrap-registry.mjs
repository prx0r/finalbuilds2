#!/usr/bin/env node
/**
 * bootstrap-registry — materialize registry/sites + standards/* into the
 * control-plane graph (Hydra when GRAPH_BACKEND=hydra). Idempotent-ish:
 * upserts entities, desires CONFORMS_TO links. Run after adding sites or
 * standard versions. Server should be running for shared state.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ControlPlane } from '../src/controller/control-plane.js';
import { bootstrapRegistry } from '../src/registry/bootstrap.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* optional */ }

const cp = ControlPlane.fromEnv();
const result = await bootstrapRegistry(cp, { root: ROOT });
console.log(JSON.stringify(result));
