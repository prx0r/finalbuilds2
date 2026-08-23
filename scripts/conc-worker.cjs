// conc-worker.cjs <file> <worker-id> <count> [die-after-index]
(async () => {
  const fs = require('fs');
  const file = process.argv[2], wid = process.argv[3], count = +process.argv[4];
  const dieAfter = process.argv[5] ? +process.argv[5] : Infinity;
  const mod = await import('/root/finalbuilds2/src/event/jsonl-store.js');
  const store = new mod.JsonlEventStore(file);
  const acks = [];
  for (let i = 1; i <= count; i++) {
    await store.append('observation.recorded', { wid, i });
    fs.appendFileSync(file + '.acks', `${wid}:${i}\n`);
    if (i === dieAfter) process.kill(process.pid, 'SIGKILL');
  }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
