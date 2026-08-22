import crypto from 'node:crypto';

export function cypherString(value) {
  return `'${String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')}'`;
}

export function cypherJson(value) {
  return cypherString(JSON.stringify(value ?? {}));
}

/** Stable positive 48-bit integer from a string id (Hydra reserves `id` for ints). */
export function stringToId(s) {
  return crypto.createHash('sha256').update(String(s)).digest().readUIntBE(0, 6);
}

/**
 * HydraDB v0.x proven write patterns (no MERGE, no standalone CREATE,
 * no edges between two pre-existing nodes, `id` must be an integer):
 * - new entity  -> CREATE via _GENESIS anchor edge, int id + string_id
 * - update      -> MATCH SET
 * - "edge"      -> an Entity node of type 'Edge' carrying from/kind/to in data
 * Lineage is queried by properties, which is the correct model given the
 * engine's current write constraints.
 */
export function entityCreateQuery(entity) {
  const pairs = [
    `id: ${stringToId(entity.id)}`,
    `string_id: ${cypherString(entity.id)}`,
    `type: ${cypherString(entity.type)}`,
    `name: ${cypherString(entity.name ?? '')}`,
    `data_json: ${cypherJson(entity.data ?? {})}`,
  ].join(', ');
  return `CREATE (e:Entity {${pairs}})-[:_GENESIS]->(:_ANCHOR {id: 0})`;
}

export function entitySetQuery(entity) {
  const sets = [
    `e.type = ${cypherString(entity.type)}`,
    `e.name = ${cypherString(entity.name ?? '')}`,
    `e.data_json = ${cypherJson(entity.data ?? {})}`,
  ].join(', ');
  return `MATCH (e:Entity {id: ${stringToId(entity.id)}}) SET ${sets}`;
}
