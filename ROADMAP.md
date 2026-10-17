# Deploy Quality Lab — roadmap i stan wdrożenia

## Cel

Lokalne rozszerzenie Chrome do powtarzalnego porównywania jakości wdrożenia przed i po zmianie. Dane, pomiary, HAR-y i konfiguracje pozostają w przeglądarce użytkownika. Instalacja wymaga wyłącznie rozszerzenia — bez SaaS, companion application, Native Messaging, serwera lokalnego, CLI ani dodatkowego silnika.

## Wdrożone

### Pomiary wydajności

- Profile wielu URL-i, etykiety „przed zmianą”, „po zmianie” i własne etykiety.
- Dowolna liczba runów, warm-upy, mediana, P75 albo P90.
- Dwa lokalne silniki: pełne ładowanie Chrome z CWV oraz HTTP request (fetch).
- TTFB, total time, DOMContentLoaded, load, FCP, LCP, CLS, INP, transfer i status HTTP, zależnie od silnika.
- Porównanie z baseline, procentowe delty oraz delta czasu po odjęciu TTFB.
- Konfigurowalne progi total time, TTFB, LCP i regresji.
- Cache off, User-Agent, blokady URL, viewport/DPR/mobile, CPU/network throttling, timeout i interwał między próbami (domyślnie 1500 ms).
- Interakcje: klik CSS, oczekiwanie i scroll; walidacja selektorów na aktywnej karcie.

### Diagnostyka i artefakty

- HAR oraz trace Chrome DevTools dla medianowego runu; log debug w trybie debug.
- Waterfall z filtrowaniem URL/domen, filtrem statusu HTTP i sortowaniem po czasie lub transferze.
- Eksport serii: CSV, HTML, HAR, trace i log debug.
- Eksport historii wybranych wskaźników: CSV, XLSX, HTML z wykresami i PDF. XLSX jest generowany lokalnie, bez podatnej zależności SheetJS.
- Lighthouse nie jest automatyzowany: interfejs prowadzi do ręcznego uruchomienia w Chrome DevTools → Lighthouse.

### Smoke tests

- Trwale zapisane lokalnie suite’y: URL bazowy, blokady zasobów, scenariusze, status HTTP, widoczny tekst, selektor CSS i akcje.
- Edycja, usuwanie, import oraz eksport suite’ów JSON.
- Artefakty przy błędzie: HAR, trace i screenshot.
- Wykrywanie best-effort React/Next.js w wyniku oraz presety sprawdzające standardowe kontenery #root i #__next.
- Po każdym kliknięciu scenariusz zapisuje czas interakcji, zmianę trasy SPA oraz przyrost zasobów i transferu; przydatne dla Next router, React Router i aplikacji zbudowanych Vite.

### Ergonomia i dane

- IndexedDB dla profili, serii, suite’ów i historii smoke; kasowanie pojedyncze, zbiorcze oraz retencja serii.
- Profile można zapisywać, duplikować oraz importować/eksportować jako JSON.
- Polski i angielski UI, podpowiedzi dla pól, disclaimer bezpieczeństwa, stopka z debug mode i linkiem „Buy me a coffee”.
- Domyślne dokowanie po prawej oraz otwieranie panelu w osobnym oknie.
- Nazwa produktu: Deploy Quality Lab; ikona rozszerzenia; wersja manifestu jest synchronizowana z liczbą commitów.

## Świadome granice

- Nie ma automatyzacji logowania i nie należy umieszczać w suite’ach haseł ani danych produkcyjnych.
- Rozszerzenie mierzy z lokalnej maszyny i bieżącego Chrome. Nie zastępuje testów obciążeniowych z wielu lokalizacji ani RUM.
- Wykrywanie frameworka jest informacyjne — produkcyjne aplikacje mogą ukrywać znaczniki React/Next.js.
- Lighthouse pozostaje ręczny, ponieważ automatyczny audyt wymagałby dodatkowego procesu albo nieobsługiwanej automatyzacji.

## Kontrola odbiorowa

1. Zainstaluj katalog dist/ jako unpacked extension w Chrome.
2. Utwórz profil z pięcioma runami, cache off i interwałem 1500 ms; zapisz serię „Przed zmianą”.
3. Po deployu uruchom serię „Po zmianie”, wskaż baseline i sprawdź delty total/TTFB/„Po TTFB”.
4. Pobierz HAR, trace i wybrany eksport historii.
5. Utwórz smoke suite lub preset React/Next.js, uruchom go i sprawdź zapis wyniku po restarcie Chrome.
