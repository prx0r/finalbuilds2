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

export function entityMergeQuery(entity) {
  const id = cypherString(entity.id);
  const type = cypherString(entity.type);
  const name = cypherString(entity.name ?? '');
  const data = cypherJson(entity.data ?? {});
  return `MERGE (e:Entity {id: ${id}}) SET e.type = ${type}, e.name = ${name}, e.data_json = ${data} RETURN e.id AS id`;
}

export function edgeMergeQuery(fromId, kind, toId, props = {}) {
  return `MATCH (a:Entity {id: ${cypherString(fromId)}}), (b:Entity {id: ${cypherString(toId)}}) MERGE (a)-[r:REL {kind: ${cypherString(kind)}}]->(b) SET r.props_json = ${cypherJson(props)} RETURN a.id AS from_id, r.kind AS kind, b.id AS to_id`;
}
