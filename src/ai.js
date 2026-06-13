/*
 * Papaz Kaçtı - Bilgisayar Rakip (AI)
 * --------------------------------------------------
 * Tarayıcıda "bilgisayara karşı" modda kullanılır.
 * AI iki rolü de oynayabilir:
 *   - Savunan (arrange): elini dizer, joker'i blöfle bir yere koyar.
 *   - Saldıran (pick): rakibin kapalı kartlarından birini seçer.
 *
 * AI rakibin elini GÖREMEZ (adil oyun). Seçimler olasılığa dayanır.
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.GameAI = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function randInt(n) {
    return Math.floor(Math.random() * n);
  }

  // AI savunan rolünde: elini diz. Joker'i kenarlardan kaçırıp ortalara
  // doğru, biraz rastgele bir yere yerleştirir -> tahmini zorlaştıran blöf.
  function arrange(hand, jokerId) {
    const cards = hand.slice();
    // Önce tamamen karıştır
    for (let i = cards.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    const jIdx = cards.findIndex((c) => c.id === jokerId);
    if (jIdx !== -1 && cards.length >= 3) {
      // Joker'i kenar olmayan rastgele bir konuma taşı (insanlar uçları seçmeye meyillidir)
      const [joker] = cards.splice(jIdx, 1);
      const target = 1 + randInt(cards.length - 1); // uçlardan kaçınma eğilimi
      cards.splice(target, 0, joker);
    }
    return cards.map((c) => c.id);
  }

  // AI saldıran rolünde: rakibin handCount kadar kapalı kartından birini seç.
  // Rakibin elini göremez; basit ama makul: rastgele.
  function pick(opponentHandCount) {
    if (opponentHandCount <= 1) return 0;
    return randInt(opponentHandCount);
  }

  return { arrange, pick };
});
