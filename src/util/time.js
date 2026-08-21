export function nowIso(clock = () => new Date()) {
  return clock().toISOString();
}
