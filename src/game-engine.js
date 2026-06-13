/*
 * Papaz Kaçtı - Oyun Motoru (Game Engine)
 * --------------------------------------------------
 * Saf oyun mantığı. UI veya ağ bağımlılığı YOKTUR.
 * Hem tarayıcıda (bilgisayara karşı mod) hem de Node.js
 * sunucusunda (online, otoriter mod) kullanılır.
 *
 * Kurallar (Türk Papaz Kaçtı):
 *  - 52'lik desteden 4 papazdan (King) 3'ü çıkarılır, tek papaz kalır.
 *  - Kalan 49 kart iki oyuncuya dağıtılır.
 *  - Eşi olan kartlar (aynı DEĞER, sembol fark etmez) açılıp atılır.
 *  - Sırayla rakibin kapalı kartlarından biri çekilir; eş olursa atılır.
 *  - Tek papaz dışında tüm kartlar bitince, elinde papaz kalan KAYBEDER.
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.GameEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SUITS = ['S', 'H', 'D', 'C']; // Maça, Kupa, Karo, Sinek
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  // Oyunda kalan tek papaz: Maça Papazı. "Kaçan papaz" budur.
  const PAPAZ_ID = 'KS';

  function buildDeck() {
    const deck = [];
    for (const rank of RANKS) {
      for (const suit of SUITS) {
        const id = rank + suit;
        // 4 papazdan yalnızca biri (PAPAZ_ID) destede kalır.
        if (rank === 'K' && id !== PAPAZ_ID) continue;
        deck.push({ id, rank, suit });
      }
    }
    return deck; // 49 kart
  }

  // Fisher-Yates karıştırma. İsteğe bağlı rastgele üreteç (test için).
  function shuffle(array, rng) {
    const rand = rng || Math.random;
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Eldeki tüm eşleri (aynı değer) ayıkla. Kalan el + atılan çiftleri döndür.
  function extractPairs(hand) {
    const byRank = new Map();
    for (const card of hand) {
      if (!byRank.has(card.rank)) byRank.set(card.rank, []);
      byRank.get(card.rank).push(card);
    }
    const kept = [];
    const melds = [];
    for (const cards of byRank.values()) {
      let i = 0;
      // İkişerli grupla -> çift olarak at
      while (i + 1 < cards.length) {
        melds.push([cards[i], cards[i + 1]]);
        i += 2;
      }
      if (i < cards.length) kept.push(cards[i]); // tek kalan (eşsiz)
    }
    return { kept, melds };
  }

  // Yeni oyun oluştur. players: [{id, name}, {id, name}]
  function createGame(players, rng) {
    const deck = shuffle(buildDeck(), rng);
    const hands = [[], []];
    deck.forEach((card, i) => hands[i % 2].push(card));

    const state = {
      players: players.map((p, idx) => {
        const { kept, melds } = extractPairs(hands[idx]);
        return {
          id: p.id,
          name: p.name,
          hand: kept,
          melds: melds, // açılmış (atılmış) çiftler [[c1,c2], ...]
        };
      }),
      turn: 0,            // şu an çeken (saldıran) oyuncunun index'i
      phase: 'arrange',   // 'arrange' (savunan dizer) -> 'pick' (saldıran seçer) -> 'gameover'
      papazId: PAPAZ_ID,
      lastEvent: null,    // animasyon/anlatım için son olay
      winner: null,
      loser: null,
      moveCount: 0,
    };

    // Başlangıçta eşi olan herkes açtı. Oyunu rastgele biri başlatır.
    state.turn = (rng ? Math.floor(rng() * 2) : Math.floor(Math.random() * 2));

    // Hangi oyuncunun papazı tuttuğu bilgisi (anlatım için).
    checkGameOver(state);
    return state;
  }

  function defenderIndex(state) {
    return 1 - state.turn;
  }

  function totalCardsInPlay(state) {
    return state.players[0].hand.length + state.players[1].hand.length;
  }

  function findCardIndexById(hand, id) {
    return hand.findIndex((c) => c.id === id);
  }

  // Savunan oyuncu elini yeniden dizer (papazı istediği yere koymak için).
  // order: kart id'lerinden oluşan dizi (savunanın elinin permütasyonu).
  function reorderHand(state, playerIndex, order) {
    if (state.phase !== 'arrange') return { ok: false, error: 'Şu an dizme aşaması değil.' };
    if (playerIndex !== defenderIndex(state)) return { ok: false, error: 'Yalnızca savunan oyuncu dizebilir.' };
    const hand = state.players[playerIndex].hand;
    if (!Array.isArray(order) || order.length !== hand.length) {
      return { ok: false, error: 'Geçersiz diziliş.' };
    }
    const map = new Map(hand.map((c) => [c.id, c]));
    const next = [];
    for (const id of order) {
      if (!map.has(id)) return { ok: false, error: 'Bilinmeyen kart.' };
      next.push(map.get(id));
      map.delete(id);
    }
    if (map.size !== 0) return { ok: false, error: 'Eksik kart.' };
    state.players[playerIndex].hand = next;
    return { ok: true };
  }

  // Savunan dizmeyi bitirir -> seçim aşamasına geç.
  function confirmArrange(state, playerIndex) {
    if (state.phase !== 'arrange') return { ok: false, error: 'Dizme aşaması değil.' };
    if (playerIndex !== defenderIndex(state)) return { ok: false, error: 'Yalnızca savunan onaylayabilir.' };
    state.phase = 'pick';
    return { ok: true };
  }

  // Saldıran oyuncu, savunanın elindeki "index" konumundaki kapalı kartı çeker.
  function pickCard(state, attackerIndex, index) {
    if (state.phase === 'gameover') return { ok: false, error: 'Oyun bitti.' };
    if (state.phase !== 'pick') return { ok: false, error: 'Önce savunan kartlarını dizmeli.' };
    if (attackerIndex !== state.turn) return { ok: false, error: 'Sıra sizde değil.' };

    const dIdx = defenderIndex(state);
    const defender = state.players[dIdx];
    const attacker = state.players[attackerIndex];

    if (index < 0 || index >= defender.hand.length) {
      return { ok: false, error: 'Geçersiz kart seçimi.' };
    }

    // Kartı savunandan al
    const [drawn] = defender.hand.splice(index, 1);

    // Saldıranın elinde aynı değerden kart var mı? (en fazla 1 olabilir)
    const matchIdx = attacker.hand.findIndex((c) => c.rank === drawn.rank);
    let paired = false;
    let pairWith = null;
    if (matchIdx !== -1) {
      pairWith = attacker.hand[matchIdx];
      attacker.hand.splice(matchIdx, 1);
      attacker.melds.push([pairWith, drawn]);
      paired = true;
    } else {
      attacker.hand.push(drawn);
    }

    state.moveCount += 1;
    state.lastEvent = {
      type: paired ? 'paired' : 'kept',
      attacker: attackerIndex,
      defender: dIdx,
      drawn,
      pairWith,
      wasPapaz: drawn.id === PAPAZ_ID,
    };

    const over = checkGameOver(state);
    if (!over) {
      state.phase = 'arrange';
      state.turn = dIdx; // sıra savunana geçer
    }
    return { ok: true, paired, drawn, gameOver: over };
  }

  // Oyun bitti mi? Toplam 1 kart kaldıysa o kart papazdır, sahibi kaybeder.
  function checkGameOver(state) {
    const total = totalCardsInPlay(state);
    if (total <= 1) {
      let loserIdx = state.players[0].hand.length > 0 ? 0 : 1;
      if (total === 0) loserIdx = -1; // teorik olarak olmaz
      state.phase = 'gameover';
      state.loser = loserIdx;
      state.winner = loserIdx === -1 ? -1 : 1 - loserIdx;
      return true;
    }
    return false;
  }

  // Belirli bir oyuncu için "kişiye özel" görünüm. Rakibin el içeriği gizlenir.
  // viewerIndex: bu görünümü görecek oyuncu. null => her şey açık (debug).
  function publicView(state, viewerIndex) {
    const view = {
      phase: state.phase,
      turn: state.turn,
      defender: defenderIndex(state),
      papazId: state.papazId,
      lastEvent: state.lastEvent,
      winner: state.winner,
      loser: state.loser,
      moveCount: state.moveCount,
      you: viewerIndex,
      players: state.players.map((p, idx) => {
        const reveal = viewerIndex === null || idx === viewerIndex;
        return {
          id: p.id,
          name: p.name,
          handCount: p.hand.length,
          // Kendi elin açık; rakibin eli kapalı (yalnızca adet).
          hand: reveal ? p.hand.slice() : null,
          melds: p.melds.map((m) => m.slice()), // atılan çiftler ikisine de açık
        };
      }),
    };
    return view;
  }

  return {
    SUITS,
    RANKS,
    PAPAZ_ID,
    buildDeck,
    shuffle,
    extractPairs,
    createGame,
    reorderHand,
    confirmArrange,
    pickCard,
    checkGameOver,
    publicView,
    defenderIndex,
    totalCardsInPlay,
  };
});
