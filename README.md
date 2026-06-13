# 🃏 Papaz Kaçtı

2 kişilik klasik **Papaz Kaçtı** kart oyunu. Modern, mobil + masaüstü uyumlu web arayüzü.
**Bilgisayara karşı** (offline) veya **oda kodu ile gerçek online** oynayabilirsiniz.

## Oyun Nasıl Oynanır?

- Destede eşi olmayan tek bir **🃏 Joker** vardır: *kaçan joker*.
- 52 kart + 1 joker (toplam 53) iki oyuncuya dağıtılır.
- Elinde **aynı değerden** iki kart olan (renk/sembol fark etmez) bunları açıp atar.
- Sırayla, rakibinin **kapalı** kartlarından birini çekersin. Eş olursa açılıp atılır.
- **Savunan** oyuncu kartlarını dizip joker'i istediği yere saklayabilir → *blöf!*
- Joker dışında tüm kartlar bitince, **elinde joker kalan kaybeder.**

## Çalıştırma

Gereksinim: **Node.js 16+**

```bash
npm install
npm start
```

Ardından tarayıcıdan **http://localhost:3000** adresini aç.

- **🤖 Bilgisayara Karşı:** Sunucuya bile gerek yok; tamamen tarayıcıda çalışır.
- **🌐 Online Oyun:** Bir oyuncu "Oda Kur" der, çıkan **5 harfli kodu** paylaşır;
  diğer oyuncu "Katıl" deyip kodu girer. İki taraf farklı cihazlardan
  gerçek zamanlı oynar.

> Online modun internet üzerinden çalışması için `npm start` ile başlatılan
> sunucunun erişilebilir bir adreste (ör. bir host/sunucu) çalışıyor olması gerekir.
> İstenirse `PORT` ortam değişkeni ile port değiştirilebilir.

## Proje Yapısı

```
src/
  game-engine.js   # Saf oyun mantığı (tarayıcı + sunucu ortak)
  ai.js            # Bilgisayar rakip (dizme + seçme)
  server.js        # HTTP statik sunum + WebSocket oda/maç yönetimi
public/
  index.html       # Arayüz iskeleti
  styles.css       # Tema, kartlar, animasyonlar
  app.js           # İstemci mantığı (cpu + online), render, sürükle-bırak
```

Oyun mantığı online modda **sunucuda otoriter** çalışır (hile önleme).
