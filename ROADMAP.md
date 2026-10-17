# Deploy Speed Tester — roadmap

## Cel

Lokalne rozszerzenie Chrome dla developerów, które porównuje wydajność instancji testowej przed i po deployu. Nie korzysta z SaaS ani nie wysyła danych na zewnątrz. Wyniki przetrwają restart przeglądarki i można je usunąć pojedynczo albo wyczyścić zbiorczo.

## Zasady produktu

- UI działa jako prawy Chrome Side Panel, z trybem debug, stopką i odnośnikiem „Buy me a coffee”.
- Interfejs jest od początku dostępny po polsku i angielsku; teksty nie są rozproszone po komponentach.
- Seria ma etykietę `before`, `after` lub własną; można ją porównać z wcześniej zapisanym baseline albo z drugą serią z bieżącej sesji.
- Profil definiuje URL-e, liczbę runów, medianę/P75/P90, własny User-Agent, wyłączenie cache, wzorce zablokowanych adresów, progi i opcjonalne emulowanie CPU/sieci.
- Automatyzacja v1 obejmuje klik CSS, oczekiwanie i scroll — np. akceptację cookies oraz zamykanie popupów. Nie zapisuje haseł ani nie automatyzuje logowania.

## Architektura

Rozszerzenie Manifest V3 wykonuje testy pełnego ładowania przez Chrome DevTools Protocol. Zbiera czas nawigacji, TTFB, FCP, transfer, status, HAR oraz trace możliwy do otwarcia w Chrome DevTools. Artefakty pozostają wyłącznie dla medianowego runu, aby ograniczać rozmiar historii.

Lokalny Node.js companion komunikowany przez Native Messaging wykonuje prawdziwe `curl` i jeden audit Lighthouse na serię. Lighthouse jest pomocniczym artefaktem, a nie elementem agregacji wielu runów. Companion będzie dystrybuowany z instalatorami dla macOS, Windows i Linux.

## Etapy

### 0.1 — działający MVP

- Profile, serie, trwały IndexedDB storage i porównanie wyników.
- Browser engine z cache/UA/blokadami, krokami interakcji, HAR i trace.
- Curl engine przez companion oraz eksport CSV, HTML, HAR, trace i Lighthouse.
- Progi dla total time, TTFB, LCP i dopuszczalnej regresji procentowej.
- Testy jednostkowe agregacji i progów oraz instrukcja lokalnej instalacji.

### 0.2 — wiarygodność metryk

- Pomiar LCP, CLS i INP przez obserwatory instalowane przed nawigacją.
- Konfigurowalne urządzenie, viewport, throttling i warm-up runy.
- Czytelny widok rozrzutu, różnic i błędów poszczególnych runów.
- Walidacja selektorów scenariusza oraz podgląd wykonywanych kroków.

### 0.3 — ergonomia zespołowa

- Import/eksport profili JSON, duplikowanie profilu i wersjonowanie konfiguracji.
- Raport porównawczy wielu URL-i, filtrowanie historii i retencja artefaktów.
- Podpisane pakiety companion oraz instalatory trzech systemów.

## Kryteria akceptacji

1. Pięć runów strony z wyłączonym cache zwraca medianę i zapisuje wynik po restarcie Chrome.
2. Seria `after` wskazuje zmianę względem `before` i oznacza przekroczony próg.
3. Cookie banner może zostać kliknięty, a wzorzec URL zablokowany podczas testu przeglądarkowego.
4. Eksportuje się poprawny HAR medianowego runu, trace DevTools, CSV i raport HTML.
5. Brak companionu daje jasny komunikat dla curl/Lighthouse, bez utraty zapisanej historii.
