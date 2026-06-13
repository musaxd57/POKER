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
  const JOKER = Engine.JOKER_ID;

  const SUIT_SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const SUIT_RED = { H: true, D: true };
  const FACE_EMOJI = { J: '🤴', Q: '👸', K: '👑' };

  // Sayı kartları için pip (sembol) konumları: [x%, y%, ters mi?]
  const PIP_LAYOUTS = {
    'A':  [[50, 50, 0]],
    '2':  [[50, 16, 0], [50, 84, 1]],
    '3':  [[50, 16, 0], [50, 50, 0], [50, 84, 1]],
    '4':  [[30, 16, 0], [70, 16, 0], [30, 84, 1], [70, 84, 1]],
    '5':  [[30, 16, 0], [70, 16, 0], [50, 50, 0], [30, 84, 1], [70, 84, 1]],
    '6':  [[30, 16, 0], [70, 16, 0], [30, 50, 0], [70, 50, 0], [30, 84, 1], [70, 84, 1]],
    '7':  [[30, 16, 0], [70, 16, 0], [50, 32, 0], [30, 50, 0], [70, 50, 0], [30, 84, 1], [70, 84, 1]],
    '8':  [[30, 16, 0], [70, 16, 0], [50, 32, 0], [30, 50, 0], [70, 50, 0], [50, 68, 1], [30, 84, 1], [70, 84, 1]],
    '9':  [[30, 14, 0], [70, 14, 0], [30, 38, 0], [70, 38, 0], [50, 50, 0], [30, 62, 1], [70, 62, 1], [30, 86, 1], [70, 86, 1]],
    '10': [[30, 14, 0], [70, 14, 0], [50, 27, 0], [30, 40, 0], [70, 40, 0], [30, 60, 1], [70, 60, 1], [50, 73, 1], [30, 86, 1], [70, 86, 1]],
  };

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
    selectedId: null,  // tıkla-yerleştir için seçili kart
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
  function cornerEl(pos, rank, sym) {
    return h('div', 'corner ' + pos, `<span class="rk">${rank}</span><span class="su">${sym}</span>`);
  }

  // Gerçek iskambil joker'ine benzeyen çizimli soytarı (jester).
  function jokerArt() {
    return `<svg class="joker-svg" viewBox="0 0 64 92" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
      <!-- şapka uçları -->
      <path d="M16 15 L20 38 L29 37 Z" fill="#ef4444"/>
      <path d="M32 11 L28 38 L36 38 Z" fill="#8b5cf6"/>
      <path d="M48 15 L35 37 L44 38 Z" fill="#14b8a6"/>
      <!-- çanlar -->
      <circle cx="16" cy="14" r="3.2" fill="#fbbf24" stroke="#b45309" stroke-width=".6"/>
      <circle cx="32" cy="10" r="3.2" fill="#fbbf24" stroke="#b45309" stroke-width=".6"/>
      <circle cx="48" cy="14" r="3.2" fill="#fbbf24" stroke="#b45309" stroke-width=".6"/>
      <!-- yüz -->
      <circle cx="32" cy="47" r="12" fill="#ffe2c0" stroke="#e0b68a" stroke-width="1"/>
      <!-- alın bandı -->
      <path d="M20 40 Q32 32 44 40 Q32 45 20 40 Z" fill="#1f2937"/>
      <!-- gözler -->
      <circle cx="28" cy="46" r="1.7" fill="#1f2937"/>
      <circle cx="36" cy="46" r="1.7" fill="#1f2937"/>
      <!-- yanaklar -->
      <circle cx="25.5" cy="50.5" r="2" fill="#fb7185" opacity=".55"/>
      <circle cx="38.5" cy="50.5" r="2" fill="#fb7185" opacity=".55"/>
      <!-- gülümseme -->
      <path d="M27 51 Q32 56.5 37 51" fill="none" stroke="#b45309" stroke-width="1.6" stroke-linecap="round"/>
      <!-- fırfır yaka -->
      <path d="M16 60 Q20.5 70 25 61 Q28.5 70 32 61 Q35.5 70 39 61 Q43.5 70 48 60 L48 58 L16 58 Z" fill="#fbbf24" stroke="#b45309" stroke-width=".8"/>
      <!-- yaka ponponu -->
      <circle cx="32" cy="66" r="2.6" fill="#ef4444" stroke="#b45309" stroke-width=".5"/>
      <!-- köşe işaretleri -->
      <text x="5" y="13" font-size="8" font-weight="900" fill="#7c3aed" font-family="sans-serif">J</text>
      <g transform="rotate(180 59 80)"><text x="59" y="80" font-size="8" font-weight="900" fill="#7c3aed" font-family="sans-serif">J</text></g>
      <!-- JOKER yazısı -->
      <text x="32" y="81" font-size="7.5" font-weight="900" fill="#7c3aed" text-anchor="middle" font-family="sans-serif" letter-spacing="1.2">JOKER</text>
    </svg>`;
  }

  function cardFace(card) {
    // Joker: çizimli soytarı tasarımı
    if (card.joker) {
      const face = h('div', 'card-face joker');
      face.innerHTML = jokerArt();
      return face;
    }

    const red = SUIT_RED[card.suit] ? ' red' : '';
    const sym = SUIT_SYM[card.suit];
    const face = h('div', 'card-face' + red);
    face.appendChild(cornerEl('tl', card.rank, sym));
    face.appendChild(cornerEl('br', card.rank, sym));

    if (PIP_LAYOUTS[card.rank]) {
      // Sayı kartları (A, 2–10): gerçek pip dizilimi
      const area = h('div', 'pip-area');
      PIP_LAYOUTS[card.rank].forEach(([x, y, flip]) => {
        const p = h('div', 'pip-s' + (flip ? ' flip' : ''), sym);
        p.style.left = x + '%';
        p.style.top = y + '%';
        area.appendChild(p);
      });
      face.appendChild(area);
    } else {
      // Figür kartları (J, Q, K)
      const art = h('div', 'face-art');
      art.appendChild(h('div', 'face-emoji', FACE_EMOJI[card.rank] || ''));
      art.appendChild(h('div', 'face-suit', sym));
      face.appendChild(art);
    }
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
      App.selectedId = null;
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
        a.textContent = "🃏 Kartlarını diz, joker'i sakla — hazır olunca onayla!";
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
    if (ev.wasJoker) {
      msg = youDrew ? '🃏 Joker sana geldi! Dikkatli ol...' : '😈 Joker rakibe gitti!';
    } else if (ev.type === 'paired') {
      msg = youDrew ? `✅ Eş buldun: ${ev.drawn.rank} atıldı!` : `${view.players[1 - view.you].name || App.oppName} eş buldu.`;
    } else {
      msg = youDrew ? `📥 ${ev.drawn.rank}${SUIT_SYM[ev.drawn.suit]} aldın.` : 'Kart rakibe geçti.';
    }
    toast(msg);
  }

  // =========================================================================
  // DİZME (ARRANGE) — pürüzsüz (FLIP animasyonlu) sürükle-bırak
  // =========================================================================
  let drag = null; // { el, pointerId, grabX, grabY, startX, startY, moved }
  const TAP_THRESHOLD = 8; // bu kadar pikselden az hareket = tıklama

  function attachDrag(el) {
    el.addEventListener('pointerdown', onDragStart);
  }

  function onDragStart(e) {
    if (!App.arrangeMode) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    drag = {
      el, pointerId: e.pointerId,
      grabX: e.clientX - r.left, grabY: e.clientY - r.top,
      startX: e.clientX, startY: e.clientY, moved: false,
    };
    e.preventDefault();
  }

  function onDragMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const el = drag.el;

    // Eşik aşılana kadar tıklama say (sürükleme başlatma)
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < TAP_THRESHOLD) return;
      drag.moved = true;
      el.classList.add('lifted');
      el.classList.remove('selected');
      el.style.transition = 'none';
      el.style.zIndex = '100';
      document.body.classList.add('dragging-active');
    }

    // Kartı imlecin/parmağın altına yapışık tut (layout konumuna göre çevir)
    el.style.transform = '';
    const home = el.getBoundingClientRect();
    const tx = e.clientX - home.left - drag.grabX;
    const ty = e.clientY - home.top - drag.grabY;
    el.style.transform = `translate(${tx}px, ${ty}px) scale(1.08) rotate(2deg)`;

    // En yakın kartı bul, ondan önce mi sonra mı?
    const hand = $('you-hand');
    const others = [...hand.querySelectorAll('.card')].filter((c) => c !== el);
    let closest = null, best = Infinity;
    for (const c of others) {
      const r = c.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const d = (e.clientX - cx) ** 2 + (e.clientY - cy) ** 2;
      if (d < best) { best = d; closest = c; }
    }
    if (!closest) return;
    const cr = closest.getBoundingClientRect();
    const before = e.clientX < cr.left + cr.width / 2;
    const ref = before ? closest : closest.nextSibling;
    // Zaten doğru konumdaysa dokunma (gereksiz animasyonu önle)
    if (ref === el || el.nextSibling === ref) return;
    flipReorder(hand, el, () => hand.insertBefore(el, ref));
  }

  // FLIP: diğer kartları eski->yeni konuma yumuşakça kaydır.
  function flipReorder(container, dragged, mutate) {
    const cards = [...container.querySelectorAll('.card')];
    const firsts = new Map(cards.map((c) => [c, c.getBoundingClientRect()]));
    mutate();
    for (const c of container.querySelectorAll('.card')) {
      if (c === dragged) continue;
      const f = firsts.get(c);
      if (!f) continue;
      const l = c.getBoundingClientRect();
      const dx = f.left - l.left, dy = f.top - l.top;
      if (dx || dy) {
        c.style.transition = 'none';
        c.style.transform = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(() => {
          c.style.transition = 'transform .26s cubic-bezier(.2,.9,.25,1)';
          c.style.transform = '';
        });
      }
    }
  }

  function onDragEnd(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const el = drag.el;
    const wasTap = !drag.moved && e.type === 'pointerup';

    if (drag.moved) {
      el.classList.remove('lifted');
      el.style.transition = 'transform .22s cubic-bezier(.2,.9,.25,1)';
      el.style.transform = ''; // yerine yumuşakça otur
      setTimeout(() => { el.style.transition = ''; el.style.zIndex = ''; }, 240);
      document.body.classList.remove('dragging-active');
      App.workOrder = [...$('you-hand').querySelectorAll('.card')].map((c) => c.dataset.id);
    }
    drag = null;
    if (wasTap) handleTap(el);
  }

  // Tıkla-yerleştir: bir kartı seç, sonra başka karta tıkla -> seçilen kart oraya taşınır.
  function handleTap(el) {
    const hand = $('you-hand');
    if (!App.selectedId) {
      App.selectedId = el.dataset.id;
      el.classList.add('selected');
      return;
    }
    if (App.selectedId === el.dataset.id) {
      clearSelection(); // aynı karta tekrar -> seçimi bırak
      return;
    }
    const sel = hand.querySelector('.card.selected');
    if (sel && sel !== el) {
      flipReorder(hand, null, () => hand.insertBefore(sel, el));
      App.workOrder = [...hand.querySelectorAll('.card')].map((c) => c.dataset.id);
    }
    clearSelection();
  }

  function clearSelection() {
    App.selectedId = null;
    document.querySelectorAll('#you-hand .card.selected').forEach((c) => c.classList.remove('selected'));
  }

  document.addEventListener('pointermove', onDragMove, { passive: false });
  document.addEventListener('pointerup', onDragEnd);
  document.addEventListener('pointercancel', onDragEnd);

  function shuffleHand() {
    if (!App.arrangeMode) return;
    const hand = $('you-hand');
    const order = App.workOrder.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    App.workOrder = order;
    const map = new Map([...hand.querySelectorAll('.card')].map((c) => [c.dataset.id, c]));
    // FLIP ile tüm kartları yeni sıraya yumuşakça kaydır
    flipReorder(hand, null, () => order.forEach((id) => hand.appendChild(map.get(id))));
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
          const order = AI.arrange(st.players[def].hand, JOKER);
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
    $('end-title').textContent = won ? 'Kazandın!' : 'Joker Sende Kaldı!';
    $('end-sub').textContent = won
      ? "Joker'i rakibe yıktın. Helal olsun! 😎"
      : 'Kaçan joker elinde kaldı. Bir daha dene! 😅';
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
