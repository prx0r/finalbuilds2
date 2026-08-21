import { InMemoryGraphStore } from './inmemory.js';
import { HydraHttpGraphStore } from './hydradb-http.js';

export function createGraphStore(env = process.env) {
  const backend = (env.GRAPH_BACKEND ?? 'memory').toLowerCase();
  if (backend === 'memory') return new InMemoryGraphStore();
  if (backend === 'hydra' || backend === 'hydradb') {
    return new HydraHttpGraphStore({
      baseUrl: env.HYDRA_URL ?? 'http://127.0.0.1:8443',
      token: env.HYDRA_TOKEN,
      graphId: env.HYDRA_GRAPH_ID ?? 'finalbuilds',
      namespace: env.HYDRA_NAMESPACE ?? 'default',
      cellId: env.HYDRA_CELL_ID ?? 'cell-0'
    });
  }
  throw new Error(`Unknown GRAPH_BACKEND=${backend}`);
}
