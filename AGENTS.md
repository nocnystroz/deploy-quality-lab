# Zasady projektu

Produkt jest samodzielną wtyczką Chrome. Użytkownik końcowy instaluje wyłącznie rozszerzenie — bez companion application, Native Messaging, lokalnego serwera, CLI ani innego dodatkowego oprogramowania. Nowe funkcje muszą działać lokalnie w rozszerzeniu i nie mogą wprowadzać takiego wymagania.

Przed każdym commitem z wydaniem zaktualizuj `manifest.version`. Czwarty komponent ma odpowiadać numerowi commita (`git rev-list --count HEAD` po utworzeniu commita), np. `0.1.0.25`; dzięki temu zainstalowana wersja jednoznacznie wskazuje commit wydania. Wartość musi pozostać poprawnym numerycznym formatem wersji Chrome Manifest.

Po każdej zmianie w kodzie lub manifeście obowiązkowo uruchom `npm run build` przed commitem, aby odświeżyć instalowalny katalog `dist/`. Przed przekazaniem zmiany potwierdź też poprawność builda; jeśli zmiana obejmuje logikę, uruchom dodatkowo `npm run typecheck` i `npm test`.
