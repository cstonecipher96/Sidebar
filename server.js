// Life Votes: friends post decisions about their lives, everyone votes live.
// Zero dependencies. Run: node server.js  (PORT env var optional)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const INDEX = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));

// rooms: { [code]: { polls: [{ id, author, question, options: [{ text, voters: [] }], created }] } }
let rooms = {};
try { rooms = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch {}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(DATA_FILE, JSON.stringify(rooms), () => {}), 200);
}

const clients = {}; // room code -> Set of SSE responses

function room(code) {
  return (rooms[code] ||= { polls: [] });
}

function broadcast(code) {
  const payload = `data: ${JSON.stringify(room(code))}\n\n`;
  for (const res of clients[code] || []) res.write(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 1e5) req.destroy();
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(e); }
    });
  });
}

const clean = (s, max) => String(s || '').trim().slice(0, max);

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const parts = url.pathname.split('/').filter(Boolean);

  // GET /api/:room/stream  -> live updates via Server-Sent Events
  if (parts[0] === 'api' && parts[2] === 'stream' && req.method === 'GET') {
    const code = clean(parts[1], 40).toLowerCase();
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    (clients[code] ||= new Set()).add(res);
    res.write(`data: ${JSON.stringify(room(code))}\n\n`);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(ping);
      clients[code].delete(res);
    });
    return;
  }

  if (parts[0] === 'api' && req.method === 'POST') {
    const code = clean(parts[1], 40).toLowerCase();
    let body;
    try { body = await readBody(req); } catch { return send(res, 400, { error: 'bad json' }); }
    const r = room(code);
    const name = clean(body.name, 30);
    if (!name) return send(res, 400, { error: 'name required' });

    // POST /api/:room/polls  { name, question, options[] }
    if (parts[2] === 'polls' && !parts[3]) {
      const question = clean(body.question, 200);
      const options = (Array.isArray(body.options) ? body.options : [])
        .map((o) => clean(o, 80)).filter(Boolean).slice(0, 6);
      if (!question || options.length < 2) return send(res, 400, { error: 'question + 2 options required' });
      r.polls.unshift({
        id: crypto.randomUUID(),
        author: name,
        question,
        options: options.map((text) => ({ text, voters: [] })),
        created: Date.now(),
      });
    }
    // POST /api/:room/polls/:id/vote  { name, option }  (one vote per name; re-voting switches)
    else if (parts[2] === 'polls' && parts[4] === 'vote') {
      const poll = r.polls.find((p) => p.id === parts[3]);
      const idx = Number(body.option);
      if (!poll || !poll.options[idx]) return send(res, 404, { error: 'not found' });
      const already = poll.options[idx].voters.includes(name);
      for (const o of poll.options) o.voters = o.voters.filter((v) => v !== name);
      if (!already) poll.options[idx].voters.push(name); // clicking your vote again un-votes
    }
    // POST /api/:room/polls/:id/delete  { name }  (author only)
    else if (parts[2] === 'polls' && parts[4] === 'delete') {
      const poll = r.polls.find((p) => p.id === parts[3]);
      if (!poll || poll.author !== name) return send(res, 403, { error: 'only the author can delete' });
      r.polls = r.polls.filter((p) => p !== poll);
    } else {
      return send(res, 404, { error: 'not found' });
    }

    save();
    broadcast(code);
    return send(res, 200, { ok: true });
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(INDEX);
}).listen(PORT, () => console.log(`Life Votes running on http://localhost:${PORT}`));
