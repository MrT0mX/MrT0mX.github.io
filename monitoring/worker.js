const now = () => new Date().toISOString();
const json = (value, status = 200, origin = '') => new Response(JSON.stringify(value), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...(origin?{'access-control-allow-origin':origin,'vary':'Origin'}:{})}});
const allowedStates = new Set(['live','offline','degraded','unknown']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/status.json' && request.method === 'OPTIONS') return new Response(null,{status:204,headers:{'access-control-allow-origin':env.SITE_ORIGIN||'','access-control-allow-methods':'GET, OPTIONS','access-control-allow-headers':'content-type','access-control-max-age':'86400','vary':'Origin'}});
    if (url.pathname === '/api/status.json' && request.method === 'GET') return json(await publicStatus(env.DB),200,env.SITE_ORIGIN||'');
    if (url.pathname.startsWith('/heartbeat/') && request.method === 'POST') return acceptHeartbeat(request, env, url.pathname.slice('/heartbeat/'.length));
    if (url.pathname === '/healthz' && request.method === 'GET') return json({ok:true, service:'mtxproject-monitor', checkedAt:now()});
    return new Response('Not found', {status:404});
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runChecks(env));
  }
};

async function publicStatus(db) {
  const services = await db.prepare(`SELECT s.id,s.name,s.kind,c.state,c.checked_at,c.latency_ms
    FROM services s LEFT JOIN checks c ON c.id=(SELECT id FROM checks WHERE service_id=s.id ORDER BY checked_at DESC LIMIT 1)
    WHERE s.enabled=1 ORDER BY s.name`).all();
  const out = {};
  let latest = null;
  for (const row of services.results || []) {
    const checked = row.checked_at && Date.parse(row.checked_at);
    const fresh = checked && Date.now()-checked <= 10*60*1000;
    const state = allowedStates.has(row.state) && fresh ? row.state : 'unknown';
    out[row.name] = {state, checkedAt:fresh?row.checked_at:null, latencyMs:fresh?row.latency_ms:null};
    if (fresh && (!latest || checked > Date.parse(latest))) latest = row.checked_at;
  }
  return {updatedAt:latest, services:out};
}

async function acceptHeartbeat(request, env, serviceId) {
  const service = await env.DB.prepare('SELECT id FROM services WHERE id=? AND kind=? AND enabled=1').bind(serviceId,'heartbeat').first();
  if (!service) return json({error:'Unknown heartbeat service'},404);
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  const expected = env[`HEARTBEAT_TOKEN_${serviceId.toUpperCase().replaceAll('-','_')}`];
  if (!expected || !token || !constantTimeEqual(token,expected)) return json({error:'Unauthorized'},401);
  const timestamp = now();
  await env.DB.prepare('UPDATE services SET heartbeat_at=? WHERE id=?').bind(timestamp,serviceId).run();
  return json({ok:true,receivedAt:timestamp});
}

function constantTimeEqual(a,b) {
  if (a.length !== b.length) return false;
  let diff=0;
  for(let i=0;i<a.length;i++) diff |= a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}

async function runChecks(env) {
  const rows = await env.DB.prepare('SELECT * FROM services WHERE enabled=1').all();
  for (const service of rows.results || []) {
    const result = service.kind === 'heartbeat' ? await heartbeatCheck(env.DB,service) : await httpCheck(service,env);
    await recordResult(env,service,result);
  }
  await env.DB.prepare("DELETE FROM checks WHERE checked_at < datetime('now','-90 days')").run();
}

async function heartbeatCheck(db,service) {
  const row = await db.prepare('SELECT heartbeat_at FROM services WHERE id=?').bind(service.id).first();
  const at = row?.heartbeat_at;
  if (!at) return {state:'unknown',detail:'No heartbeat received yet'};
  const age = Date.now()-Date.parse(at);
  return age <= service.expected_interval_seconds*2000 ? {state:'live',detail:'Recent authenticated heartbeat'} : {state:'offline',detail:'Heartbeat is overdue'};
}

async function httpCheck(service,env) {
  const target = service.id==='better-api' ? env.BETTER_API_HEALTH_URL : service.id==='mtxallapi' ? env.MTXALLAPI_HEALTH_URL : env.SITE_URL;
  if (!target) return {state:'unknown',detail:'Health URL is not configured'};
  const started=Date.now();
  try {
    const response=await fetch(target,{signal:AbortSignal.timeout(8000),headers:{'user-agent':'MTXProject-Monitor/1.0'}});
    const latency=Date.now()-started;
    if (!response.ok) return {state:'offline',latency,detail:`HTTP ${response.status}`};
    if (service.id==='better-api' || service.id==='mtxallapi') {
      const body=await response.json().catch(()=>null);
      if (!body || body.status!=='ok' || body.database!=='connected') return {state:'degraded',latency,detail:'Health endpoint did not confirm database readiness'};
    }
    return {state:'live',latency,detail:'Health check passed'};
  } catch (error) {
    return {state:'offline',latency:Date.now()-started,detail:error?.name==='TimeoutError'?'Health check timed out':'Health check failed'};
  }
}

async function recordResult(env,service,result) {
  const checkedAt=now();
  await env.DB.prepare('INSERT INTO checks(service_id,state,checked_at,latency_ms,detail) VALUES(?,?,?,?,?)').bind(service.id,result.state,checkedAt,result.latency??null,result.detail??null).run();
  const latest = await env.DB.prepare('SELECT state FROM checks WHERE service_id=? ORDER BY checked_at DESC LIMIT 2').bind(service.id).all();
  const recent = latest.results || [];
  if (recent.length < 2) return;
  if (recent[0].state === recent[1].state && ['offline','degraded'].includes(result.state)) await openIncident(env,service,checkedAt,result);
  if (recent[0].state === 'live' && recent[1].state === 'live') await resolveIncident(env,service,checkedAt);
}

async function openIncident(env,service,at,result) {
  const incident=await env.DB.prepare("SELECT id FROM incidents WHERE service_id=? AND state='open'").bind(service.id).first();
  if (incident) return;
  const added=await env.DB.prepare("INSERT INTO incidents(service_id,state,opened_at,last_notified_at) VALUES(?,'open',?,?)").bind(service.id,at,at).run();
  await notify(env,`${service.name} is ${result.state.toUpperCase()}. ${result.detail||''}`);
  if (added.meta?.last_row_id) await env.DB.prepare('UPDATE incidents SET last_notified_at=? WHERE id=?').bind(at,added.meta.last_row_id).run();
}

async function resolveIncident(env,service,at) {
  const incident=await env.DB.prepare("SELECT id FROM incidents WHERE service_id=? AND state='open'").bind(service.id).first();
  if (!incident) return;
  await env.DB.prepare("UPDATE incidents SET state='resolved',resolved_at=? WHERE id=?").bind(at,incident.id).run();
  await notify(env,`${service.name} has recovered. Verified healthy at ${at}.`);
}

async function notify(env,message) {
  const tasks=[];
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) tasks.push(fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:`MTXProject monitor: ${message}`})}));
  if (env.RESEND_API_KEY && env.ALERT_EMAIL && env.ALERT_FROM) tasks.push(fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from:env.ALERT_FROM,to:[env.ALERT_EMAIL],subject:'MTXProject service alert',text:message})}));
  if (tasks.length) await Promise.allSettled(tasks);
}
