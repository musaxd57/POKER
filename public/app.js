/*
 * Papaz Kaçtı — İstemci (Client)
 * --------------------------------------------------
 * Tek dosyada iki mod:
 *   - cpu:    oyun motoru + AI tarayıcıda çalışır (offline oynanır).
 *   - online: WebSocket ile sunucuya bağlanır, sunucu otoriterdir.
 * Render fonksiyonu her iki modda da aynı "view" nesnesini çizer.
 */

(function () {
  'use strict';

  const Engine = window.GameEngine;
  const AI = window.GameAI;
  const PAPAZ = Engine.PAPAZ_ID;

  const SUIT_SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const SUIT_RED = { H: true, D: true };

  // -------------------------------------------------------------------------
  // Kısa DOM yardımcıları
  // -------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  function h(tag, cls, html) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  }

  // -------------------------------------------------------------------------
  // Uygulama durumu
  // -------------------------------------------------------------------------
  const App = {
    mode: null,        // 'cpu' | 'online'
    you: 0,            // bu oyuncunun index'i
    oppName: 'Rakip',
    myName: 'Sen',
    view: null,        // çizilen son görünüm
    state: null,       // cpu modunda yerel motor durumu
    ws: null,          // online modunda WebSocket
    lastShownMove: -1, // animasyon tekrarını önler
    workOrder: null,   // dizme aşamasında çalışılan sıra (id dizisi)
    arrangeMode: false,
    newGameDeal: false,
    aiTimers: [],
  };

  // =========================================================================
  // EKRAN YÖNETİMİ
  // =========================================================================
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    $(id).classList.add('active');
  }
  function showOverlay(id, on) { $(id).classList.toggle('show', on); }

  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms || 2200);
  }

  // =========================================================================
  // KART ÇİZİMİ
  // =========================================================================
  function cardFace(card) {
    const red = SUIT_RED[card.suit] ? ' red' : '';
    const isPapaz = card.id === PAPAZ ? ' papaz' : '';
    const sym = SUIT_SYM[card.suit];
    const face = h('div', 'card-face' + red + isPapaz);
    face.appendChild(h('div', 'corner tl', `<span class="rk">${card.rank}</span><span class="su">${sym}</span>`));
    face.appendChild(h('div', 'pip', sym));
    face.appendChild(h('div', 'corner br', `<span class="rk">${card.rank}</span><span class="su">${sym}</span>`));
    return face;
  }

  function cardEl(card, opts) {
    opts = opts || {};
    const el = h('div', 'card');
    el.dataset.id = card.id;
    el.appendChild(cardFace(card));
    if (opts.dealing) el.classList.add('dealing');
    return el;
  }

  function backEl(opts) {
    opts = opts || {};
    const el = h('div', 'card');
    el.appendChild(h('div', 'card-back'));
    if (opts.selectable) el.classList.add('selectable');
    return el;
  }

  function meldEl(pair) {
    const m = h('div', 'meld');
    pair.forEach((c) => {
      const red = SUIT_RED[c.suit] ? ' red' : '';
      m.appendChild(h('span', 'm-card' + red, `${c.rank}${SUIT_SYM[c.suit]}`));
    });
    return m;
  }

  // =========================================================================
  // RENDER
  // =========================================================================
  function render(view) {
    App.view = view;
    const you = view.you;
    const opp = 1 - you;
    const me = view.players[you];
    const them = view.players[opp];

    // İsimler / sayaçlar
    $('you-name').textContent = me.name || App.myName;
    $('opp-name').textContent = them.name || App.oppName;
    $('you-count').textContent = me.handCount;
    $('opp-count').textContent = them.handCount;

    // Aktif oyuncu vurgusu (kim aksiyon alacak)
    const activeIdx = view.phase === 'arrange' ? view.defender : view.turn;
    $('you-name').parentElement.parentElement.classList.toggle('seat-active', activeIdx === you);
    $('opp-name').parentElement.parentElement.classList.toggle('seat-active', activeIdx === opp);

    // Rakip eli (kapalı). Seçim aşamasında ve sıra bizdeyse tıklanabilir.
    const oppHandEl = $('opp-hand');
    oppHandEl.innerHTML = '';
    const canPick = view.phase === 'pick' && view.turn === you;
    for (let i = 0; i < them.handCount; i++) {
      const b = backEl({ selectable: canPick });
      if (canPick) {
        const idx = i;
        b.addEventListener('click', () => doPick(idx));
      }
      oppHandEl.appendChild(b);
    }

    // Senin elin (açık)
    const youHandEl = $('you-hand');
    youHandEl.innerHTML = '';
    App.arrangeMode = view.phase === 'arrange' && view.defender === you;
    (me.hand || []).forEach((c) => {
      const el = cardEl(c, { dealing: App.newGameDeal });
      if (App.arrangeMode) {
        el.classList.add('draggable');
        attachDrag(el);
      }
      youHandEl.appendChild(el);
    });
    if (App.arrangeMode) {
      App.workOrder = (me.hand || []).map((c) => c.id);
    }
    App.newGameDeal = false;

    // Açılan çiftler
    renderMelds($('you-melds'), me.melds);
    renderMelds($('opp-melds'), them.melds);

    // Aksiyon çubuğu: yalnızca biz savunan & dizme aşamasındayken
    $('action-bar').classList.toggle('hidden', !App.arrangeMode);

    // Çekilen kart animasyonu + duyuru
    handleEventAnimation(view);
    updateAnnounce(view);

    // Oyun sonu
    if (view.phase === 'gameover') showGameOver(view);
  }

  function renderMelds(container, melds) {
    container.innerHTML = '';
    (melds || []).forEach((pair) => container.appendChild(meldEl(pair)));
  }

  function updateAnnounce(view) {
    if (view.phase === 'gameover') return;
    const a = $('announce');
    a.classList.remove('alert', 'danger');
    const you = view.you;
    const oppName = view.players[1 - you].name || App.oppName;
    if (view.phase === 'arrange') {
      if (view.defender === you) {
        a.textContent = '🃏 Kartlarını diz, papazı sakla — hazır olunca onayla!';
        a.classList.add('alert');
      } else {
        a.textContent = `${oppName} kartlarını diziyor...`;
      }
    } else if (view.phase === 'pick') {
      if (view.turn === you) {
        a.textContent = '👉 Sıra sende — rakibin kapalı kartlarından birini seç!';
        a.classList.add('alert');
      } else {
        a.textContent = `${oppName} senden kart çekiyor...`;
      }
    }
  }

  function handleEventAnimation(view) {
    const ev = view.lastEvent;
    if (!ev || view.moveCount === App.lastShownMove) return;
    App.lastShownMove = view.moveCount;

    // Çekilen kartı ortada aç
    const slot = $('reveal-slot');
    slot.innerHTML = '';
    const el = cardEl(ev.drawn);
    slot.appendChild(el);
    setTimeout(() => { if (slot.firstChild === el) slot.innerHTML = ''; }, 1500);

    // Mesaj
    const youDrew = ev.attacker === view.you;
    let msg;
    if (ev.wasPapaz) {
      msg = youDrew ? '😱 Papazı çektin! Dikkatli ol...' : '😈 Papaz rakibe gitti!';
    } else if (ev.type === 'paired') {
      msg = youDrew ? `✅ Eş buldun: ${ev.drawn.rank} atıldı!` : `${view.players[1 - view.you].name || App.oppName} eş buldu.`;
    } else {
      msg = youDrew ? `📥 ${ev.drawn.rank}${SUIT_SYM[ev.drawn.suit]} aldın.` : 'Kart rakibe geçti.';
    }
    toast(msg);
  }

  // =========================================================================
  // DİZME (ARRANGE) — sürükle-bırak yeniden sıralama
  // =========================================================================
  let dragEl = null;

  function attachDrag(el) {
    el.addEventListener('pointerdown', (e) => {
      if (!App.arrangeMode) return;
      dragEl = el;
      el.classList.add('lifted');
      el.setPointerCapture(e.pointerId);
    });
  }

  document.addEventListener('pointermove', (e) => {
    if (!dragEl) return;
    const hand = $('you-hand');
    const cards = [...hand.querySelectorAll('.card')];
    let placed = false;
    for (const c of cards) {
      if (c === dragEl) continue;
      const r = c.getBoundingClientRect();
      if (e.clientY < r.bottom && e.clientX < r.left + r.width / 2) {
        hand.insertBefore(dragEl, c);
        placed = true;
        break;
      }
    }
    if (!placed) hand.appendChild(dragEl);
  });

  document.addEventListener('pointerup', () => {
    if (!dragEl) return;
    dragEl.classList.remove('lifted');
    dragEl = null;
    App.workOrder = [...$('you-hand').querySelectorAll('.card')].map((c) => c.dataset.id);
  });

  function shuffleHand() {
    if (!App.arrangeMode) return;
    const order = App.workOrder.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    App.workOrder = order;
    // DOM'u yeni sıraya göre yerleştir
    const hand = $('you-hand');
    const map = new Map([...hand.querySelectorAll('.card')].map((c) => [c.dataset.id, c]));
    order.forEach((id) => {
      const el = map.get(id);
      el.classList.remove('dealing');
      void el.offsetWidth;
      el.classList.add('dealing');
      hand.appendChild(el);
    });
  }

  function confirmReady() {
    if (!App.arrangeMode) return;
    App.arrangeMode = false;
    if (App.mode === 'cpu') {
      Engine.reorderHand(App.state, App.you, App.workOrder);
      Engine.confirmArrange(App.state, App.you);
      driveLocal();
    } else {
      wsSend({ type: 'reorder', order: App.workOrder });
      wsSend({ type: 'ready' });
    }
  }

  // =========================================================================
  // KART SEÇME (PICK)
  // =========================================================================
  function doPick(index) {
    if (App.view.phase !== 'pick' || App.view.turn !== App.you) return;
    if (App.mode === 'cpu') {
      Engine.pickCard(App.state, App.you, index);
      driveLocal();
    } else {
      wsSend({ type: 'pick', index });
    }
  }

  // =========================================================================
  // CPU MODU — yerel motor + AI sürücüsü
  // =========================================================================
  function startCpu() {
    clearAiTimers();
    App.mode = 'cpu';
    App.you = 0;
    App.oppName = '🤖 Bilgisayar';
    App.lastShownMove = -1;
    App.newGameDeal = true;
    App.state = Engine.createGame([
      { id: 'human', name: App.myName },
      { id: 'cpu', name: '🤖 Bilgisayar' },
    ]);
    showOverlay('overlay-end', false);
    showScreen('screen-game');
    driveLocal();
  }

  function driveLocal() {
    const st = App.state;
    render(Engine.publicView(st, App.you));
    if (st.phase === 'gameover') return;

    if (st.phase === 'arrange') {
      const def = Engine.defenderIndex(st);
      if (def !== App.you) {
        // AI savunan: elini dizip onaylar
        aiDelay(() => {
          const order = AI.arrange(st.players[def].hand, PAPAZ);
          Engine.reorderHand(st, def, order);
          Engine.confirmArrange(st, def);
          driveLocal();
        }, 800);
      }
      // def === you ise: insan dizecek (UI bekler)
    } else if (st.phase === 'pick') {
      const att = st.turn;
      if (att !== App.you) {
        // AI saldıran: bizim elimizden seçer
        aiDelay(() => {
          const idx = AI.pick(st.players[App.you].hand.length);
          Engine.pickCard(st, att, idx);
          driveLocal();
        }, 1000);
      }
      // att === you ise: insan seçecek (UI bekler)
    }
  }

  function aiDelay(fn, ms) {
    const t = setTimeout(fn, ms);
    App.aiTimers.push(t);
  }
  function clearAiTimers() {
    App.aiTimers.forEach(clearTimeout);
    App.aiTimers = [];
  }

  // =========================================================================
  // ONLINE MODU — WebSocket
  // =========================================================================
  function connectWS() {
    return new Promise((resolve, reject) => {
      try {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        const ws = new WebSocket(`${proto}://${location.host}`);
        ws.onopen = () => resolve(ws);
        ws.onerror = () => reject(new Error('Bağlantı kurulamadı.'));
        ws.onmessage = onWSMessage;
        ws.onclose = onWSClose;
        App.ws = ws;
      } catch (e) {
        reject(e);
      }
    });
  }

  function wsSend(obj) {
    if (App.ws && App.ws.readyState === WebSocket.OPEN) App.ws.send(JSON.stringify(obj));
  }

  function onWSMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw.data); } catch (e) { return; }
    switch (msg.type) {
      case 'created':
        $('lobby-spinner').classList.remove('hidden');
        $('lobby-msg').textContent = 'Rakip bekleniyor... Kodu paylaş:';
        $('code-box').classList.remove('hidden');
        $('room-code').textContent = msg.code;
        App.roomCode = msg.code;
        break;
      case 'start':
        App.mode = 'online';
        App.you = msg.you;
        App.oppName = msg.opponentName;
        App.lastShownMove = -1;
        App.newGameDeal = true;
        showOverlay('overlay-end', false);
        showScreen('screen-game');
        toast('Rakip bağlandı! Oyun başlıyor.');
        break;
      case 'state':
        render(msg.state);
        break;
      case 'opponentLeft':
        toast('Rakip oyundan ayrıldı.', 3000);
        showOverlay('overlay-end', false);
        backToMenu();
        break;
      case 'error':
        toast('⚠ ' + msg.message, 2800);
        $('lobby-spinner').classList.add('hidden');
        break;
    }
  }

  function onWSClose() {
    if (App.mode === 'online') {
      toast('Sunucu bağlantısı kesildi.', 3000);
    }
  }

  // =========================================================================
  // OYUN SONU
  // =========================================================================
  function showGameOver(view) {
    const won = view.winner === view.you;
    $('end-emoji').textContent = won ? '🏆' : '🃏';
    $('end-title').textContent = won ? 'Kazandın!' : 'Papaz Sende Kaldı!';
    $('end-sub').textContent = won
      ? 'Papazı rakibe yıktın. Helal olsun! 😎'
      : 'Kaçan papaz elinde kaldı. Bir daha dene! 😅';
    setTimeout(() => showOverlay('overlay-end', true), 700);
  }

  function rematch() {
    showOverlay('overlay-end', false);
    if (App.mode === 'cpu') {
      startCpu();
    } else {
      wsSend({ type: 'rematch' });
    }
  }

  function backToMenu() {
    clearAiTimers();
    if (App.ws) { wsSend({ type: 'leave' }); try { App.ws.close(); } catch (e) {} App.ws = null; }
    App.mode = null;
    App.state = null;
    showOverlay('overlay-end', false);
    showScreen('screen-menu');
  }

  // =========================================================================
  // OLAY BAĞLAYICILAR (event listeners)
  // =========================================================================
  function readName() {
    const v = $('player-name').value.trim();
    App.myName = v || 'Oyuncu';
    return App.myName;
  }

  function init() {
    // Menü
    $('btn-cpu').addEventListener('click', () => { readName(); startCpu(); });
    $('btn-online').addEventListener('click', () => { readName(); openOnline(); });
    $('btn-rules').addEventListener('click', () => showOverlay('overlay-rules', true));
    $('btn-close-rules').addEventListener('click', () => showOverlay('overlay-rules', false));

    // Online lobi
    $('btn-create').addEventListener('click', createRoom);
    $('btn-join').addEventListener('click', joinRoom);
    $('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
    $('btn-copy').addEventListener('click', () => {
      navigator.clipboard?.writeText(App.roomCode || '').then(() => toast('Kod kopyalandı!'));
    });
    $('btn-back-menu').addEventListener('click', backToMenu);

    // Oyun
    $('btn-shuffle').addEventListener('click', shuffleHand);
    $('btn-ready').addEventListener('click', confirmReady);
    $('btn-quit').addEventListener('click', () => { if (confirm('Oyundan çıkılsın mı?')) backToMenu(); });

    // Oyun sonu
    $('btn-rematch').addEventListener('click', rematch);
    $('btn-end-menu').addEventListener('click', backToMenu);
  }

  function openOnline() {
    // Lobi durumu, oda kurulana/katılana kadar gizli kalır.
    $('lobby-status').classList.add('hidden');
    $('code-box').classList.add('hidden');
    $('join-code').value = '';
    showScreen('screen-online');
  }

  async function createRoom() {
    readName();
    $('lobby-status').classList.remove('hidden');
    $('lobby-spinner').classList.remove('hidden');
    $('lobby-msg').textContent = 'Oda kuruluyor...';
    try {
      if (!App.ws || App.ws.readyState !== WebSocket.OPEN) await connectWS();
      wsSend({ type: 'create', name: App.myName });
    } catch (e) {
      toast('⚠ Sunucuya bağlanılamadı. (Online mod için sunucunun çalışması gerekir.)', 3500);
      $('lobby-spinner').classList.add('hidden');
    }
  }

  async function joinRoom() {
    readName();
    const code = $('join-code').value.toUpperCase().trim();
    if (code.length < 4) return toast('Geçerli bir oda kodu gir.');
    $('lobby-status').classList.remove('hidden');
    $('lobby-spinner').classList.remove('hidden');
    $('code-box').classList.add('hidden');
    $('lobby-msg').textContent = 'Odaya katılınıyor...';
    try {
      if (!App.ws || App.ws.readyState !== WebSocket.OPEN) await connectWS();
      wsSend({ type: 'join', code, name: App.myName });
    } catch (e) {
      toast('⚠ Sunucuya bağlanılamadı.', 3500);
      $('lobby-spinner').classList.add('hidden');
    }
  }

  // Başlat
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
