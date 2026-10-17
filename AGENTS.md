# Zasady projektu

Produkt jest samodzielną wtyczką Chrome. Użytkownik końcowy instaluje wyłącznie rozszerzenie — bez companion application, Native Messaging, lokalnego serwera, CLI ani innego dodatkowego oprogramowania. Nowe funkcje muszą działać lokalnie w rozszerzeniu i nie mogą wprowadzać takiego wymagania.

Przed każdym commitem z wydaniem zaktualizuj `manifest.version`. Czwarty komponent ma odpowiadać numerowi commita (`git rev-list --count HEAD` po utworzeniu commita), np. `0.1.0.25`; dzięki temu zainstalowana wersja jednoznacznie wskazuje commit wydania. Wartość musi pozostać poprawnym numerycznym formatem wersji Chrome Manifest.
