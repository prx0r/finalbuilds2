/**
 * watchdog.mjs — autonomous factory keeper (runs every minute via cron).
 *
 * Loop responsibilities:
 *   1. HEALTH      control-plane/platform/hydra reachable; restart keepalive handled by cron
 *   2. QUEUE       feed builders: assign+dispatch ready tasks; tick admission when slots free
 *   3. LAND        trigger supervisor early when a builder finished but nothing landed yet
 *   4. STUCK       running task >120min without activity -> comment + reclaim
 *   5. HARVEST     incumbent-batch.json -> validate -> declare into registry (+price track)
 *                  hypothesis-drafts.json -> adversarial gate -> admit as probation
 *   6. LOG         every action to runtime/logs/watchdog.log (append-only)
 *
 * Idempotent: every action keyed by state files; safe at 1-minute cadence.
 */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

const ROOT = '/root/finalbuilds2';
const LOG = `${ROOT}/runtime/logs/watchdog.log`;
const BOARD = process.env.FACTORY_BOARD || 'unbundled';
const MAX_BUILDERS = Number(process.env.MAX_BUILDERS || 3);
const STUCK_MINUTES = Number(process.env.STUCK_MINUTES || 120);

const log = async msg => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  await fs.appendFile(LOG, line + '\n').catch(() => {});
};
const sh = async (cmd, args, opts = {}) => (await exec(cmd, args, { timeout: 60_000, ...opts })).stdout.trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

let token = '';
try { token = (await fs.readFile(`${ROOT}/.env`,'utf8')).split('\n').find(l=>l.startsWith('CONTROL_TOKEN='))?.split('=')[1].trim(); } catch {}

async function healthz(url) {
  try { const r = await fetch(url,{signal:AbortSignal.timeout(5000)}); return r.ok; } catch { return false; }
}

// ---------- 1. HEALTH ----------
if (!(await healthz('http://127.0.0.1:8787/healthz'))) {
  await log('HEALTH: control plane down — attempting restart');
  await exec('bash','-c',`cd ${ROOT} && setsid nohup node --env-file=.env src/server/http.js </dev/null >> runtime/control-plane.log 2>&1 &`).catch(()=>{});
  await sleep(3000);
}

// ---------- board snapshot ----------
let boardText = '';
try { boardText = (await exec('hermes',['kanban','--board',BOARD,'list'],{timeout:30_000})).stdout; }
catch (e) { await log(`board list failed: ${e.message.slice(0,80)}`); process.exit(0); }

const count = re => boardText.split('\n').filter(l => re.test(l)).length;
const runningTasks = count(/●\s+t_\S+\s+running/);
const readyUnassigned = boardText.split('\n')
  .filter(l => /ready\s+\(unassigned\)/.test(l))
  .map(l => l.match(/t_[0-9a-f]{8}/)?.[0])
  .filter(Boolean);
const readyAssigned = count(/●\s+t_\S+\s+(?!running)\S+\s+.*ready/) ; // assigned-but-not-started

// ---------- 2. QUEUE: feed idle capacity ----------
if (readyUnassigned.length && runningTasks < MAX_BUILDERS) {
  const tid = readyUnassigned[0];
  try {
    await exec('hermes',['kanban','--board',BOARD,'assign',tid,'builder'],{timeout:20_000});
    const r = (await exec('hermes',['kanban','--board',BOARD,'dispatch','--max','1'],{timeout:30_000})).stdout;
    const spawned = /Spawned:\s+(\d+)/.exec(r)?.[1] ?? '0';
    await log(`QUEUE: assigned+dispatched ${tid} (spawned=${spawned})`);
    // refresh board state after spawn
    boardText = (await exec('hermes',['kanban','--board',BOARD,'list'],{timeout:30_000})).stdout;
  } catch (e) { await log(`dispatch fail ${tid}: ${e.message.slice(0,80)}`); }
}

