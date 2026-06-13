/*
 * Papaz Kaçtı - Bilgisayar Rakip (AI)
 * --------------------------------------------------
 * Tarayıcıda "bilgisayara karşı" modda kullanılır.
 * AI iki rolü de oynayabilir:
 *   - Savunan (arrange): elini dizer, papazı blöfle bir yere koyar.
 *   - Saldıran (pick): rakibin kapalı kartlarından birini seçer.
 *
 * AI rakibin elini GÖREMEZ (adil oyun). Seçimler olasılığa dayanır.
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./game-engine.js'));
  } else {
    root.GameAI = factory(root.GameEngine);
  }
})(typeof self !== 'undefined' ? self : this, function (Engine) {
  'use strict';

  function randInt(n) {
    return Math.floor(Math.random() * n);
  }

  // AI savunan rolünde: elini diz. Papazı kenarlardan kaçırıp ortalara
  // doğru, biraz rastgele bir yere yerleştirir -> tahmini zorlaştıran blöf.
  function arrange(hand, papazId) {
    const cards = hand.slice();
    // Önce tamamen karıştır
    for (let i = cards.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    const pIdx = cards.findIndex((c) => c.id === papazId);
    if (pIdx !== -1 && cards.length >= 3) {
      // Papazı kenar olmayan rastgele bir konuma taşı (insanlar uçları seçmeye meyillidir)
      const [papaz] = cards.splice(pIdx, 1);
      const target = 1 + randInt(cards.length - 1); // 1 .. length-1 (uçlar hariç eğilim)
      cards.splice(target, 0, papaz);
    }
    return cards.map((c) => c.id);
  }

  // AI saldıran rolünde: rakibin handCount kadar kapalı kartından birini seç.
  // Rakibin elini göremez; basit ama makul: rastgele, hafif orta-kaçınma.
  function pick(opponentHandCount) {
    if (opponentHandCount <= 1) return 0;
    return randInt(opponentHandCount);
  }

  return { arrange, pick };
});
