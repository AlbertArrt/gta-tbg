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
Rozpakuj **`gta-tbg-web.zip`** tak, aby w katalogu głównym repozytorium leżały pliki, a nie dodatkowy folder:

```
index.html
main.js
style.css
manifest.webmanifest
icon.svg
data/tarnobrzeg.json
fonts/fredoka-subset.woff
fonts/OFL-Fredoka.txt
vendor/three.module.js
```

1. `git add . && git commit -m "GTA TBG" && git push`
2. **Settings → Pages → Source: Deploy from a branch**, gałąź `main`, katalog `/ (root)`.
3. Po chwili gra jest pod `https://<login>.github.io/<repo>/`.

Plik `gta-tbg-single.html` nie jest potrzebny na Pages. Wystarczy do gry offline.

## Sterowanie

| Komputer | Działanie |
|---|---|
| W A S D / strzałki | chodzenie / jazda |
| Mysz (kliknij ekran) | rozglądanie się |
| Shift | bieg (pieszo) / **nitro** (w aucie, po kupieniu w garażu) |
| Spacja | skok (pieszo) / hamulec ręczny i **drift → kasa** (w aucie) |
| E (lub F) | wsiądź / wysiądź, **porwij auto z ruchu** (kierowca ucieka), rozmowa ze zleceniodawcą misji, przyjęcie misji, **wejście do garażu** |
| Esc | zamknięcie okna misji / lakierni, pauza / menu |
| 1 / 2 | w lakierni: przemaluj (100 zł) / napraw (50 zł) |
| 1 – 4, ← → | w garażu: zakładki (Moje auta / Salon / Tuning / Lakier) i wybór auta |
| M | mapa: klik przenosi, przycisk **GPS** rysuje trasę |
| J | dziennik misji |
| G | wyłącz własny punkt GPS |
| H | schowaj / pokaż panel celu (nie pauzuje misji ani GPS) |
| R lub `.` / Q lub `,` | radio: następna / poprzednia stacja |
| T | radio: włącz / wyłącz |
| N | dzień / noc |
| C | zbliżenie kamery |

### Telefon (dotyk)
- **Prawdziwy wielodotyk:** joystick, gaz/hamulec i obracanie kamery działają jednocześnie – każdy palec jest śledzony osobno (Pointer Events, `pointerId`).
- **Pływający joystick:** dotknij gdziekolwiek w lewej części ekranu – środek joysticka pojawia się pod kciukiem i podąża za nim, gdy palec wyjedzie poza zasięg. Mała martwa strefa i płynna (analogowa) krzywa odpowiedzi.
- **W aucie:** joystick = analogowy skręt (słabszy przy dużej prędkości, wygładzany), **GAZ / HAM. / RĘCZNY** to przyciski „trzymaj”; można przesuwać palec między GAZ i HAM. bez odrywania. **RĘCZNY + skręt = drift.** Przycisk **🔥NITRO** pojawia się, gdy auto ma nitro.
- Przyciski reagują już przy dotknięciu (bez 300 ms opóźnienia), mają strefę trafienia większą od rysunku (min. ~64 px, rośnie z ekranem), widoczny stan wciśnięcia i opcjonalną krótką wibrację.
- Strona nie przewija się, nie powiększa, nie zaznacza tekstu i nie pokazuje menu długiego przytrzymania. Gdy palec zjedzie z ekranu, przyjdzie `pointercancel`, okno straci fokus albo karta zostanie ukryta – wszystkie wejścia są zerowane (nic się nie „zacina”).
- **Ustawienia (zapisywane w przeglądarce):** *Czułość kamery*, *Czułość sterowania*, *Rozmiar przycisków* (80–150%), *Układ dla leworęcznych* (joystick po prawej, przyciski po lewej), *Wibracje*, *Głośność silnika i efektów*.
- Na górze: 📻 radio, 📒 dziennik, 🗺️ mapa, 🌙 dzień/noc, ⏸ pauza. Testowane w poziomie 844×390 i 1280×720.

## Co jest w grze
- **Miasto z OSM:**
  - ok. 10 000 budynków z wysokością z OSM albo z oszacowaną wysokością;
  - ok. 5 500 odcinków dróg, chodniki z krawężnikami, przejścia dla pieszych (zebry), Wisła, jeziora, parki, lasy i ok. 45 000 drzew.
  - Obszar to ok. 9,2 × 9,2 km (50.522–50.605 N, 21.605–21.735 E): centrum, Dzików, Serbinów, Mokrzyszów, Siarkowiec oraz Jezioro Tarnobrzeskie.