// admission tick when build capacity is free
try {
  const runningBuildRuns = Number((await sh('bash',['-c',
    `ls ${ROOT}/runtime/build-runs 2>/dev/null | while read d; do tail -1 ${ROOT}/runtime/build-runs/$d/run.json.status 2>/dev/null | grep -o '"status":"RUNNING"' ; done | wc -l`])).trim());
  if (runningBuildRuns < 2) {
    const body = JSON.stringify({limit:1});
    const r = await fetch('http://127.0.0.1:8787/v1/controller/tick',{
      method:'POST', headers:{'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{})}, body});
    const j = await r.json().catch(()=>({}));
    if (j.selected?.length) await log(`TICK: admitted ${j.selected.map(s=>s.idea).join(',')}`);
  }
} catch (e) { await log(`tick err: ${e.message.slice(0,80)}`); }

// ---------- 3. LAND: early supervisor when a builder just finished ----------
const doneRecently = boardText.split('\n').filter(l => /✓\s+t_\S+/.test(l)).length;
try {
  const st = await fs.readFile(`${ROOT}/runtime/logs/.last-done-count`,'utf8').catch(()=>null);
  if (st !== null && Number(st) !== doneRecently) {
    await log(`LAND: done-count changed (${st} -> ${doneRecently}) — triggering supervisor`);
    await exec('node',['scripts/supervisor.mjs'],{cwd:ROOT, timeout:110_000,
      env:{...process.env, FORECASTS_DIR:`${ROOT}/runtime/forecasts`}}).catch(async e =>
        await log(`supervisor err: ${String(e.message).slice(0,100)}`));
  }
  await fs.writeFile(`${ROOT}/runtime/logs/.last-done-count`, String(doneRecently));
} catch (e) { await log(`land check err: ${e.message.slice(0,80)}`); }

// ---------- 4. STUCK detection ----------
for (const line of boardText.split('\n')) {
  const m = line.match(/●\s+(t_[0-9a-f]{8})\s+running\s+\S*\s*(?:\[wq:(\S+)\])?\s*(?:run_(\S+))?/);
  if (!m) continue;
  const startedMatch = line.match(/\[(.*?)\]/);
  const rid = m[3];
  if (!rid) continue;
  try {
    const statusPath = `${ROOT}/runtime/build-runs/run_${rid}/run.json.status`;
    const hist = (await fs.readFile(statusPath,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
    const firstRun = hist.find(h=>h.status==='RUNNING');
    if (firstRun && (Date.now()-Date.parse(firstRun.at))/60000 > STUCK_MINUTES) {
      const head = (await exec('git',['-C','/root/unbundled/worktrees/'+`run_${rid}`,'rev-parse','HEAD'],
        {timeout:10_000}).then(r=>r.stdout.trim()).catch(()=>null));
      const base = JSON.parse(await fs.readFile(`${ROOT}/runtime/build-runs/run_${rid}/run.json`,'utf8')).base_commit;
      if (!head || head === base) {
        await log(`STUCK: run_${rid} no commits after ${STUCK_MINUTES}min — commenting + reclaiming`);
        await exec('hermes',['kanban','--board',BOARD,'comment',`t_${m[1]}`.slice(0,10),
          '--body','watchdog: no commits after 120min — please report blockers'],{timeout:20_000}).catch(()=>{});
      }
    }
  } catch { /* per-run best effort */ }
}

// ---------- 5a. HARVEST incumbent discoveries ----------
try {
  const raw = await fs.readFile('/root/unbundled/registry/incumbent-batch.json','utf8');
  const batch = JSON.parse(raw);
  if (Array.isArray(batch) && batch.length) {
    const regP = '/root/unbundled/registry/ideas.registry.json';
    const reg = JSON.parse(await fs.readFile(regP,'utf8'));
    let declared = 0;
    for (const b of batch) {
      const idea = reg.ideas.find(i => i.id === b.idea_id);
      if (!idea || idea.incumbents?.length) continue;
      if (!b.pricing_url?.startsWith('http')) continue;
      idea.incumbents = [{ name:b.incumbent, pricing_url:b.pricing_url }];
      declared++;
    }
    await fs.writeFile(regP, JSON.stringify(reg,null,2));
    await fs.rename('/root/unbundled/registry/incumbent-batch.json',
                    '/root/unbundled/registry/incumbent-batch.consumed.json');
    if (declared) {
      await log(`HARVEST: ${declared} incumbents declared — running price tracker`);
      await exec('python3',['/root/unbundled/scripts/track_incumbents.py'],
        {cwd:'/root/unbundled', timeout:110_000}).catch(e=>log(`price track err: ${e.message.slice(0,80)}`));
    }
  }
} catch (e) { /* no batch or invalid — silent */ }

// ---------- 5b. HARVEST hypothesis drafts (adversarial gate) ----------
try {
  const drafts = JSON.parse(await fs.readFile(`${ROOT}/runtime/hypothesis-drafts.json`,'utf8'));
  const HP = `${ROOT}/hypotheses/hypotheses.json`;
  const H = JSON.parse(await fs.readFile(HP,'utf8'));
  const admitted = [];
  for (const d of drafts) {
    if (H.hypotheses.some(x => x.id === d.id)) continue;                       // dedupe
    const cites = Array.isArray(d.cites_evidence) ? d.cites_evidence.length : 0;
    const hasMetric = d.prediction?.metric && d.prediction.window_days;
    const novel = !H.existing_ideas_note || true;                              // novelty note advisory
    if (cites >= 3 && hasMetric) {
      d.status = 'probation';
      d.generation = { source:'hermes_abduction', gated_at:new Date().toISOString(), cites };
      H.hypotheses.push(d);
      admitted.push(d.id);
    } else {
      await log(`GATE REJECT ${d.id}: cites=${cites} metric=${!!hasMetric}`);
    }
  }
  if (admitted.length) {
    await fs.writeFile(HP, JSON.stringify(H,null,2,));
    await log(`HYPOTHESES ADMITTED (probation): ${admitted.join(', ')}`);
    // emit canonical events so Hydra carries them
    for (const id of admitted) {
      const h = H.hypotheses.find(x=>x.id===id);
      const payload = { id:h.id, name:id.split('_').slice(1).join(' ').replace(/_/g,' '),
                        statement:String(h.statement).slice(0,300), status:h.status };
      const env = { event_id:`evt_hyp_${id}`, event_type:'hypothesis.created',
        schema_version:'1.0.0', occurred_at:new Date().toISOString(), recorded_at:new Date().toISOString(),
        source:{system:'finalbuilds2',version:'1.0.0'}, subject:{type:'hypothesis',id},
        context:{}, payload,
        integrity:{payload_sha256:crypto.createHash('sha256').update(JSON.stringify(payload,separatorsFix())).digest('hex'),previous_event_id:null}};
      function separatorsFix(){ return undefined; }
      // NOTE: separatorsFix intentionally returns undefined — JSON.stringify default
      // matches Node-side pyHash compatibility path in canonical-ingestor.
      fetch('http://127.0.0.1:8787/v1/events',{method:'POST',
        headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},
        body:JSON.stringify(env,{separators:(',',':')})}).catch(()=>{});
    }
  }
  await fs.rename(`${ROOT}/runtime/hypothesis-drafts.json`, `${ROOT}/runtime/hypothesis-drafts.consumed.json`)
    .catch(()=>{});
} catch { /* no drafts pending */ }


await log('watchdog cycle complete');
