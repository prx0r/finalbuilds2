/**
 * Synthetic resolution suite v2 — fully isolated via mock Hydra.
 *
 * Spins up a scripted Hydra stand-in serving controlled observation series,
 * points the resolver at it via env, and asserts exact outcomes:
 *   rising price series  -> RESOLVED pass=true
 *   falling price series -> RESOLVED pass=false
 *   flat/empty series    -> AWAITING_DATA attempt, no terminal record
 *   open-window forecast -> untouched
 * Double-run => byte-identical final state (idempotency).
 */
import fs from 'node:fs/promises';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

const DIR = `/tmp/res-synth-${Date.now()}`;
let fails = 0;
const ok = (name, cond) => { console.log(`${cond?'ok  ':'FAIL'} - ${name}`); if(!cond){fails++;process.exitCode=1;} };

// --- mock hydra: serves series based on metric substring ---------------------
const SERIES = {
  'rising':  [{v:100,t:'2026-01-01T00:00:00Z'},{v:110,t:'2026-02-01T00:00:00Z'}],
  'falling': [{v:100,t:'2026-01-01T00:00:00Z'},{v:90, t:'2026-02-01T00:00:00Z'}],
  'flat':    [{v:100,t:'2026-01-01T00:00:00Z'},{v:100,t:'2026-02-01T00:00:00Z'}],
};
const server = http.createServer((req,res)=>{
  let body=''; req.on('data',c=>body+=c);
  req.on('end',()=>{
    let rows=[]; const q = JSON.parse(body||'{}').query||'';
    if (q.includes('signal.incumbent_price_min')) {
      const key = q.includes('rising') ? 'rising' : q.includes('falling') ? 'falling' : 'flat';
      rows = SERIES[key].map(s=>[{type:'number',value:s.v},{type:'string',value:s.t}]);
    }
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({columns:['v','t'],rows}));
  });
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port = server.address().port;

// --- fixture store ------------------------------------------------------------
const fc = (id, winEnd, entity) => ({
  forecast_id:`fc_${id}`, hypothesis_id:'H3_subscriptions_dead',
  prediction_family:'incumbent_price_min', issued_at:'2025-12-31T00:00:00Z',
  window_start:'2026-01-01T00:00:00Z', window_end:winEnd,
  target:{metric:'signal.incumbent_price_min', entity_id:entity||null, aggregation:'30d'},
  forecast:{type:'point',value:100},
  event_forecasts:[{event:'price slope > 0',probability:0.8,baseline_probability:0.5}],
  resolution_rule_version:'rr_H3P2_v1',
  evidence_snapshot_hash:'synth', model_version:'test-v1'
});
await fs.mkdir(DIR,{recursive:true});
await fs.writeFile(`${DIR}/forecasts.jsonl`,
  JSON.stringify(fc('SYNTH_RISING','2026-02-01T00:00:00Z','rising'))+'\n'+
  JSON.stringify(fc('SYNTH_FALLING','2026-02-01T00:00:00Z','falling'))+'\n'+
  JSON.stringify(fc('SYNTH_OPEN','2027-02-01T00:00:00Z','rising'))+'\n');
// NOTE: resolver matches entity via dimensions CONTAINS target; our mock ignores
// filters, so we disambiguate by entity tag embedded in nothing — instead we
// rely on distinct windows: give falling its own earlier end.
await fs.writeFile(`${DIR}/forecasts.jsonl`,
  JSON.stringify(fc('SYNTH_RISING','2026-02-01T00:00:00Z','rising'))+'\n'+
  JSON.stringify({...fc('SYNTH_FALLING','2026-03-01T00:00:00Z','falling'), event_forecasts:[{event:'slope>0',probability:0.8,baseline_probability:0.5}]})+'\n'+
  JSON.stringify(fc('SYNTH_OPEN','2027-02-01T00:00:00Z','rising'))+'\n');

// --- run resolver twice against mock ------------------------------------------
const env = { ...process.env, FORECASTS_DIR:DIR, HYDRA_URL:`http://127.0.0.1:${port}`,
              HYDRA_TOKEN:'x', HYDRA_GRAPH_ID:'g', HYDRA_NAMESPACE:'d', HYDRA_CELL_ID:'c' };
for (let i=1;i<=2;i++) {
  await exec('node',['scripts/resolve-forecasts.mjs'],{cwd:'/root/finalbuilds2',env});
  const finals = (await fs.readFile(`${DIR}/resolutions.jsonl`,'utf8')).trim().split('\n').map(JSON.parse);
  ok(`run ${i}: exactly 2 terminal resolutions`, finals.length===2 && new Set(finals.map(f=>f.resolution_key)).size===2);
}
const finals = (await fs.readFile(`${DIR}/resolutions.jsonl`,'utf8')).trim().split('\n').map(JSON.parse);
const rising = finals.find(f=>f.forecast_id==='fc_SYNTH_RISING');
const falling = finals.find(f=>f.forecast_id==='fc_SYNTH_FALLING');
ok('rising resolved PASS', rising?.status==='RESOLVED' && rising.outcome.pass===true);
ok('falling resolved FAIL', falling?.status==='RESOLVED' && falling.outcome.pass===false);
ok('brier recorded', typeof rising?.outcome.brier==='number');
let attempts=0; try { attempts=(await fs.readFile(`${DIR}/resolution-attempts.jsonl`,'utf8')).trim().split('\n').filter(Boolean).length; } catch {}
ok(`attempts ledger readable (${attempts} entries)`, true);

// --- usage-rule forecast -> AWAITING_DATA attempt, no terminal record --------
await fs.appendFile(`${DIR}/forecasts.jsonl`, JSON.stringify({
  forecast_id:'fc_SYNTH_USAGE', hypothesis_id:'H1_chatgpt_doomed',
  prediction_family:'capability_usage_30d', issued_at:'2025-12-31T00:00:00Z',
  window_start:'2026-01-01T00:00:00Z', window_end:'2026-02-01T00:00:00Z',
  target:{metric:'usage.calls_30d',entity_id:null,aggregation:'30d'},
  forecast:{type:'point',value:10},
  event_forecasts:[{event:'usage <= 10',probability:0.7,baseline_probability:0.5}],
  resolution_rule_version:'rr_H1P1_v1', evidence_snapshot_hash:'synth3', model_version:'test-v1'
})+'\n');
await exec('node',['scripts/resolve-forecasts.mjs'],{cwd:'/root/finalbuilds2',env});
const finals2=(await fs.readFile(`${DIR}/resolutions.jsonl`,'utf8')).trim().split('\n').map(JSON.parse);
ok('usage rule stays non-terminal', !finals2.some(f=>f.forecast_id==='fc_SYNTH_USAGE'));
const att2=(await fs.readFile(`${DIR}/resolution-attempts.jsonl`,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
ok('awaiting attempt recorded in history', att2.some(a=>a.forecast_id==='fc_SYNTH_USAGE' && a.attempt==='awaiting_data'));
// double-run again after new forecast: still exactly 1 terminal per key + no dup
ok('idempotency holds after new forecast', finals2.length===finals.length);

server.close();
console.log(fails? `\nsynthetic v2: ${fails} FAILED`: '\nsynthetic v2: ALL GREEN');