- **Styl komiksowy** (Ustawienia → *Styl*): kontury, ciepłe cieniowanie „cel”, jasnoniebieskie niebo, kolorowe elewacje, czerwone dachówki, płaskie dachy z nadbudówkami, limonkowa trawa, ciemny asfalt z białymi pasami, puszyste drzewa i żywopłoty, czcionka Fredoka.
- **Elewacje (komiks):** jeden atlas na wszystkie ściany, bez nowych plików z sieci. Piętra są w osobnych pasach: u góry okna w rytmie kondygnacji, na parterze cokół i okno, a na najdłuższej ścianie jedno wejście (drzwi domu, drzwi klatki albo witryna z markizą, gdy OSM mówi sklep albo budynek stoi blisko centrum). Bloki (`apartments`, `residential` i duże `yes`) dostają kilka płyt balkonów. Domy ze stromym dachem mają komin, kościół i kaplica — umowną wieżyczkę. To nie są prawdziwe elewacje z OSM: w danych nie ma położenia drzwi ani balkonów.
  - **Niska:** atlas, kominy i nadbudówki dachów. Balkony są w pamięci, ale się nie rysują.
  - **Średnia:** balkony do około 130 m.
  - **Wysoka:** balkony do około 170 m.
  - **Klasyczny:** poprzednie gładkie ściany, bez tego atlasu.
  - *Komiks (pełny)* – z konturami (domyślnie na komputerze), *Komiks (lekki)* – bez kosztownego przejścia konturów (domyślnie na telefonie), *Klasyczny* – wcześniejszy wygląd.
- **Ruch uliczny:** auta AI jeżdżą po grafie ulic z OSM prawym pasem, skręcają na skrzyżowaniach, zatrzymują się za innymi autami i przed graczem (15 / 22 / 30 aut zależnie od jakości), po chodnikach chodzą przechodnie.
  Kolizje z autami i budynkami uszkadzają auto (pasek HP). Przy 0 HP auto dymi, płonie i wybucha.
- **Policja i gwiazdki ★1–5:** potrącenie przechodnia (przewraca się i wstaje), taranowanie radiowozu, kradzież auta, zbyt szybka jazda obok policji. Radiowozy mają kontury, migające koguty i syrenę (Web Audio), ścigają cię i taranują, przy 4–5 ★ stawiają blokady, wysiadają też policjanci pieszo.
  - **Ucieczka:** zgub radiowozy (gwiazdki migają, gdy policja cię nie widzi – policja przeszukuje miejsce, gdzie cię ostatnio widziała) albo wjedź do **lakierni** (Warsztat, DULUX, przy myjni) – przemalowanie za 50 zł kasuje gwiazdki.
  - **ZATRZYMANY** – złapany przez policję: odrodzenie przed Komendą Policji (mandat 50 zł + 10% gotówki).
  - **ROZBITY** – tylko po wybuchu twojego auta: odrodzenie przed Szpitalem (75 zł + 5% gotówki).
- **Misje w prawdziwych miejscach:** świecące postacie z „!”, okienka dialogowe po polsku, znaczniki na minimapie i mapie M, nagrody w złotówkach. Postęp i gotówka zapisują się w przeglądarce (`localStorage`, klucz `gtatbg_save`).
- **Dziennik (J albo 📒):** zakładki Aktywna / Dostępne / Ukończone, kroki, nagroda, rekord. Przyciski Przyjmij, GPS, Od nowa i Anuluj. Otwarty dziennik i mapa zatrzymują zegar misji.
- **Panel celu:** na krótkim ekranie (telefon w poziomie) po około 4 s zjeżdża w lewo. Zostaje zakładka pod minimapą, co najmniej 44 px, z czasem i krótkim kierunkiem. Dotknięcie albo klawisz **H** rozwija i chowa panel. Ręczny wybór zostaje na czas misji – kolejny etap sam go nie otwiera. Na wyższym ekranie panel startuje rozwinięty. Zwijanie nie pauzuje gry i nie zeruje GPS. Długi opis przewija się w wąskiej karcie, żeby nie zasłaniać jezdni.
- **GPS:** niebieska linia na minimapie i kilka strzałek na jezdni. Liczona jest po grafie ulic (tym samym, co ruch), a nad jeziorem po ścieżkach OSM. Nie idzie skrótem przez budynek ani wodę. Gdy sieć się urywa, linia staje, a napis podaje odległość w linii prostej albo „dalej pieszo”. Cel misji podmienia się sam przy kolejnym etapie. Własny cel: przycisk GPS na mapie albo tryb „Klik: GPS”. **G** albo „Anuluj GPS” kasuje własny cel.
- **Samouczek:** cztery krótkie karty przy pierwszym uruchomieniu (Pomiń / Dalej). Ponownie z menu: **Samouczek**.

