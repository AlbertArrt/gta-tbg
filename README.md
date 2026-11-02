# GTA TBG – Tarnobrzeg – open world

Przeglądarkowa gra 3D z otwartym światem, której mapą jest **Tarnobrzeg**. Można chodzić pieszo albo jeździć samochodem po prawdziwym układzie ulic. Ulice, budynki, rzeki, jeziora, parki i lasy pochodzą z **OpenStreetMap**.

> Dane mapy © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), licencja **ODbL**.
> Silnik grafiki: [three.js](https://threejs.org) r160, licencja MIT (dołączony w `vendor/`).
> „GTA TBG” to fanowski projekt hobbystyczny. Logo jest własnym projektem i nie korzysta z materiałów Rockstar Games.

## Jak uruchomić

### 1. Jeden plik, offline (także na Androidzie)
Otwórz plik **`gta-tbg-single.html`**. Ma ok. 2,9 MB i zawiera całą grę: silnik, dane mapy i grafikę.
- **Komputer:** kliknij plik dwa razy. Otworzy się Chrome, Edge albo Firefox.
- **Android:** skopiuj plik do telefonu, na przykład do folderu *Pobrane*. Następnie otwórz go w Chrome (Menedżer plików → Otwórz za pomocą → Chrome) albo wpisz w pasku adresu `file:///sdcard/Download/gta-tbg-single.html`.
- Do gry nie jest potrzebny internet. Wyjątkiem jest radio, które działa tylko online.

### 2. Folder na serwerze statycznym
```bash
cd tarnobrzeg-3d
python3 -m http.server 8000
# otwórz http://localhost:8000
```
Wersja z folderu nie zadziała po dwukrotnym kliknięciu `index.html`, bo przeglądarka blokuje wtedy wczytywanie modułów ES i pliku JSON. Do tego służy plik `gta-tbg-single.html`.

### 3. GitHub Pages
1. Rozpakuj **`gta-tbg-web.zip`** do nowego repozytorium, tak aby plik `index.html` był w katalogu głównym.
2. Wykonaj `git add . && git commit -m "GTA TBG" && git push`.
3. W repozytorium wejdź w **Settings → Pages → Source: Deploy from a branch**, wybierz `main` i katalog `/ (root)`.
4. Po minucie gra będzie dostępna pod adresem `https://<login>.github.io/<repo>/`.

## Sterowanie

| Komputer | Działanie |
|---|---|
| W A S D / strzałki | chodzenie / jazda |
| Mysz (kliknij ekran) | rozglądanie się |
| Shift | bieg |
| Spacja | skok (pieszo) / hamulec ręczny i drift (w aucie) |
| E (lub F) | wsiądź / wysiądź, **porwij auto z ruchu** (kierowca ucieka), rozmowa ze zleceniodawcą misji, przyjęcie misji |
| Esc | zamknięcie okna misji / lakierni, pauza / menu |
| 1 / 2 | w lakierni: przemaluj (100 zł) / napraw (50 zł) |
| M | mapa i szybka podróż |
| R lub `.` / Q lub `,` | radio: następna / poprzednia stacja |
| T | radio: włącz / wyłącz |
| N | dzień / noc |
| C | zbliżenie kamery |

### Telefon (dotyk)
- **Prawdziwy wielodotyk:** joystick, gaz/hamulec i obracanie kamery działają jednocześnie – każdy palec jest śledzony osobno (Pointer Events, `pointerId`).
- **Pływający joystick:** dotknij gdziekolwiek w lewej części ekranu – środek joysticka pojawia się pod kciukiem i podąża za nim, gdy palec wyjedzie poza zasięg. Mała martwa strefa i płynna (analogowa) krzywa odpowiedzi.
- **W aucie:** joystick = analogowy skręt (słabszy przy dużej prędkości, wygładzany), **GAZ / HAM. / RĘCZNY** to przyciski „trzymaj”; można przesuwać palec między GAZ i HAM. bez odrywania.
- Przyciski reagują już przy dotknięciu (bez 300 ms opóźnienia), mają strefę trafienia większą od rysunku (min. ~64 px, rośnie z ekranem), widoczny stan wciśnięcia i opcjonalną krótką wibrację.
- Strona nie przewija się, nie powiększa, nie zaznacza tekstu i nie pokazuje menu długiego przytrzymania. Gdy palec zjedzie z ekranu, przyjdzie `pointercancel`, okno straci fokus albo karta zostanie ukryta – wszystkie wejścia są zerowane (nic się nie „zacina”).
- **Ustawienia (zapisywane w przeglądarce):** *Czułość kamery*, *Czułość sterowania*, *Rozmiar przycisków* (80–150%), *Układ dla leworęcznych* (joystick po prawej, przyciski po lewej), *Wibracje*.
- Na górze: 📻 radio, 🗺️ mapa, 🌙 dzień/noc, ⏸ pauza. Testowane w poziomie 915×412.

## Co jest w grze
- **Miasto z OSM:**
  - ok. 10 000 budynków z wysokością z OSM albo z oszacowaną wysokością;
  - ok. 5 500 odcinków dróg, chodniki z krawężnikami, przejścia dla pieszych (zebry), Wisła, jeziora, parki, lasy i ok. 45 000 drzew.
  - Obszar to ok. 9,2 × 9,2 km (50.522–50.605 N, 21.605–21.735 E): centrum, Dzików, Serbinów, Mokrzyszów, Siarkowiec oraz Jezioro Tarnobrzeskie.
- **Styl komiksowy** (Ustawienia → *Styl*): kontury, ciepłe cieniowanie „cel”, jasnoniebieskie niebo, kolorowe elewacje, czerwone dachówki, płaskie dachy z nadbudówkami, limonkowa trawa, ciemny asfalt z białymi pasami, puszyste drzewa i żywopłoty, czcionka Fredoka.
  - *Komiks (pełny)* – z konturami (domyślnie na komputerze), *Komiks (lekki)* – bez kosztownego przejścia konturów (domyślnie na telefonie), *Klasyczny* – wcześniejszy wygląd.
- **Ruch uliczny:** auta AI jeżdżą po grafie ulic z OSM prawym pasem, skręcają na skrzyżowaniach, zatrzymują się za innymi autami i przed graczem (15 / 22 / 30 aut zależnie od jakości), po chodnikach chodzą przechodnie.
  Kolizje z autami i budynkami uszkadzają auto (pasek HP). Przy 0 HP auto dymi, płonie i wybucha.
- **Policja i gwiazdki ★1–5:** potrącenie przechodnia (przewraca się i wstaje), taranowanie radiowozu, kradzież auta, zbyt szybka jazda obok policji. Radiowozy mają kontury, migające koguty i syrenę (Web Audio), ścigają cię i taranują, przy 4–5 ★ stawiają blokady, wysiadają też policjanci pieszo.
  - **Ucieczka:** zgub radiowozy (gwiazdki migają, gdy policja cię nie widzi – policja przeszukuje miejsce, gdzie cię ostatnio widziała) albo wjedź do **lakierni** (Warsztat, DULUX, przy myjni) – przemalowanie za 50 zł kasuje gwiazdki.
  - **ZATRZYMANY** – złapany przez policję: odrodzenie przed Komendą Policji (mandat 10% gotówki).
  - **ROZBITY** – tylko po wybuchu twojego auta: odrodzenie przed Szpitalem.
- **Misje (8) w prawdziwych miejscach:** świecące postacie z „!”, okienka dialogowe po polsku, znaczniki na minimapie i mapie M, nagrody w złotówkach (zł wydajesz w lakierni). Postęp i gotówka zapisują się w przeglądarce (localStorage).

| Misja | Gdzie | Zadanie | Nagroda |
|---|---|---|---|
| Taryfa do Dzikowa | Rynek | zawieź pasażera taksówką do Zamku w Dzikowie w 2,5 min | 150 zł + premia za czas |
| Pizza z Harendy | Harenda | 3 dostawy w 4 min (skuter) | 120 zł + napiwki |
| Wyścig uliczny | Urząd Miasta | wyścig z 2 rywalami przez Stację i Serbinów | 250 zł |
| Ucieczka spod PKS | Dworzec PKS | dostajesz 3 ★ – zgub policję w 3 minuty (lakiernia też się liczy) | 300 zł |
| Zgarnij auto prezesa | Serbinów | ukradnij złote auto i dowieź do Warsztatu w jak najlepszym stanie | do 350 zł |
| Rajd Głowackiego | pomnik Głowackiego | przejazd off-road w < 4 min | 400 zł |
| Kurier z leków | Stacja paliw | leki do apteki przy szpitalu w 2,5 min, max 2 stłuczki | 200 zł |
| Legenda Tarnobrzega (finał) | Muzeum Siarki | po 5 misjach: 4 ★ → Dzików, potem zgub policję | 1000 zł |

- **📻 Radio (jak w GTA):** 12 stacji w 7 gatunkach. W aucie włącza się samo i pokazuje nazwę stacji, pieszo – ikoną 📻 w HUD. Tytuł utworu pobierany na żywo (SomaFM, Radio Leliwa). Gdy stacja nie odpowiada, radio przełącza się na następną; bez internetu pokazuje „Radio offline”, a gra działa dalej. Lista stacji jest w jednej tablicy `RADIO_STATIONS` w `src/01_head.js`.

| # | Gatunek | Stacja | Strumień | Źródło |
|---|---|---|---|---|
| 1 | Rock | Radio Paradise – Rock Mix | `https://stream.radioparadise.com/rock-128` | radioparadise.com |
| 2 | Rock | SomaFM Left Coast 70s | `https://ice2.somafm.com/seventies-128-mp3` | somafm.com |
| 3 | Metal | SomaFM Metal Detector | `https://ice2.somafm.com/metal-128-mp3` | somafm.com |
| 4 | Jazz | SomaFM Sonic Universe | `https://ice2.somafm.com/sonicuniverse-128-mp3` | somafm.com |
| 5 | Jazz | SmoothJazz.com | `https://smoothjazz.cdnstream1.com/2585_128.mp3` | smoothjazz.com |
| 6 | Chillout | SomaFM Groove Salad | `https://ice2.somafm.com/groovesalad-128-mp3` | somafm.com |
| 7 | Chillout | Radio Paradise – Mellow Mix | `https://stream.radioparadise.com/mellow-128` | radioparadise.com |
| 8 | Pop | SomaFM PopTron | `https://ice2.somafm.com/poptron-128-mp3` | somafm.com |
| 9 | Pop | SomaFM Indie Pop Rocks! | `https://ice2.somafm.com/indiepop-128-mp3` | somafm.com |
| 10 | House | SomaFM Beat Blender | `https://ice2.somafm.com/beatblender-128-mp3` | somafm.com |
| 11 | House | Technolovers Deep House | `https://stream.technolovers.fm/deep-house` | technolovers.fm |
| 12 | Lokalne | Radio Leliwa (Tarnobrzeg) | `https://streaming.g-news.pl/radio/8050/leliwa` | radioleliwa.pl |

  Tytuły utworów: `https://somafm.com/songs/<kanał>.json` (SomaFM) i `https://streaming.g-news.pl/api/nowplaying/leliwa` (Leliwa). Radio Paradise nie udostępnia tytułów przeglądarce (brak CORS). Wszystkie strumienie należą do ich nadawców – gra tylko je odtwarza.
- **HUD:** prędkościomierz, minimapa z obrotem, gwiazdki, gotówka, pasek HP auta, nazwa ulicy, mapa M z szybką podróżą (niedostępna przy gwiazdkach).
- **Grafika:** cykl dnia i nocy, chunki z ukrywaniem niewidocznych, jakość Niska / Średnia / Wysoka (z cieniami).
  Kontury budynków w stylu komiksowym rysują się tylko w pobliżu kamery (Niska 200 m, Średnia 320 m, Wysoka 500 m; w trybie lekkim 75% tego). Dalej i tak zasłania je mgła, a to mocno odciąża słabsze telefony.

## 🤫 Sekret: trasy off-road
Na placu w centrum stoi **pomnik Bartosza Głowackiego**. Jego pozycja pochodzi z OSM (`historic=memorial`, „Pomnik Bartosza Głowackiego”). Obok pomnika świeci niebieski przycisk.
- **Aktywacja:** podejdź pieszo do przycisku i naciśnij **E** albo dotknij **TELEPORT**. Gra przeniesie cię razem z **terenówką 4×4** na **trasy off-road nad Jeziorem Tarnobrzeskim**, które leży ok. 3–5 km na południowy zachód od centrum.
- **Trasy:** to prawdziwe drogi gruntowe i ścieżki z OSM (`highway=track/path`), czyli 48 odcinków. Leżą na pagórkowatym terenie, który gra generuje proceduralnie.
- **Wyścig:** na trasie są 4 rampy do skoków i 7 punktów kontrolnych. Czas jest mierzony, a najlepszy wynik zapisuje się w przeglądarce.
- **Terenówka:** ma zawieszenie, które buja na nierównościach. Na ziemi jedzie szybciej niż na trawie. Zwykłe auta radzą sobie w terenie dużo gorzej.
- **Powrót:** pomarańczowy przycisk **„POWRÓT DO MIASTA”** na początku trasy przenosi cię z powrotem pod pomnik.
- **Szybka podróż:** po odkryciu oba miejsca pojawiają się na liście w mapie pod klawiszem M, oznaczone ★.

## Struktura plików
```
index.html, style.css, main.js    – gra (main.js = połączone pliki src/0*.js)
manifest.webmanifest, icon.svg     – PWA / ikona
vendor/three.module.min.js         – three.js r160
data/tarnobrzeg.json               – przetworzone dane OSM (ok. 1,7 MB)
gta-tbg-single.html                – wersja w jednym pliku, offline
src/                               – kod źródłowy w częściach
tools/                             – skrypty przetwarzania OSM i budowania wersji w jednym pliku
screenshots/                       – zrzuty ekranu z testów
```

### Odtworzenie danych
Pliki `.osm.pbf` województw podkarpackiego i świętokrzyskiego pochodzą z [Geofabrik](https://download.geofabrik.de/europe/poland.html). Następnie wykonaj:
```bash
pip install osmium
python3 tools/extract_bbox.py podkarpackie-latest.osm.pbf raw/tarnobrzeg.osm.pbf
python3 tools/extract_bbox.py swietokrzyskie-latest.osm.pbf raw/swietokrzyskie.osm.pbf
python3 tools/process_osm.py raw/tarnobrzeg.osm.pbf raw/swietokrzyskie.osm.pbf data/tarnobrzeg.json
cat src/0*.js > main.js
python3 tools/build_single.py      # -> gta-tbg-single.html
```

## Ograniczenia
- Teren jest płaski. Jedynym wyjątkiem jest proceduralnie pagórkowata strefa off-road nad jeziorem.
- Wysokość części budynków jest oszacowana na podstawie liczby pięter, typu budynku albo jego powierzchni. Budynki są uproszczonymi bryłami.
- Ruch uliczny i policja to uproszczone AI (bez świateł drogowych); auta AI korzystają z uproszczonego grafu skrzyżowań.
- Dokładność mapy zależy od kompletności danych OSM. Nazwy ulic pochodzą z OSM.
- Radio wymaga internetu; dostępność stacji zależy od nadawców. Przeglądarka może wymagać dotknięcia ekranu, zanim odtworzy dźwięk.
- Styl komiksowy (pełny) jest cięższy dla słabych telefonów – na telefonach domyślnie włącza się wariant lekki.
