import test from 'node:test';
import assert from 'node:assert/strict';
import { HydraHttpGraphStore } from '../src/graph/hydradb-http.js';

 test('Hydra HTTP adapter emits documented request boundary', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    const query = JSON.parse(init.body).query;
    if (query.includes('RETURN e.string_id AS id')) {
      return new Response(JSON.stringify({ rows: [{ id: 'x', type: 'Site', name: 'X', data_json: '{"domain":"x.test"}' }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  };
  const g = new HydraHttpGraphStore({ baseUrl: 'http://hydra:8443/', token: 'secret', graphId: 'finalbuilds', namespace: 'tenant', cellId: 'cell-0', fetchImpl: fakeFetch });
  await g.upsertEntity({ id: 'x', type: 'Site', name: 'X', data: { domain: 'x.test' } });
  assert.equal(calls[0].url, 'http://hydra:8443/v1/graphs/finalbuilds/query');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer secret');
  assert.equal(calls[0].init.headers['X-Graph-Namespace'], 'tenant');
  assert.equal(JSON.parse(calls[0].init.body).cell_id, 'cell-0');
  const entity = await g.getEntity('x');
  assert.equal(entity.data.domain, 'x.test');
});

 test('Hydra adapter escapes string values in generated Cypher', async () => {
  let query = '';
  const fakeFetch = async (_url, init) => { query = JSON.parse(init.body).query; return new Response(JSON.stringify({ rows: [] }), { status: 200 }); };
  const g = new HydraHttpGraphStore({ baseUrl: 'http://h', token: 't', fetchImpl: fakeFetch });
  await g.upsertEntity({ id: "x' MATCH (n) DETACH DELETE n //", type: 'Site', name: "O'Reilly", data: {} });
  assert.match(query, /x\\' MATCH/);
  assert.match(query, /O\\'Reilly/);
});
