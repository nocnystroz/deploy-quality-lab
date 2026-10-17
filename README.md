# Deploy Speed Tester

Lokalne rozszerzenie Chrome do porównywania prędkości aplikacji przed i po deployu. Pełne wymagania oraz kierunek rozwoju opisuje [ROADMAP.md](ROADMAP.md).

## Uruchomienie rozszerzenia

```bash
npm install
npm run build
```

W Chrome otwórz `chrome://extensions`, włącz **Developer mode**, wybierz **Load unpacked** i wskaż katalog `dist/`. Kliknięcie ikony rozszerzenia otwiera panel po prawej stronie.

## Silniki lokalne

Rozszerzenie nie wymaga instalacji dodatkowej aplikacji. Silnik **Chrome / CWV** mierzy pełne ładowanie strony, a **HTTP request (fetch)** wykonuje pojedynczy lokalny request z poziomu rozszerzenia. Lighthouse można uruchomić ręcznie w Chrome DevTools.

## Weryfikacja

```bash
npm run typecheck
npm test
npm run build
```

## Przygotowanie pakietu lokalnego

```bash
npm run release:prepare
```

Polecenie tworzy przenośny katalog `release/deploy-speed-tester-<wersja>/` zawierający gotowe rozszerzenie dla macOS, Windows i Linux.
