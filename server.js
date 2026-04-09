const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// iTunes proxy
app.get('/itunes-proxy', async (req, res) => {
  try {
    const { id } = req.query;
    const r = await fetch('https://itunes.apple.com/lookup?id=' + id, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const j = await r.json();
    res.json(j);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Fetch proxy (bypasses CORS)
app.get('/fetch-proxy', async (req, res) => {
  try {
    const { url } = req.query;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
      redirect: 'follow'
    });
    const text = await r.text();
    res.json({ contents: text, status: r.status });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Lusha proxy
app.get('/lusha-proxy', async (req, res) => {
  try {
    const { path, api_key, ...params } = req.query;
    const qs = new URLSearchParams({ ...params, api_key }).toString();
    const r = await fetch('https://api.lusha.com' + path + '?' + qs, {
      headers: { 'api_key': api_key, 'Accept': 'application/json' }
    });
    const j = await r.json();
    res.json(j);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Anthropic proxy
app.post('/anthropic-proxy', async (req, res) => {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify(req.body)
    });
    const j = await r.json();
    res.status(r.status).json(j);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// LinkedIn name proxy
app.get('/li-name-proxy', async (req, res) => {
  try {
    const { url } = req.query;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' }
    });
    const text = await r.text();
    const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : '';
    const namePart = title.split('|')[0].split('-')[0].trim();
    const parts = namePart.split(' ').filter(p => p && p.toLowerCase() !== 'linkedin');
    res.json({ firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '', fullName: namePart });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port', PORT));
