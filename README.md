<p align="center">
  <img src="docs/logo/splid-logo.png" width="180" alt="SpliD Logo" />
</p>

<h1 align="center">SpliD — Automatic Cross-Platform 3D Model Splitter</h1>

<p align="center">
  Karmaşık manuel kesim araçları yerine <strong>4 adımlı, sıfır sürtünmeli (zero-friction)</strong> bir masaüstü iş akışı sunan cross-platform (Windows, macOS, Linux) Electron 3D model bölme uygulaması.
</p>

---

## Özellikler

1. **Model Yükle (STL / OBJ / 3MF):** Sürükle-bırak veya Gözat ile yüklenen model anında merkeze hizalanır, **mevcut `X × Y × Z mm` boyutları**, hacmi ($\text{cm}^3$) ve üçgen sayısı ölçülür.
2. **Akıllı Ölçekleme:** En-boy oranı kilidiyle hedef `X / Y / Z mm` veya `%` ölçek ayarı; tek tıkla `Inch → mm (×25.4)` ve `cm → mm (×10)` dönüşümü.
3. **65+ Yazıcı Tabla Veritabanı (`printers.json`):** Bambu Lab, Creality, Prusa, Anycubic, Elegoo, Voron, Qidi, FlashForge, Sovol, UltiMaker, Artillery, RatRig ve Phrozen modelleri + Özel (Custom) tabla boyutu.
4. **Best-Practice Otomatik Bölme (`manifold-3d` WASM):**
   - **XY 90° Rotasyon Optimizasyonu:** Daha az parça çıkaran yönelimi otomatik seçer.
   - **Anti-Sliver Dengeli Kesim & Dar Boğaz (Seam) Minimizasyonu:** İnce/kırılgan dilim bırakmaz; izin verilen pencere içinde en dar kesit alanından keser.
   - **Hiyerarşik Adaptif KD-Split:** Her alt parçayı kendi sıkı sınır kutusuna göre böler.
   - **3 Kademeli Adaptif Hizalama Pimi:** Kalın kesitlerde (`≥ 14 mm`) standart `4.0 mm` pim, orta-ince kesitlerde (`6–14 mm`) `1.75 mm` ham filament pimi yuvası (`1.95 mm`), çok ince kabuklarda (`< 6 mm`) duvarı delmemek için otomatik pim atlama.
   - **Patlatılmış Görünüm (Exploded View) & Tek Tıkla ZIP/STL Çıktısı.**

## Geliştirme ve Derleme

```bash
# Bağımlılıkları yükle
npm install

# Geliştirme modunda başlat
npm run dev

# TypeScript kontrolü ve birim testleri
npx tsc --noEmit
npx vitest run

# Production derlemesi
npm run build
```

---

## Künye

| | |
| :--- | :--- |
| **Geliştirici** | Ümit Tunç |
| **Kuruluş** | Trunçgil Teknoloji |
| **Web** | [truncgil.com](https://truncgil.com) |
| **Lisans** | MIT |