| Misja | Gdzie | Zadanie | Nagroda |
|---|---|---|---|
| Taryfa do Dzikowa | Rynek | zawieź pasażera taksówką do Zamku w Dzikowie w 2,5 min | 150 zł + premia za czas |
| Pizza z Harendy | Harenda | 3 dostawy w 4 min (skuter) | 120 zł + napiwki |
| Wyścig uliczny | Urząd Miasta | wyścig z 2 rywalami przez Stację i Serbinów | 250 zł |
| Ucieczka spod PKS | Dworzec PKS | dostajesz 3 ★ – zgub policję w 3 minuty (lakiernia też się liczy) | 300 zł |
| Zgarnij auto prezesa | Serbinów | ukradnij złote auto i dowieź do Warsztatu w jak najlepszym stanie | do 350 zł |
| Rajd Głowackiego | pomnik Głowackiego | przejazd off-road w < 4 min | 400 zł |
| Kurier z leków | Stacja paliw | leki do apteki przy szpitalu w 2,5 min, max 2 stłuczki | 200 zł |
| Legenda Tarnobrzega (finał) | Muzeum Siarki | po 5 misjach fabularnych: 4 ★ → Dzików, potem zgub policję | 1000 zł |

Powyższe misje fabularne nadal płacą pełną nagrodę przy każdym zaliczeniu.

### Wyzwania (nowe, powtarzalne)
Pełna kwota tylko za pierwszym razem. Kolejny przejazd zapisuje rekord i daje **40 zł**, jeśli rekord jest lepszy. Nie da się odebrać nagrody drugi raz przez powtórkę.

| Wyzwanie | Gdzie | Zadanie | Nagroda |
|---|---|---|---|
| Kursy po mieście | postój przy Banku Pekao | 3 losowe kursy pod prawdziwe adresy (zamek, szpital, PKS, stacja, Serbinów, Barbara, targ, stadion, urząd). Limit kursu z długości ulic | 180 zł + premia za zapas czasu |
| Dostawa z targowiska | Plac Targowy | jabłka i ziemniaki, 2 losowe adresy | 150 zł + mała premia |
| Próba uliczna | Plac Tysiąclecia | solo, checkpointy: stadion → szpital → urząd → Rynek. Limit ≈ długość / 8 m/s + zapas (min. 3 min) | 230 zł |
| Próba nad jeziorem | plaża Jeziora Tarnobrzeskiego | 4 checkpointy off-road w odwrotnej kolejności niż rajd Głowackiego. Trzeba wjechać na ścieżkę (albo teleport przy pomniku) | 260 zł |
| Drift pod Lidlem | parking przy Lidlu | 800 pkt driftu w 75 s wewnątrz żółtego kółka | 210 zł (rekord = punkty) |
| Tort do Dzikowa | piekarnia Skalski | zamek bez utraty HP. Otarcie poniżej progu obrażeń się nie liczy. Kilka sekund na wyjechanie | 240 zł |

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

## 💰 Kasa, garaże i tuning (v3)
- **Zarabiasz:** misje, taksówka/napiwki, **drift** (punkty ÷ 7 = zł), **skoki** w terenie (> 0,7 s w powietrzu = 40 zł/s), **16 paczek z kasą** przy drogach (20–50 zł, odnawiają się po 4 min, widać je na minimapie z bliska).
- **Tracisz:** ZATRZYMANY = mandat 50 zł + 10% gotówki, ROZBITY = szpital 75 zł + 5% gotówki, naprawa 50 zł, lakier 100 zł.
- **Garaże (2, niebieski znacznik „G” na minimapie i mapie M):** „Garaże” i „Garaż przy Orlenie”. Podjedź / podejdź i naciśnij **E**. Komiksowe menu z dużymi przyciskami (dotyk), zakładki:
  - **Moje auta** – do 6 aut, wyjazd wybranym, naprawa, sprzedaż (50% ceny + 30% tuningu), schowanie skradzionego auta (staje się twoje).
  - **Salon** – 5 klas aut:

