/*
 * Papaz Kaçtı - Sunucu
 * --------------------------------------------------
 * 1) Statik dosyaları (public/, src/) sunar.
 * 2) WebSocket üzerinden oda kodu ile online maç yönetir.
 *    Oyun mantığı SUNUCUDA otoriterdir (hile önleme).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const Engine = require('./game-engine.js');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// Statik dosya sunumu
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function safeJoin(base, target) {
  const p = path.normalize(path.join(base, target));
  if (!p.startsWith(base)) return null; // dizin dışına çıkışı engelle
  return p;
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/public/index.html';
  // Kök altındaki public ve src klasörlerine izin ver
  if (!urlPath.startsWith('/public') && !urlPath.startsWith('/src')) {
    urlPath = '/public' + urlPath;
  }
  const filePath = safeJoin(ROOT, urlPath);
  if (!filePath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bulunamadı: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------------------------------------------------------------------------
// Oda / Maç yönetimi
// ---------------------------------------------------------------------------
const rooms = new Map(); // code -> room

function makeCode() {
  let code;
  do {
    code = '';
    const chars = 'ABCDEFGHJKLMNPRSTUVYZ23456789'; // karışabilenler çıkarıldı
    for (let i = 0; i < 5; i++) code += chars[crypto.randomInt(chars.length)];
  } while (rooms.has(code));
  return code;
}

function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcastState(room) {
  const { state, sockets } = room;
  sockets.forEach((ws, idx) => {
    if (!ws) return;
    send(ws, { type: 'state', state: Engine.publicView(state, idx) });
  });
}

function startGame(room) {
  const names = room.players.map((p, i) => p.name || `Oyuncu ${i + 1}`);
  room.state = Engine.createGame(
    [{ id: 'p0', name: names[0] }, { id: 'p1', name: names[1] }]
  );
  room.sockets.forEach((ws, idx) => {
    send(ws, {
      type: 'start',
      you: idx,
      code: room.code,
      opponentName: names[1 - idx],
    });
  });
  broadcastState(room);
}

function leaveRoom(ws) {
  const room = ws._room;
  if (!room) return;
  const idx = room.sockets.indexOf(ws);
  if (idx !== -1) room.sockets[idx] = null;
  ws._room = null;
  // Diğer oyuncuya haber ver
  room.sockets.forEach((other) => {
    if (other) send(other, { type: 'opponentLeft' });
  });
  // Oda boşsa sil
  if (room.sockets.every((s) => !s)) rooms.delete(room.code);
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws._room = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return send(ws, { type: 'error', message: 'Geçersiz mesaj.' });
    }

    switch (msg.type) {
      case 'create': {
        if (ws._room) leaveRoom(ws);
        const code = makeCode();
        const room = {
          code,
          sockets: [ws, null],
          players: [{ name: (msg.name || '').slice(0, 16) || 'Oyuncu 1' }, { name: 'Oyuncu 2' }],
          state: null,
        };
        rooms.set(code, room);
        ws._room = room;
        send(ws, { type: 'created', code });
        break;
      }

      case 'join': {
        const code = (msg.code || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) return send(ws, { type: 'error', message: 'Oda bulunamadı.' });
        const slot = room.sockets.indexOf(null);
        if (slot === -1) return send(ws, { type: 'error', message: 'Oda dolu.' });
        if (ws._room) leaveRoom(ws);
        room.sockets[slot] = ws;
        room.players[slot] = { name: (msg.name || '').slice(0, 16) || `Oyuncu ${slot + 1}` };
        ws._room = room;
        startGame(room);
        break;
      }

      case 'reorder': {
        const room = ws._room;
        if (!room || !room.state) return;
        const idx = room.sockets.indexOf(ws);
        const r = Engine.reorderHand(room.state, idx, msg.order || []);
        if (!r.ok) return send(ws, { type: 'error', message: r.error });
        // Sadece dizen oyuncuya güncel görünüm yeter (rakip kapalı görüyor)
        send(ws, { type: 'state', state: Engine.publicView(room.state, idx) });
        break;
      }

      case 'ready': {
        const room = ws._room;
        if (!room || !room.state) return;
        const idx = room.sockets.indexOf(ws);
        const r = Engine.confirmArrange(room.state, idx);
        if (!r.ok) return send(ws, { type: 'error', message: r.error });
        broadcastState(room);
        break;
      }

      case 'pick': {
        const room = ws._room;
        if (!room || !room.state) return;
        const idx = room.sockets.indexOf(ws);
        const r = Engine.pickCard(room.state, idx, msg.index);
        if (!r.ok) return send(ws, { type: 'error', message: r.error });
        broadcastState(room);
        break;
      }

      case 'rematch': {
        const room = ws._room;
        if (!room) return;
        if (room.sockets.filter(Boolean).length < 2) {
          return send(ws, { type: 'error', message: 'Rakip yok.' });
        }
        startGame(room);
        break;
      }

      case 'leave': {
        leaveRoom(ws);
        break;
      }

      default:
        send(ws, { type: 'error', message: 'Bilinmeyen istek.' });
    }
  });

  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => leaveRoom(ws));
});

server.listen(PORT, () => {
  console.log(`Papaz Kaçtı sunucusu çalışıyor:  http://localhost:${PORT}`);
});
