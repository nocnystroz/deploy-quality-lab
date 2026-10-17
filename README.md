# Deploy Speed Tester

Lokalne rozszerzenie Chrome do porównywania prędkości aplikacji przed i po deployu. Pełne wymagania oraz kierunek rozwoju opisuje [ROADMAP.md](ROADMAP.md).

## Uruchomienie rozszerzenia

```bash
npm install
npm run build
```

W Chrome otwórz `chrome://extensions`, włącz **Developer mode**, wybierz **Load unpacked** i wskaż katalog `dist/`. Kliknięcie ikony rozszerzenia otwiera panel po prawej stronie.

## Companion dla curl i Lighthouse

Test pełnego ładowania strony działa bez dodatkowej instalacji. Silniki `curl` i Lighthouse potrzebują lokalnego Node.js companiona:

```bash
cd companion
npm install
node install-host.mjs TWOJE_ID_ROZSZERZENIA
```

ID rozszerzenia jest widoczny na stronie `chrome://extensions`. Skrypt rejestruje host tylko dla podanego rozszerzenia i bieżącego użytkownika systemu. Na Windows uruchom go z terminala mającego dostęp do rejestru użytkownika.

> Wzorce blokowania zasobów są egzekwowane w silniku Chrome. Test `curl` wykonuje pojedyncze żądanie HTTP, dlatego nie ładuje podrzędnych zasobów strony do blokowania.

## Weryfikacja

```bash
npm run typecheck
npm test
npm run build
```