| Auto | Klasa | Cena | V maks. | Przysp. | Pancerz* |
|---|---|---|---|---|---|
| Kropka | hatchback (na start) | 800 zł | 42 m/s | 12 | 1,00 |
| Leliwa | sedan | 2 500 zł | 48 | 13,5 | 0,85 |
| Kosynier 4×4 | terenówka | 4 500 zł | 43 | 14,5 | 0,70 |
| Siarka GT | sportowe | 8 000 zł | 60 | 19 | 1,00 |
| Interceptor | muscle à la radiowóz | 12 000 zł | 56 | 17,5 | 0,62 |

  \* mnożnik obrażeń – mniej = twardsze auto.
  - **Tuning** (działa na fizykę):

| Część | Poziomy i ceny | Efekt na poziom |
|---|---|---|
| ⚙️ Silnik | 600 / 1 400 / 2 800 zł | +6% V maks., +12% przyspieszenia |
| 🛑 Hamulce | 300 / 700 / 1 500 zł | +15% siły hamowania |
| 🛞 Opony i zawieszenie | 400 / 900 / 1 900 zł | +10% przyczepności, +4% skrętu |
| 🛡️ Pancerz | 500 / 1 200 / 2 500 zł | −15% obrażeń |
| 🔥 Nitro | 1 500 / 3 000 zł | zastrzyk mocy (Shift / przycisk NITRO), zbiornik odnawia się powoli |

  - **Lakier** – 12 kolorów po 100 zł.
- Zapis w `localStorage` (`gtatbg_save`, wersja 3). Zapis v1/v2 (gotówka, ukończone misje, garaż, tuning, statystyki, rekordy) jest przenoszony. Dochodzą `claimed` (jednorazowe nagrody wyzwań) i `tut` (samouczek). Stary zapis dostaje Kropkę, jeśli garaż był pusty.

## 🏁 Jazda (v3)
- **Nadwozia (komiks):** Każde auto dostaje lusterka. Dodatkowo Kropka ma spojler na dachu, Leliwa krawędź klapy, Siarka GT progi i wydechy, a Interceptor szerszą atrapę nad chromem. To dodatkowe pudełka w tej samej siatce co karoseria — bez nowego światła na auto. Koła (styl komiks) mają oponę, jasną felgę i pięć ramion na boku; kręcą się jak dotąd, przednie skręcają. Nocą reflektory i tylne lampy świecą emisją. Hamulec i ręczny rozjaśniają tył; auta z ruchu robią to samo, gdy zwalniają, i tylko póki widać nadwozie (niska jakość ~85 m, średnia ~115 m, wysoka ~145 m). Koła znikają wcześniej (niska 60 m, średnia 90 m, wysoka 120 m). Lakier w garażu maluje karoserię i krawędź klapy Leliwy, nie atrapę, lusterka ani felgi.
- **Drift:** ręczny (Spacja / RĘCZNY) + skręt – tył ucieka, licznik DRIFT z mnożnikiem do ×2. Po wyjściu z driftu punkty zamieniają się w złotówki; uderzenie przerywa drift.
- **Ślady opon i dym** (pula obiektów, 1 wywołanie rysowania na typ; liczba zależna od jakości: 200 / 420 / 800 śladów), w terenie zamiast dymu – kurz.
- **Kolizje:** iskry, dźwięk zgniatania blachy, wstrząs kamery, wibracja.
- **Poprawka grafiki:** podłoże to teraz podzielona płaszczyzna podążająca za kamerą – wcześniej (także w v2) na długich prostych za miastem trawa potrafiła „przykryć” asfalt tuż przed autem.
- **Uszkodzenia:** < 60 HP – jasny dym, < 35 HP – ciemny dym, < 15 HP – ogień spod maski, 0 HP – pożar i wybuch po 5 s.

