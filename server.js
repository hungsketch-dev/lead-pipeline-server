const express = require('express');
const app = express();
app.use(express.json());

// CORS — allow requests from any origin (the dashboard is a local HTML file)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const GHL_KEY = process.env.GHL_API_KEY;
const GHL_LOC = process.env.GHL_LOCATION_ID;

// ── Lusha proxy ─────────────────────────────────────────────────────────────
// Browsers can't call Lusha directly (CORS). This endpoint proxies the call.
app.post('/lusha-proxy', async (req, res) => {
  const { url, api_key } = req.body;
  if (!url || !api_key) return res.status(400).json({ error: 'Missing url or api_key' });
  try {
    const r = await fetch(url, {
      headers: { 'api_key': api_key, 'Content-Type': 'application/json' }
    });
    const json = await r.json();
    res.status(r.status).json(json);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GHL helpers ─────────────────────────────────────────────────────────────
const GENERIC = new Set(['info','hello','contact','support','marketing','growth',
  'inquiries','partnerships','press','sales','admin','help','feedback','noreply',
  'no-reply','business','careers','hr','legal','privacy','security']);

function classify(email) {
  const prefix = (email||'').toLowerCase().split('@')[0];
  const domain = (email||'').toLowerCase().split('@')[1]||'';
  if (GENERIC.has(prefix)) return { type:'company', companyName:domain, tags:['company-inbox'] };
  const parts = prefix.split(/[.\-_]/);
  return { type:'person',
    firstName: parts[0]?parts[0][0].toUpperCase()+parts[0].slice(1):'',
    lastName:  parts[1]?parts[1][0].toUpperCase()+parts[1].slice(1):'',
    tags: ['person'] };
}

async function ghlUpsert(data) {
  const payload = { ...data, locationId: GHL_LOC };
  const noteLines = [];
  if (payload.title)   { noteLines.push('Position: '+payload.title);   delete payload.title; }
  if (payload.company) { noteLines.push('Company: '+payload.company);  delete payload.company; }
  if (payload.dept)    { noteLines.push('Dept: '+payload.dept);        delete payload.dept; }
  const note = noteLines.join('\n');
  const res = await fetch('https://services.leadconnectorhq.com/contacts/', {
    method: 'POST',
    headers: { Authorization:'Bearer '+GHL_KEY, 'Content-Type':'application/json', Version:'2021-07-28' },
    body: JSON.stringify(payload)
  });
  const j = await res.json();
  const id = j.contact?.id || j.id;
  if (id && note) {
    fetch('https://services.leadconnectorhq.com/contacts/'+id+'/notes', {
      method: 'POST',
      headers: { Authorization:'Bearer '+GHL_KEY, 'Content-Type':'application/json', Version:'2021-07-28' },
      body: JSON.stringify({ body: note })
    }).catch(()=>{});
  }
  return j;
}

// ── LinkedIn webhook ─────────────────────────────────────────────────────────
app.post('/webhook/linkedin-ghl', async (req, res) => {
  try {
    const e = req.body;
    const cl = classify(e.lead?.email||'');
    const payload = {
      firstName:   e.lead?.firstName || cl.firstName || '',
      lastName:    e.lead?.lastName  || cl.lastName  || '',
      email:       e.lead?.email     || '',
      companyName: e.lead?.company   || cl.companyName || '',
      title:       e.lead?.title     || '',
      tags: [...(cl.tags||[])],
    };
    if (e.type === 'connection_accepted')    payload.tags.push('li-connected');
    if (e.type === 'reply_received')         payload.tags.push('li-replied');
    if (e.type === 'message_sent')           payload.tags.push('li-messaged');
    if (e.type === 'sequence_ended_no_reply') payload.tags.push('no-reply');
    await ghlUpsert(payload);
    res.json({ ok: true });
  } catch(e) {
    console.error('Webhook error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));
app.listen(process.env.PORT || 3000, () => console.log('Server running on port', process.env.PORT || 3000));
