# Deploy Quality Lab

Lokalne rozszerzenie Chrome do porównywania wydajności oraz wykonywania smoke-testów przed i po deployu. Pełne wymagania oraz kierunek rozwoju opisuje [ROADMAP.md](ROADMAP.md).

## Uruchomienie rozszerzenia

```bash
npm install
npm run build
```

W Chrome otwórz `chrome://extensions`, włącz **Developer mode**, wybierz **Load unpacked** i wskaż katalog `dist/`. Kliknięcie ikony rozszerzenia otwiera panel po prawej stronie.

## Silniki lokalne

Rozszerzenie nie wymaga instalacji dodatkowej aplikacji. Silnik **Chrome / CWV** mierzy pełne ładowanie strony, a **HTTP request (fetch)** wykonuje pojedynczy lokalny request z poziomu rozszerzenia. Lighthouse można uruchomić ręcznie w Chrome DevTools.

## Smoke tests i diagnostyka

Panel **Smoke** zapisuje lokalnie suite’y z URL-em bazowym, statusami HTTP, widocznym tekstem, selektorami CSS i krokami interakcji. Błędy zachowują HAR, trace DevTools oraz screenshot. Widok waterfall pokazuje najwolniejsze żądania i błędy sieciowe; żadne dane nie opuszczają przeglądarki.

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