## ⚖️ Balans (v3)
| | Przed (v2) | Teraz (v3) |
|---|---|---|
| Obrażenia z uderzenia | 4 HP za każdy m/s powyżej 3 m/s | 1,5 HP/m/s powyżej 6 m/s (+0,8 powyżej 20 m/s), × pancerz |
| Uderzenie 10 / 15 / 20 m/s | 28 / 48 / 68 HP | 6 / 13,5 / 21 HP |
| Pożar przed wybuchem | 3,2 s | 5 s |
| Gwiazdki za przestępstwo (ped / taran / kradzież / prędkość), przerwa | 1,2 / 2 / 0,5 / 6 s | 2,5 / 6 / 8 / 15 s |
| Radiowozy przy ★1 / ★2 | do 1 / 2 | do 1 / 1 (wolniejsze: 80% / 87% prędkości) |
| Pojawianie się radiowozów | co 2,2 s, 110 m | ★1 co 6 s / 150 m, ★2 co 5 s / 140 m |
| Zasięg wzroku policji ★1 / ★2 | 125 m | 90 / 100 m |
| Zgubienie pościgu | 8 + 3×★ s poza wzrokiem | 5 + 2×★ s (★1 = 7 s) |
| Eskalacja w trakcie pościgu | +1★ co 50 s (do ★3) | +1★ co 90 s (do ★2) |
| Aresztowanie | < 8 m, < 2 m/s przez 3 s | < 5 m, < 1 m/s przez 5 s |
| Policjanci pieszo | od ★2, co 9 s, 7,3 m/s | od ★3, co 12 s, 6–7,3 m/s |
| Fotoradar „za szybko” | > 19,5 m/s w 38 m od policji | > 24 m/s w 28 m |
| Taranowanie radiowozu | każde zderzenie z radiowozem przy > 6 m/s | tylko gdy **ty** wjeżdżasz w radiowóz (radiowóz uderzający w ciebie nie daje gwiazdki) |
| Kary | ZATRZYMANY: 10% gotówki · ROZBITY: 50 zł + 5% | ZATRZYMANY: 50 zł + 10% · ROZBITY: 75 zł + 5% (nigdy poniżej 0 zł) |

Poprawka AI: radiowóz po przeliczeniu trasy nie zawraca już do skrzyżowania, które właśnie minął.

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
python3 tools/build_release.py
# składa src/0*.js -> main.js, gta-tbg-single.html i gta-tbg-web.zip
```

## Ograniczenia
- Teren jest płaski. Jedynym wyjątkiem jest proceduralnie pagórkowata strefa off-road nad jeziorem.
- Wysokość części budynków jest oszacowana na podstawie liczby pięter, typu budynku albo jego powierzchni. Budynki są uproszczonymi bryłami.
- Ruch uliczny i policja to uproszczone AI (bez świateł drogowych); auta AI korzystają z uproszczonego grafu skrzyżowań.
- Dokładność mapy zależy od kompletności danych OSM. Nazwy ulic pochodzą z OSM.
- Radio wymaga internetu; dostępność stacji zależy od nadawców. Przeglądarka może wymagać dotknięcia ekranu, zanim odtworzy dźwięk.
- Styl komiksowy (pełny) jest cięższy dla słabych telefonów – na telefonach domyślnie włącza się wariant lekki.
- Drzwi, balkony i kominy są umownym rysunkiem dopasowanym do typu budynku z OSM (albo do powierzchni, gdy typ to `yes`). Nie odwzorowują konkretnej kamienicy ani sklepu.
- Dźwięk silnika i efektów startuje dopiero po pierwszym dotknięciu/kliknięciu (zasada przeglądarek). Fizyka driftu jest zręcznościowa (uproszczona), auta AI z niej nie korzystają.
- Felgi i lampy są komiksowe, nie odwzorowują konkretnych felg z Tarnobrzega. Ruch uliczny nie dostaje osobnych reflektorów-spotów — tylko jaśniejszy materiał lamp.
- Ślady opon to pula (200–800 odcinków) – najstarsze znikają. Na bardzo niskim ekranie (< 500 px wysokości) karty w Salonie chowają paski statystyk, żeby zmieścić przyciski.
- GPS nie zgaduje drogi przez wodę ani przez bryłę budynku. Środek jeziora nie dostaje trasy. Punkt w środku zabudowy (np. zamek, część placów) prowadzi ulicami do ostatniego czystego miejsca, a resztę opisuje tekst („ulica się kończy”).
- Z tras off-road nie ma przejazdu ulicami do miasta: powrót to przycisk przy starcie ścieżki. Z miasta linia urywa się przed strefą jeziora; dalej jest teleport przy pomniku Głowackiego albo wjazd od plaży.
- Dziennik i mapa pauzują grę, więc stoper misji wtedy stoi.
- Teleport przy pomniku nadal uruchamia dawny przejazd z checkpointami. „Próba nad jeziorem” liczy własne cztery punkty i nie kasuje tamtego rekordu (`gtatbg_egg`).
- Graf ulic OSM bywa porozrywany (osobne komponenty). GPS dojeżdża najbliższą połączoną ulicą i nie domalowuje brakującego odcinka, chyba że krótki mostek leży już na narysowanej drodze.
