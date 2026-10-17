import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { db } from "../shared/db";
import { newProfile } from "../shared/defaults";
import {
  artifactByKind,
  download,
  historyChartsHtml,
  historyCsv,
  historyMetrics,
  historyPdf,
  historyXlsx,
  reportHtml,
  seriesCsv,
  type HistoryMetric,
} from "../shared/export";
import { medianRun, summarize, thresholdFailures } from "../shared/statistics";
import { comparisonTone, qualityRating } from "../shared/metric-quality";
import { validateProfile } from "../shared/validation";
import type {
  Action,
  Engine,
  Series,
  SeriesKind,
  TestProfile,
  TestRun,
  Metrics,
} from "../shared/types";
import { copy, type Language } from "./i18n";
import { SmokePanelV2 } from "./smoke-panel-v2";
import { Waterfall } from "./waterfall";
import "./style.css";
import "./comparison.css";

function parseLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const defaultNetwork = { downloadKbps: 0, uploadKbps: 0, latencyMs: 0 };
const defaultViewport = {
  width: 1366,
  height: 768,
  deviceScaleFactor: 1,
  mobile: false,
};

/** Makes legacy/imported profiles show and execute the documented baseline. */
function completeProfile(profile: TestProfile): TestProfile {
  return {
    ...profile,
    cpuSlowdown: profile.cpuSlowdown ?? 1,
    network: {
      downloadKbps:
        profile.network?.downloadKbps ?? defaultNetwork.downloadKbps,
      uploadKbps: profile.network?.uploadKbps ?? defaultNetwork.uploadKbps,
      latencyMs: profile.network?.latencyMs ?? defaultNetwork.latencyMs,
    },
    viewport: {
      width: profile.viewport?.width ?? defaultViewport.width,
      height: profile.viewport?.height ?? defaultViewport.height,
      deviceScaleFactor:
        profile.viewport?.deviceScaleFactor ??
        defaultViewport.deviceScaleFactor,
      mobile: profile.viewport?.mobile ?? defaultViewport.mobile,
    },
    warmupRuns: profile.warmupRuns ?? 0,
    runIntervalMs: profile.runIntervalMs ?? 1500,
    requestTimeoutMs: profile.requestTimeoutMs ?? 30_000,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function format(ms?: number): string {
  return typeof ms === "number" ? `${Math.round(ms)} ms` : "—";
}
type ComparedMetric = keyof Metrics | "postTtfbMs";
const comparedMetrics: { key: ComparedMetric; label: string }[] = [
  { key: "totalMs", label: "Total" },
  { key: "ttfbMs", label: "TTFB" },
  { key: "postTtfbMs", label: "Total − TTFB" },
  { key: "domContentLoadedMs", label: "DOMContentLoaded" },
  { key: "loadMs", label: "Load" },
  { key: "fcpMs", label: "FCP" },
  { key: "lcpMs", label: "LCP" },
  { key: "cls", label: "CLS" },
  { key: "inpMs", label: "INP" },
];
function metricValue(
  summary: Metrics | undefined,
  key: ComparedMetric,
): number | undefined {
  if (!summary) return undefined;
  if (key === "postTtfbMs")
    return typeof summary.totalMs === "number" &&
      typeof summary.ttfbMs === "number"
      ? summary.totalMs - summary.ttfbMs
      : undefined;
  return summary[key];
}
function formatMetric(key: ComparedMetric, value?: number): string {
  if (key === "cls") return typeof value === "number" ? value.toFixed(3) : "—";
  return format(value);
}
function formatDifference(
  key: ComparedMetric,
  current?: number,
  baseline?: number,
): string {
  if (typeof current !== "number" || typeof baseline !== "number") return "—";
  const difference = current - baseline;
  const sign = difference > 0 ? "+" : "";
  const absolute =
    key === "cls"
      ? `${sign}${difference.toFixed(3)}`
      : `${sign}${Math.round(difference)} ms`;
  const relative =
    baseline === 0
      ? ""
      : ` (${sign}${((difference / baseline) * 100).toFixed(1)}%)`;
  return `${absolute}${relative}`;
}
function qualityClass(metric: keyof Metrics, value?: number): string {
  const rating = qualityRating(metric, value);
  return rating ? `quality-${rating}` : "";
}
function placeTooltip(icon: HTMLElement) {
  const rect = icon.getBoundingClientRect();
  const width = Math.min(280, window.innerWidth - 28);
  const showAbove = rect.top >= 140;
  const left = Math.max(
    14,
    Math.min(rect.left, window.innerWidth - width - 14),
  );
  icon.style.setProperty("--tooltip-x", `${left}px`);
  icon.style.setProperty(
    "--tooltip-y",
    `${showAbove ? rect.top - 8 : rect.bottom + 8}px`,
  );
  icon.style.setProperty(
    "--tooltip-transform",
    showAbove ? "translateY(-100%)" : "none",
  );
  icon.style.setProperty("--tooltip-width", `${width}px`);
}
function HelpIcon({ hint }: { hint: string }) {
  return (
    <span
      className="field-help"
      data-tooltip={hint}
      aria-label={hint}
      tabIndex={0}
      onMouseEnter={(event) => placeTooltip(event.currentTarget)}
      onFocus={(event) => placeTooltip(event.currentTarget)}
    >
      ?
    </span>
  );
}
const metricNames: Record<HistoryMetric, string> = {
  totalMs: "Total",
  ttfbMs: "TTFB",
  domContentLoadedMs: "DOMContentLoaded",
  loadMs: "Load",
  fcpMs: "FCP",
  lcpMs: "LCP",
  cls: "CLS",
  inpMs: "INP",
  transferBytes: "Transfer",
  status: "HTTP status",
};
const fieldHints: Record<string, string> = {
  "Nazwa profilu":
    "Dowolna nazwa lokalna, np. „Pre-prod · home · desktop”. Nie jest wysyłana poza przeglądarkę.",
  "Profile name":
    "Local name used when saving and comparing series, e.g. “Pre-prod · home · desktop”. It is not sent outside the browser.",
  "Adresy URL":
    "Pełny adres z http:// lub https://, jeden w linii; np. https://test.example.com/oferta. Każdy adres otrzyma wskazaną liczbę runów.",
  URLs: "One complete http:// or https:// address per line, e.g. https://test.example.com/offers. Every address receives the configured number of runs.",
  Silnik:
    "Chrome / CWV wykonuje pełne renderowanie, zbiera CWV i HAR; HTTP request (fetch) mierzy tylko odpowiedź HTTP, bez JS/CWV. Lighthouse uruchom ręcznie w Chrome DevTools → Lighthouse.",
  Engine:
    "Chrome / CWV fully renders the page and captures CWV and HAR. HTTP request (fetch) measures only the HTTP response, without JS or CWV. Run Lighthouse manually from Chrome DevTools → Lighthouse.",
  Runy: "Liczba mierzonych prób po warm-upach; domyślnie 21. Więcej prób zmniejsza wpływ pojedynczych odchyleń, ale wydłuża test.",
  Runs: "Measured attempts after warm-ups; default 21. More attempts reduce the effect of single outliers but make the test longer.",
  Agregacja:
    "Wartość raportowana dla całej serii. P50 i mediana są równoważne (środkowy wynik); P75 oznacza, że 75% runów było szybszych lub równych; P90 analogicznie 90%. Wyższe percentyle lepiej pokazują ogon wolniejszych wyników.",
  Aggregate:
    "Reported value for a whole series. P50 and median are equivalent (the middle result); P75 means 75% of runs were this fast or faster; P90 means 90%. Higher percentiles expose the slower tail.",
  "Wyłącz cache":
    "Każdy run pobiera zasoby od nowa, bez cache Chrome. Włącz dla porównywalności deployów; wyłącz tylko gdy testujesz powtarzalną wizytę użytkownika.",
  "Disable cache":
    "Forces each run to fetch resources without Chrome cache. Enable for comparable deploy checks; disable only when testing a repeat visitor.",
  "Własny User-Agent":
    "Pełny tekst nagłówka, np. Mozilla/5.0 (...). Pusty = domyślny Chrome. Zmiana może przełączyć wariant mobilny lub A/B test po stronie serwera.",
  "Custom User-Agent":
    "Full header value, e.g. Mozilla/5.0 (...). Empty uses default Chrome. It can select a mobile variant or server-side A/B test.",
  "Blokowane wzorce URL":
    "Jeden wzorzec w linii, np. *://www.googletagmanager.com/* lub analytics.example.com. Blokuj tylko elementy nieistotne dla scenariusza — blokada fontów/API fałszuje wynik.",
  "Blocked URL patterns":
    "One pattern per line, e.g. *://www.googletagmanager.com/* or analytics.example.com. Block only scenario-irrelevant resources; blocking fonts or APIs distorts results.",
  Interakcje:
    "INP może powstać tylko po kliknięciu, tapnięciu lub interakcji klawiaturą. Dodaj co najmniej jedno kliknięcie; kroki wait i scroll nie tworzą INP. Test Chrome / CWV na chwilę otworzy kartę testową na pierwszym planie, ponieważ Chrome nie raportuje CWV dla dokumentu w tle.",
  Interactions:
    "INP requires a click, tap, or keyboard interaction. Add at least one click; wait and scroll steps do not create INP. Chrome / CWV briefly foregrounds its test tab because Chrome does not report CWV for a background document.",
  "Interwał między runami (ms)":
    "Przerwa w milisekundach po każdym runie; domyślnie 1500. Dozwolone ≥ 0; np. 3000 zmniejsza ryzyko rate-limitów i chwilowego przeciążenia.",
  "Interval between runs (ms)":
    "Pause after each run in milliseconds; default 1500. Allowed value is ≥ 0; e.g. 3000 reduces rate-limit and temporary-load risk.",
  "Timeout testu (ms)":
    "Maksymalny czas pojedynczego ładowania/requestu w ms; minimum 1000, domyślnie 30000. Np. 60000 dla wolnej instancji testowej.",
  "Test timeout (ms)":
    "Maximum duration of one load/request in ms; minimum 1000, default 30000. For example, use 60000 for a slow test instance.",
  "Runy rozgrzewające":
    "Niemierzone próby przed serią; zakres 0–10. Np. 2 pozwala ustabilizować cold start, ale nie trafia do mediany/Pxx.",
  "Warm-up runs":
    "Unmeasured attempts before the series; range 0–10. For example, 2 can stabilize a cold start, but does not affect median/Pxx.",
  "Szerokość viewportu":
    "Szerokość w pikselach CSS; minimum 100, domyślnie 1366. Przykład mobile: 390. Ustawiaj razem z wysokością i DPR.",
  "Viewport width":
    "Width in CSS pixels; minimum 100. Default: 1366. Example mobile width: 390. Set together with height and DPR.",
  "Wysokość viewportu":
    "Wysokość w pikselach CSS; minimum 100, domyślnie 768. Przykład mobile: 844.",
  "Viewport height":
    "Height in CSS pixels; minimum 100. Default: 768. Example mobile height: 844.",
  "Skala DPR":
    "Device Pixel Ratio, bez jednostki; domyślnie 1 dla zwykłego desktopu. Użyj 2 dla Retina/większości telefonów albo 3 dla gęstych ekranów mobilnych.",
  "DPR scale":
    "Device Pixel Ratio, no unit. Default: 1 for a regular desktop; use 2 for Retina/most phones and 3 for dense mobile screens.",
  "Tryb mobile":
    "Włącza emulację urządzenia mobilnego w Chrome; domyślnie wyłączony. Używaj razem z viewportem np. 390×844 oraz DPR 2 lub 3.",
  "Mobile mode":
    "Enables Chrome mobile-device emulation. Default: disabled. Pair with a viewport such as 390×844 and DPR 2 or 3.",
  "CPU ×":
    "Mnożnik spowolnienia CPU Chrome (nie procent): domyślnie 1, czyli bez spowolnienia; 2 to około 2× wolniejsze wykonywanie JS, 4 około 4× wolniejsze. Dozwolone są wartości całkowite od 1; nie zmienia CPU komputera.",
  "Download kbps":
    "Limit pobierania w kilobitach na sekundę (kb/s), nie kilobajtach. 0 oznacza brak limitu (domyślnie); np. 1600 kbps ≈ 1,6 Mb/s. Dotyczy tylko testu w Chrome.",
  "Upload kbps":
    "Limit wysyłania w kilobitach na sekundę (kb/s), nie kilobajtach. 0 oznacza brak limitu (domyślnie). Dotyczy tylko testu w Chrome.",
  "Latency ms":
    "Sztucznie dodane opóźnienie sieci w milisekundach przed transferem danych; 0 ms jest wartością domyślną. Np. 150 ms symuluje wolniejsze połączenie. Dotyczy tylko testu w Chrome.",
  "CPU / ograniczenie sieci (opcjonalnie)":
    "Domyślna emulacja desktopowa: CPU ×1, download/upload bez limitu (0 kbps) i 0 ms opóźnienia. Zmień wartości wyłącznie, gdy świadomie porównujesz warunki użytkownika.",
  "CPU / network throttling (optional)":
    "Optional end-user-condition simulation. CPU is a multiplier, not a percent; network limits use kbps and latency uses ms.",
  "Progi (ms)":
    "Limity jakości: wartości czasu są w ms, regresja w %. Puste pole wyłącza dany próg; przekroczenie oznacza serię jako nieudaną.",
  "Thresholds (ms)":
    "Quality limits: time values are ms and regression is %. An empty value disables a threshold; exceeding it fails the series.",
  Total: "Maksymalny czas całkowity w ms; np. 3000 oznacza alert powyżej 3 s.",
  TTFB: "Maksymalny czas do pierwszego bajtu w ms; np. 800 oznacza alert powyżej 0,8 s.",
  LCP: "Maksymalny Largest Contentful Paint w ms; np. 2500 odpowiada zalecanemu progowi 2,5 s.",
  "Regresja %":
    "Maksymalna dopuszczalna zmiana Total względem baseline w procentach; np. 10 oznacza alert przy pogorszeniu większym niż 10%.",
  "Regression %":
    "Maximum permitted Total regression versus baseline, in percent; e.g. 10 alerts when it becomes more than 10% slower.",
  "Liczba przechowywanych serii":
    "Liczba najnowszych serii zachowanych lokalnie; zakres 1–1000. Np. 50 ogranicza rozmiar IndexedDB i artefaktów.",
  "Series to retain":
    "Number of newest series retained locally; range 1–1000. For example, 50 limits IndexedDB and artifact size.",
  "Selektor CSS":
    'Selektor CSS elementu do kliknięcia, np. button#cookie-accept lub [data-testid="close-modal"]. Musi wskazywać dokładnie element interaktywny.',
  "CSS selector":
    'CSS selector for the clicked element, e.g. button#cookie-accept or [data-testid="close-modal"]. It must point to the actual interactive element.',
  "Timeout ms":
    "Czas oczekiwania na pojawienie się elementu w ms; np. 3000. Wartość 0 oznacza tylko jedną natychmiastową próbę.",
  "Scroll X": "Docelowa pozioma pozycja scrolla w px; zwykle 0.",
  "Scroll Y":
    "Docelowa pionowa pozycja scrolla w px; np. 500 przewija stronę o 500 px od góry.",
};

function RunSpread({
  runs,
  title,
  failed,
}: {
  runs: TestRun[];
  title: string;
  failed: string;
}) {
  const measured = runs.filter(
    (run): run is TestRun & { metrics: NonNullable<TestRun["metrics"]> } =>
      typeof run.metrics?.totalMs === "number",
  );
  if (!measured.length) return null;
  const max = Math.max(...measured.map((run) => run.metrics.totalMs), 1);
  return (
    <div className="run-spread" aria-label={title}>
      <small>{title}</small>
      {runs.map((run) =>
        run.metrics ? (
          <div className="spread-row" key={run.id}>
            <span>#{run.index}</span>
            <i
              style={{
                width: `${Math.max(3, (run.metrics.totalMs / max) * 100)}%`,
              }}
            />
            <b>{format(run.metrics.totalMs)}</b>
          </div>
        ) : (
          <div className="spread-row failed-run" key={run.id}>
            <span>#{run.index}</span>
            <b>{failed}</b>
          </div>
        ),
      )}
    </div>
  );
}

function ComparisonTable({
  baseline,
  current,
  language,
}: {
  baseline?: Metrics;
  current?: Metrics;
  language: Language;
}) {
  const labels =
    language === "pl"
      ? ["Wskaźnik", "Przed", "Po", "Różnica"]
      : ["Metric", "Before", "After", "Difference"];
  return (
    <div
      className="comparison-table"
      aria-label={
        language === "pl" ? "Porównanie wyników" : "Result comparison"
      }
    >
      <table>
        <thead>
          <tr>
            {labels.map((label) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparedMetrics.map(({ key, label }) => {
            const before = metricValue(baseline, key);
            const after = metricValue(current, key);
            const tone = comparisonTone(after, before);
            const quality =
              key === "postTtfbMs" ? "" : qualityClass(key, after);
            return (
              <tr key={key}>
                <th>{label}</th>
                <td>{formatMetric(key, before)}</td>
                <td className={quality}>{formatMetric(key, after)}</td>
                <td className={tone ? `comparison-${tone}` : ""}>
                  {formatDifference(key, after, before)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <small>
        {language === "pl"
          ? "Kolor wartości: zielony — dobry, bursztynowy — wymaga poprawy, czerwony — słaby (progi CWV). Kolor różnicy: zielony — poprawa, czerwony — regresja."
          : "Value colour: green — good, amber — needs improvement, red — poor (CWV thresholds). Difference colour: green — improvement, red — regression."}
      </small>
    </div>
  );
}

function App() {
  const [lang, setLang] = useState<Language>("pl");
  const t = copy[lang];
  const [profiles, setProfiles] = useState<TestProfile[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [profile, setProfile] = useState<TestProfile>(newProfile());
  const [tab, setTab] = useState<"profile" | "results" | "smoke">("profile");
  const [kind, setKind] = useState<SeriesKind>("before");
  const [label, setLabel] = useState("");
  const [running, setRunning] = useState(false);
  const [debug, setDebug] = useState(false);
  const [debugLog, setDebugLog] = useState<
    { at: string; level: "info" | "error"; message: string }[]
  >([]);
  const [pickerStatus, setPickerStatus] = useState<"active" | "cancelled" | "">(
    "",
  );
  const [historyFilter, setHistoryFilter] = useState("");
  const [progress, setProgress] = useState<
    { done: number; total: number } | undefined
  >();
  const [retention, setRetention] = useState(50);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [exportMetrics, setExportMetrics] = useState<HistoryMetric[]>([
    ...historyMetrics,
  ]);
  const cancelRef = useRef(false);
  const [referenceId, setReferenceId] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const selectedReference = useMemo(
    () =>
      series.find((item) => item.id === referenceId) ??
      series.find(
        (item) => item.profileId === profile.id && item.kind === "before",
      ),
    [series, profile.id, referenceId],
  );
  const reload = async () => {
    setProfiles(
      (await db.profiles.list()).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    );
    setSeries(
      (await db.series.list()).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    );
  };
  useEffect(() => {
    void reload();
    chrome.storage.local
      .get({ retention: 50, deployQualityDisclaimerAccepted: false })
      .then((value) => {
        setRetention(value.retention);
        setDisclaimerAccepted(value.deployQualityDisclaimerAccepted);
      });
  }, []);
  useEffect(() => {
    const listener = (message: { type?: string; selector?: string }) => {
      if (message.type === "selector-picked" && message.selector) {
        setProfile((current) => ({
          ...current,
          actions: [
            ...current.actions,
            { type: "click", selector: message.selector!, timeoutMs: 3000 },
          ],
          updatedAt: new Date().toISOString(),
        }));
        setPickerStatus("");
      }
      if (message.type === "selector-picker-cancelled")
        setPickerStatus("cancelled");
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);
  useEffect(() => {
    const setup = (icon: HTMLSpanElement, hint: string) => {
      const place = () => placeTooltip(icon);
      icon.dataset.tooltip = hint;
      icon.setAttribute("aria-label", hint);
      icon.onmouseenter = place;
      icon.onfocus = place;
    };
    const decorate = () => {
      document.querySelectorAll("label").forEach((label) => {
        const control = label.querySelector(
          "input, textarea, select",
        ) as HTMLElement | null;
        const key = Array.from(label.childNodes)
          .filter(
            (node) =>
              !(
                node instanceof HTMLElement &&
                node.classList.contains("field-help")
              ),
          )
          .map((node) => node.textContent)
          .join("")
          .trim();
        if (control) {
          let icon = label.querySelector(
            ":scope > .field-help",
          ) as HTMLSpanElement | null;
          const hint =
            fieldHints[key] ?? icon?.dataset.tooltip ?? control.title ?? key;
          control.title = hint;
          if (!icon) {
            icon = document.createElement("span");
            icon.className = "field-help";
            icon.textContent = "?";
            icon.tabIndex = 0;
            label.append(icon);
          }
          setup(icon, hint);
        }
      });
      document.querySelectorAll("input[aria-label]").forEach((control) => {
        const key = control.getAttribute("aria-label") ?? "";
        const hint = fieldHints[key] ?? (control as HTMLElement).title ?? key;
        (control as HTMLElement).title = hint;
        let icon = control.nextElementSibling?.classList.contains("field-help")
          ? (control.nextElementSibling as HTMLSpanElement)
          : null;
        if (!icon) {
          icon = document.createElement("span");
          icon.className = "field-help inline-field-help";
          icon.textContent = "?";
          icon.tabIndex = 0;
          control.insertAdjacentElement("afterend", icon);
        }
        setup(icon, hint);
      });
    };
    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [tab, lang, disclaimerAccepted]);
  const patch = (change: Partial<TestProfile>) =>
    setProfile((current) => ({
      ...current,
      ...change,
      updatedAt: new Date().toISOString(),
    }));
  const logDebug = (message: string, level: "info" | "error" = "info") => {
    if (debug)
      setDebugLog((current) => [
        ...current.slice(-79),
        { at: new Date().toLocaleTimeString(lang), level, message },
      ]);
  };
  const save = async () => {
    await db.profiles.put(profile);
    await reload();
  };
  const chooseProfile = (item: TestProfile) => {
    setProfile(completeProfile(item));
    setTab("profile");
  };
  const run = async () => {
    const errors = validateProfile(profile);
    if (errors.length) {
      alert(errors.join("\n"));
      return;
    }
    cancelRef.current = false;
    setRunning(true);
    const runs: TestRun[] = [];
    const urls = profile.urls.filter(Boolean);
    const executionProfile = { ...profile, debugMode: debug };
    const total = urls.length * (profile.warmupRuns + profile.runs);
    let done = 0;
    setProgress({ done, total });
    logDebug(
      `Start: ${kind}, ${urls.length} URL, ${profile.runs} runów, silnik ${profile.engine}.`,
    );
    try {
      for (
        let warmup = 0;
        warmup < profile.warmupRuns && !cancelRef.current;
        warmup++
      )
        for (const url of urls) {
          if (cancelRef.current) break;
          const warmupResult = (await chrome.runtime.sendMessage({
            type: profile.engine === "browser" ? "run-browser" : "run-fetch",
            profile: executionProfile,
            url,
            index: -warmup - 1,
          })) as TestRun | { error: string };
          logDebug(
            "error" in warmupResult
              ? `Warm-up ${warmup + 1}: błąd ${warmupResult.error}`
              : `Warm-up ${warmup + 1}: ${Math.round(warmupResult.durationMs)} ms.`,
            "error" in warmupResult ? "error" : "info",
          );
          setProgress({ done: ++done, total });
          if (!cancelRef.current) await sleep(profile.runIntervalMs ?? 1500);
        }
      for (const url of urls)
        for (let i = 1; i <= profile.runs && !cancelRef.current; i++) {
          const message =
            profile.engine === "browser" ? "run-browser" : "run-fetch";
          const response = (await chrome.runtime.sendMessage({
            type: message,
            profile: executionProfile,
            url,
            index: i,
          })) as TestRun | { error: string };
          runs.push(
            "error" in response
              ? {
                  id: crypto.randomUUID(),
                  url,
                  index: i,
                  startedAt: new Date().toISOString(),
                  durationMs: 0,
                  error: response.error,
                }
              : response,
          );
          logDebug(
            "error" in response
              ? `Run ${i}: błąd ${response.error}`
              : `Run ${i}: ${Math.round(response.metrics?.totalMs ?? response.durationMs)} ms, TTFB ${Math.round(response.metrics?.ttfbMs ?? 0)} ms.`,
            "error" in response ? "error" : "info",
          );
          setProgress({ done: ++done, total });
          if (!cancelRef.current) await sleep(profile.runIntervalMs ?? 1500);
        }
      const summary = summarize(runs, profile.aggregate);
      const reference = kind === "after" ? selectedReference : undefined;
      const kept = medianRun(runs);
      for (const run of runs) if (run.id !== kept?.id) delete run.artifacts;
      if (!runs.length) return;
      const item: Series = {
        id: crypto.randomUUID(),
        profileId: profile.id,
        profileName: profile.name,
        profileSnapshot: structuredClone(executionProfile),
        kind,
        label:
          label ||
          (kind === "before" ? t.before : kind === "after" ? t.after : "Test"),
        createdAt: new Date().toISOString(),
        runs,
        aggregate: profile.aggregate,
        summary,
        thresholdFailures: [
          ...thresholdFailures(summary, profile.thresholds, reference),
          ...(cancelRef.current ? [t.partial] : []),
        ],
        referenceSeriesId: reference?.id,
      };
      await db.series.put(item);
      await db.profiles.put(profile);
      logDebug(
        `Zapisano serię „${item.label}”: ${runs.length} runów${cancelRef.current ? " (częściowa)" : ""}.`,
      );
      setTab("results");
      await reload();
    } catch (error) {
      logDebug(`Błąd serii: ${String(error)}`, "error");
      throw error;
    } finally {
      setRunning(false);
      setProgress(undefined);
    }
  };
  const addAction = (action: Action) =>
    patch({ actions: [...profile.actions, action] });
  const pickElement = async () => {
    const response = (await chrome.runtime.sendMessage({
      type: "start-selector-picker",
    })) as { ok: boolean; error?: string };
    if (!response.ok) {
      alert(response.error);
      return;
    }
    setPickerStatus("active");
  };
  const useCurrentUrl = async () => {
    const response = (await chrome.runtime.sendMessage({
      type: "use-current-url",
    })) as { ok: boolean; url?: string; error?: string };
    if (!response.ok || !response.url) {
      alert(response.error);
      return;
    }
    patch({
      urls: profile.urls.includes(response.url)
        ? profile.urls
        : [...profile.urls, response.url],
    });
  };
  const validateActions = async () => {
    const selectors = profile.actions
      .filter(
        (action): action is Extract<Action, { type: "click" }> =>
          action.type === "click",
      )
      .map((action) => action.selector);
    if (!selectors.length) return;
    const result = (await chrome.runtime.sendMessage({
      type: "validate-actions",
      selectors,
    })) as {
      ok: boolean;
      error?: string;
      checks?: { selector: string; found: boolean }[];
    };
    alert(
      result.ok
        ? (result.checks ?? [])
            .map((check) => `${check.found ? "✓" : "×"} ${check.selector}`)
            .join("\n")
        : result.error,
    );
  };
  const importProfile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as TestProfile;
      const imported = completeProfile({
        ...newProfile(),
        ...parsed,
        id: crypto.randomUUID(),
        name: `${parsed.name} (import)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setProfile(imported);
    } catch {
      alert("Nieprawidłowy plik profilu JSON.");
    }
  };
  const duplicateProfile = () => {
    const now = new Date().toISOString();
    setProfile({
      ...profile,
      id: crypto.randomUUID(),
      name: `${profile.name} (copy)`,
      createdAt: now,
      updatedAt: now,
    });
  };
  const deleteProfile = async (item: TestProfile) => {
    if (!confirm(`${t.delete} “${item.name}”?`)) return;
    await db.profiles.delete(item.id);
    if (item.id === profile.id) setProfile(newProfile());
    await reload();
  };
  const visibleSeries = series.filter((item) =>
    `${item.label} ${item.profileName} ${item.kind}`
      .toLocaleLowerCase()
      .includes(historyFilter.toLocaleLowerCase()),
  );
  const toggleExportMetric = (metric: HistoryMetric) =>
    setExportMetrics((current) =>
      current.includes(metric)
        ? current.filter((item) => item !== metric)
        : [...current, metric],
    );
  if (!disclaimerAccepted)
    return (
      <main className="disclaimer">
        <section>
          <select
            aria-label="Language"
            value={lang}
            onChange={(event) => setLang(event.target.value as Language)}
          >
            <option value="pl">PL</option>
            <option value="en">EN</option>
          </select>
          <img src="/assets/deploy-quality-lab-icon.png" alt="" />
          <h1>Deploy Quality Lab</h1>
          <p>{t.disclaimerIntro}</p>
          <p>{t.disclaimerWarning}</p>
          <label className="check">
            <input
              type="checkbox"
              onChange={(event) => {
                if (event.target.checked) {
                  chrome.storage.local.set({
                    deployQualityDisclaimerAccepted: true,
                  });
                  setDisclaimerAccepted(true);
                }
              }}
            />
            {t.disclaimerAccept}
          </label>
        </section>
      </main>
    );
  return (
    <main>
      <header>
        <div>
          <b>Deploy Quality Lab</b>
          <small>local performance & smoke tests</small>
        </div>
        <div className="header-actions">
          <button
            title={t.detached}
            onClick={() =>
              void chrome.runtime.sendMessage({ type: "open-detached-window" })
            }
          >
            ↗
          </button>
          <select
            aria-label="Language"
            value={lang}
            onChange={(e) => setLang(e.target.value as Language)}
          >
            <option value="pl">PL</option>
            <option value="en">EN</option>
          </select>
        </div>
      </header>
      <div className="workspace">
        <nav>
          <small>{lang === "pl" ? "OBSZAR ROBOCZY" : "WORKSPACE"}</small>
          <button
            className={tab === "profile" ? "active" : ""}
            onClick={() => setTab("profile")}
          >
            ▣ {t.profiles}
          </button>
          <button
            className={tab === "results" ? "active" : ""}
            onClick={() => setTab("results")}
          >
            ▤ {t.results} <em>{series.length}</em>
          </button>
          <button
            className={tab === "smoke" ? "active" : ""}
            onClick={() => setTab("smoke")}
          >
            ⚡ Smoke
          </button>
        </nav>
        {tab === "smoke" ? (
          <SmokePanelV2 lang={lang} />
        ) : tab === "profile" ? (
          <section className="content">
            <label>
              {t.profileName}
              <HelpIcon hint={fieldHints[t.profileName]} />
              <input
                value={profile.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <label>
              {t.url}
              <HelpIcon hint={fieldHints[t.url]} />
              <textarea
                value={profile.urls.join("\n")}
                onChange={(e) => patch({ urls: parseLines(e.target.value) })}
                placeholder="https://test.example.com"
              />
            </label>
            <div className="url-actions">
              <button
                onClick={() => void useCurrentUrl()}
                title={
                  lang === "pl"
                    ? "Dodaj adres aktywnej karty http(s)."
                    : "Add the active http(s) tab URL."
                }
              >
                ⌁ {lang === "pl" ? "Użyj bieżącej strony" : "Use current page"}
              </button>
            </div>
            <div className="grid">
              <label>
                {t.engine}
                <HelpIcon hint={fieldHints[t.engine]} />
                <select
                  value={profile.engine}
                  onChange={(e) => patch({ engine: e.target.value as Engine })}
                >
                  <option value="browser">Chrome / CWV</option>
                  <option value="fetch">HTTP request (fetch)</option>
                </select>
              </label>
              <label>
                {t.runs}
                <HelpIcon hint={fieldHints[t.runs]} />
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={profile.runs}
                  onChange={(e) =>
                    patch({ runs: Math.max(1, Number(e.target.value)) })
                  }
                />
              </label>
              <label>
                {t.aggregate}
                <HelpIcon hint={fieldHints[t.aggregate]} />
                <select
                  value={profile.aggregate}
                  onChange={(e) =>
                    patch({
                      aggregate: e.target.value as TestProfile["aggregate"],
                    })
                  }
                >
                  <option value="p50">P50</option>
                  <option value="median">Mediana</option>
                  <option value="p75">P75</option>
                  <option value="p90">P90</option>
                </select>
              </label>
            </div>
            <label className="check">
              {t.cache}
              <HelpIcon hint={fieldHints[t.cache]} />
              <input
                type="checkbox"
                checked={profile.disableCache}
                onChange={(e) => patch({ disableCache: e.target.checked })}
              />
            </label>
            <fieldset>
              <legend>{t.throttling}</legend>
              <div className="grid">
                <label>
                  CPU ×<HelpIcon hint={fieldHints["CPU ×"]} />
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={profile.cpuSlowdown ?? 1}
                    onChange={(e) =>
                      patch({
                        cpuSlowdown: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                  />
                </label>
                <label>
                  Download kbps
                  <HelpIcon hint={fieldHints["Download kbps"]} />
                  <input
                    type="number"
                    min="0"
                    value={profile.network?.downloadKbps ?? 0}
                    onChange={(e) =>
                      patch({
                        network: {
                          downloadKbps: Math.max(
                            0,
                            Number(e.target.value) || 0,
                          ),
                          uploadKbps: profile.network?.uploadKbps ?? 0,
                          latencyMs: profile.network?.latencyMs || 0,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  {t.upload}
                  <HelpIcon hint={fieldHints[t.upload]} />
                  <input
                    type="number"
                    min="0"
                    value={profile.network?.uploadKbps ?? 0}
                    onChange={(e) =>
                      patch({
                        network: {
                          downloadKbps: profile.network?.downloadKbps ?? 0,
                          uploadKbps: Math.max(0, Number(e.target.value) || 0),
                          latencyMs: profile.network?.latencyMs || 0,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Latency ms
                  <HelpIcon hint={fieldHints["Latency ms"]} />
                  <input
                    type="number"
                    min="0"
                    value={profile.network?.latencyMs ?? 0}
                    onChange={(e) =>
                      patch({
                        network: {
                          downloadKbps: profile.network?.downloadKbps ?? 0,
                          uploadKbps: profile.network?.uploadKbps ?? 0,
                          latencyMs: Number(e.target.value) || 0,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  {t.warmups}
                  <HelpIcon hint={fieldHints[t.warmups]} />
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={profile.warmupRuns}
                    onChange={(e) =>
                      patch({ warmupRuns: Math.max(0, Number(e.target.value)) })
                    }
                  />
                </label>
                <label>
                  {t.viewportWidth}
                  <HelpIcon hint={fieldHints[t.viewportWidth]} />
                  <input
                    type="number"
                    min="100"
                    value={profile.viewport?.width ?? defaultViewport.width}
                    onChange={(e) =>
                      patch({
                        viewport: {
                          width:
                            Number(e.target.value) || defaultViewport.width,
                          height:
                            profile.viewport?.height || defaultViewport.height,
                          deviceScaleFactor:
                            profile.viewport?.deviceScaleFactor ||
                            defaultViewport.deviceScaleFactor,
                          mobile:
                            profile.viewport?.mobile || defaultViewport.mobile,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  {t.viewportHeight}
                  <HelpIcon hint={fieldHints[t.viewportHeight]} />
                  <input
                    type="number"
                    min="100"
                    value={profile.viewport?.height ?? defaultViewport.height}
                    onChange={(e) =>
                      patch({
                        viewport: {
                          width:
                            profile.viewport?.width || defaultViewport.width,
                          height:
                            Number(e.target.value) || defaultViewport.height,
                          deviceScaleFactor:
                            profile.viewport?.deviceScaleFactor ||
                            defaultViewport.deviceScaleFactor,
                          mobile:
                            profile.viewport?.mobile || defaultViewport.mobile,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  {t.dpr}
                  <HelpIcon hint={fieldHints[t.dpr]} />
                  <input
                    type="number"
                    min="1"
                    step="0.25"
                    value={
                      profile.viewport?.deviceScaleFactor ??
                      defaultViewport.deviceScaleFactor
                    }
                    onChange={(e) =>
                      patch({
                        viewport: {
                          width:
                            profile.viewport?.width || defaultViewport.width,
                          height:
                            profile.viewport?.height || defaultViewport.height,
                          deviceScaleFactor:
                            Number(e.target.value) ||
                            defaultViewport.deviceScaleFactor,
                          mobile:
                            profile.viewport?.mobile || defaultViewport.mobile,
                        },
                      })
                    }
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={profile.viewport?.mobile ?? false}
                    onChange={(e) =>
                      patch({
                        viewport: {
                          width:
                            profile.viewport?.width || defaultViewport.width,
                          height:
                            profile.viewport?.height || defaultViewport.height,
                          deviceScaleFactor:
                            profile.viewport?.deviceScaleFactor ||
                            defaultViewport.deviceScaleFactor,
                          mobile: e.target.checked,
                        },
                      })
                    }
                  />
                  {t.mobile}
                  <HelpIcon hint={fieldHints[t.mobile]} />
                </label>
                <label>
                  {t.interval}
                  <HelpIcon hint={fieldHints[t.interval]} />
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={profile.runIntervalMs ?? 1500}
                    onChange={(e) =>
                      patch({
                        runIntervalMs: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </label>
                <label>
                  {t.requestTimeout}
                  <HelpIcon hint={fieldHints[t.requestTimeout]} />
                  <input
                    type="number"
                    min="1000"
                    step="1000"
                    value={profile.requestTimeoutMs ?? 30000}
                    onChange={(e) =>
                      patch({
                        requestTimeoutMs: Math.max(
                          1000,
                          Number(e.target.value) || 1000,
                        ),
                      })
                    }
                  />
                </label>
              </div>
            </fieldset>
            <label>
              {t.ua}
              <HelpIcon hint={fieldHints[t.ua]} />
              <input
                value={profile.userAgent ?? ""}
                placeholder={
                  lang === "pl" ? "Domyślny Chrome" : "Default Chrome"
                }
                onChange={(e) =>
                  patch({ userAgent: e.target.value || undefined })
                }
              />
            </label>
            <label>
              {t.blocks}
              <HelpIcon hint={fieldHints[t.blocks]} />
              <textarea
                value={profile.blockedPatterns.join("\n")}
                onChange={(e) =>
                  patch({ blockedPatterns: parseLines(e.target.value) })
                }
                placeholder={
                  lang === "pl"
                    ? "Brak blokad (domyślnie)"
                    : "No blocks (default)"
                }
              />
            </label>
            <fieldset>
              <legend>{t.thresholds}</legend>
              <div className="grid">
                <label>
                  {t.metricTotal}
                  <HelpIcon hint={fieldHints[t.metricTotal]} />
                  <input
                    type="number"
                    value={profile.thresholds.totalMs ?? ""}
                    placeholder={lang === "pl" ? "wyłączony" : "disabled"}
                    onChange={(e) =>
                      patch({
                        thresholds: {
                          ...profile.thresholds,
                          totalMs: Number(e.target.value) || undefined,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  {t.metricTtfb}
                  <HelpIcon hint={fieldHints[t.metricTtfb]} />
                  <input
                    type="number"
                    value={profile.thresholds.ttfbMs ?? ""}
                    placeholder={lang === "pl" ? "wyłączony" : "disabled"}
                    onChange={(e) =>
                      patch({
                        thresholds: {
                          ...profile.thresholds,
                          ttfbMs: Number(e.target.value) || undefined,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  {t.metricLcp}
                  <HelpIcon hint={fieldHints[t.metricLcp]} />
                  <input
                    type="number"
                    value={profile.thresholds.lcpMs ?? ""}
                    placeholder={lang === "pl" ? "wyłączony" : "disabled"}
                    onChange={(e) =>
                      patch({
                        thresholds: {
                          ...profile.thresholds,
                          lcpMs: Number(e.target.value) || undefined,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  {t.regression}
                  <HelpIcon hint={fieldHints[t.regression]} />
                  <input
                    type="number"
                    min="0"
                    value={profile.thresholds.regressionPercent ?? ""}
                    placeholder={lang === "pl" ? "wyłączony" : "disabled"}
                    onChange={(e) =>
                      patch({
                        thresholds: {
                          ...profile.thresholds,
                          regressionPercent:
                            Number(e.target.value) || undefined,
                        },
                      })
                    }
                  />
                </label>
              </div>
            </fieldset>
            <fieldset>
              <legend>
                {t.actions}
                <HelpIcon hint={fieldHints[t.actions]} />
              </legend>
              {profile.actions.map((action, index) => (
                <div className="action" key={index}>
                  {action.type === "click" ? (
                    <>
                      <span>click</span>
                      <input
                        aria-label={t.selector}
                        value={action.selector}
                        onChange={(e) =>
                          patch({
                            actions: profile.actions.map((item, i) =>
                              i === index
                                ? { ...action, selector: e.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                      <input
                        aria-label={t.timeout}
                        type="number"
                        min="0"
                        value={action.timeoutMs}
                        onChange={(e) =>
                          patch({
                            actions: profile.actions.map((item, i) =>
                              i === index
                                ? {
                                    ...action,
                                    timeoutMs: Number(e.target.value) || 0,
                                  }
                                : item,
                            ),
                          })
                        }
                      />
                    </>
                  ) : action.type === "wait" ? (
                    <>
                      <span>wait</span>
                      <input
                        aria-label={t.timeout}
                        type="number"
                        value={action.durationMs}
                        onChange={(e) =>
                          patch({
                            actions: profile.actions.map((item, i) =>
                              i === index
                                ? {
                                    ...action,
                                    durationMs: Number(e.target.value) || 0,
                                  }
                                : item,
                            ),
                          })
                        }
                      />
                    </>
                  ) : (
                    <>
                      <span>scroll</span>
                      <input
                        aria-label={t.scrollX}
                        type="number"
                        value={action.x}
                        onChange={(e) =>
                          patch({
                            actions: profile.actions.map((item, i) =>
                              i === index
                                ? { ...action, x: Number(e.target.value) || 0 }
                                : item,
                            ),
                          })
                        }
                      />
                      <input
                        aria-label={t.scrollY}
                        type="number"
                        value={action.y}
                        onChange={(e) =>
                          patch({
                            actions: profile.actions.map((item, i) =>
                              i === index
                                ? { ...action, y: Number(e.target.value) || 0 }
                                : item,
                            ),
                          })
                        }
                      />
                    </>
                  )}
                  <button
                    onClick={() =>
                      patch({
                        actions: profile.actions.filter((_, i) => i !== index),
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="button-row">
                <button onClick={() => void pickElement()}>
                  {t.pickElement}
                </button>
                <button
                  onClick={() =>
                    addAction({
                      type: "click",
                      selector: "button#cookie-accept",
                      timeoutMs: 3000,
                    })
                  }
                >
                  + click
                </button>
                <button
                  onClick={() => addAction({ type: "wait", durationMs: 1000 })}
                >
                  + wait
                </button>
                <button
                  onClick={() => addAction({ type: "scroll", x: 0, y: 500 })}
                >
                  + scroll
                </button>
                <button onClick={() => void validateActions()}>
                  {t.validateActions}
                </button>
              </div>
              {pickerStatus && (
                <small>
                  {pickerStatus === "active"
                    ? t.pickerActive
                    : t.pickerCancelled}
                </small>
              )}
            </fieldset>
            <div className="button-row">
              <button className="secondary" onClick={save}>
                {t.save}
              </button>
              <button onClick={duplicateProfile}>{t.duplicate}</button>
              <button
                onClick={() =>
                  download(
                    JSON.stringify(profile, null, 2),
                    `${profile.name}.json`,
                    "application/json",
                  )
                }
              >
                {t.exportJson}
              </button>
              <button onClick={() => importRef.current?.click()}>
                {t.importJson}
              </button>
              <input
                ref={importRef}
                hidden
                type="file"
                accept="application/json"
                onChange={(e) => void importProfile(e.target.files?.[0])}
              />
            </div>
            <div className="run-box">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as SeriesKind)}
              >
                <option value="before">{t.before}</option>
                <option value="after">{t.after}</option>
                <option value="custom">{t.custom}</option>
              </select>
              {kind === "after" && (
                <select
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                >
                  <option value="">{t.latestBaseline}</option>
                  {series
                    .filter((s) => s.profileId === profile.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label} · {new Date(s.createdAt).toLocaleString(lang)}
                      </option>
                    ))}
                </select>
              )}
              {kind === "custom" && (
                <input
                  placeholder={t.label}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              )}
              {progress && (
                <small>
                  {t.progress}: {progress.done}/{progress.total}
                </small>
              )}
              <button
                className="primary"
                disabled={running || !profile.urls.length}
                onClick={run}
              >
                {running ? t.running : t.run}
              </button>
              {running && (
                <button
                  className="danger"
                  onClick={() => {
                    cancelRef.current = true;
                  }}
                >
                  {t.stop}
                </button>
              )}
            </div>
            {profiles.length > 0 && (
              <details>
                <summary>{t.savedProfiles}</summary>
                {profiles.map((item) => (
                  <div
                    key={item.id}
                    style={{ display: "flex", alignItems: "center" }}
                  >
                    <button
                      className="profile-link"
                      onClick={() => chooseProfile(item)}
                    >
                      {item.name}
                    </button>
                    <button
                      aria-label={t.delete}
                      style={{
                        border: 0,
                        background: "none",
                        color: "#b42318",
                      }}
                      onClick={() => void deleteProfile(item)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </details>
            )}
          </section>
        ) : (
          <section className="content">
            <input
              className="history-filter"
              placeholder={t.filter}
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
            />
            {series.length === 0 ? (
              <p>{t.noResults}</p>
            ) : (
              visibleSeries.map((item) => {
                const reference = item.referenceSeriesId
                  ? series.find(
                      (candidate) => candidate.id === item.referenceSeriesId,
                    )
                  : undefined;
                const postTtfb =
                  typeof item.summary?.totalMs === "number" &&
                  typeof item.summary?.ttfbMs === "number"
                    ? item.summary.totalMs - item.summary.ttfbMs
                    : undefined;
                return (
                  <article className="result" key={item.id}>
                    <div>
                      <strong>{item.label}</strong>
                      <small>
                        {item.profileName} ·{" "}
                        {new Date(item.createdAt).toLocaleString(lang)}
                      </small>
                    </div>
                    {!reference && (
                      <div className="metric-grid">
                        <span>
                          <small>{t.metricTotal}</small>
                          {format(item.summary?.totalMs)}
                        </span>
                        <span
                          className={qualityClass(
                            "ttfbMs",
                            item.summary?.ttfbMs,
                          )}
                        >
                          <small>{t.metricTtfb}</small>
                          {format(item.summary?.ttfbMs)}
                        </span>
                        <span>
                          <small>{t.postTtfb}</small>
                          {format(postTtfb)}
                        </span>
                        <span
                          className={qualityClass("fcpMs", item.summary?.fcpMs)}
                        >
                          <small>{t.metricFcp}</small>
                          {format(item.summary?.fcpMs)}
                        </span>
                        <span
                          className={qualityClass("lcpMs", item.summary?.lcpMs)}
                        >
                          <small>{t.metricLcp}</small>
                          {format(item.summary?.lcpMs)}
                        </span>
                        <span
                          className={qualityClass("cls", item.summary?.cls)}
                        >
                          <small>{t.metricCls}</small>
                          {item.summary?.cls?.toFixed(3) ?? "—"}
                        </span>
                        <span
                          className={qualityClass("inpMs", item.summary?.inpMs)}
                        >
                          <small>{t.metricInp}</small>
                          {format(item.summary?.inpMs)}
                        </span>
                      </div>
                    )}
                    {reference && (
                      <ComparisonTable
                        baseline={reference.summary}
                        current={item.summary}
                        language={lang}
                      />
                    )}
                    <p
                      className={
                        item.thresholdFailures.length ? "failure" : "success"
                      }
                    >
                      {item.thresholdFailures.length
                        ? item.thresholdFailures[0]
                        : "✓ OK"}
                    </p>
                    <RunSpread
                      runs={item.runs}
                      title={t.spread}
                      failed={t.failed}
                    />
                    <details>
                      <summary>
                        {t.runDetails}:{" "}
                        {item.runs.filter((run) => run.metrics).length}/
                        {item.runs.length}
                      </summary>
                      <table>
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>URL</th>
                            <th>{t.metricTotal}</th>
                            <th>{t.metricTtfb}</th>
                            <th>{t.error}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.runs.map((run) => (
                            <tr key={run.id}>
                              <td>{run.index}</td>
                              <td title={run.url}>{run.url}</td>
                              <td>{format(run.metrics?.totalMs)}</td>
                              <td>{format(run.metrics?.ttfbMs)}</td>
                              <td>{run.error ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                    <div className="button-row">
                      <button
                        onClick={() =>
                          download(
                            seriesCsv(item),
                            `${item.label}.csv`,
                            "text/csv",
                          )
                        }
                      >
                        CSV
                      </button>
                      <button
                        onClick={() =>
                          download(
                            reportHtml(item, reference),
                            `${item.label}.html`,
                            "text/html",
                          )
                        }
                      >
                        HTML
                      </button>
                      {(["har", "trace", "debug"] as const).map((type) => {
                        const artifact = artifactByKind(item, type);
                        return (
                          artifact && (
                            <button
                              key={type}
                              onClick={() =>
                                download(
                                  artifact.content,
                                  artifact.filename,
                                  artifact.mimeType,
                                )
                              }
                            >
                              {type.toUpperCase()}
                            </button>
                          )
                        );
                      })}
                      <button
                        onClick={async () => {
                          await db.series.delete(item.id);
                          await reload();
                        }}
                      >
                        {t.delete}
                      </button>
                    </div>
                    <Waterfall
                      artifact={artifactByKind(item, "har")}
                      lang={lang}
                    />
                  </article>
                );
              })
            )}
            {visibleSeries.length === 0 && <p>{t.noFilterResults}</p>}
            {series.length > 0 && (
              <fieldset className="history-export">
                <legend>{t.historyExport}</legend>
                <small>{t.historyExportHint}</small>
                <div className="metric-options">
                  {historyMetrics.map((metric) => (
                    <label className="check" key={metric}>
                      <input
                        type="checkbox"
                        checked={exportMetrics.includes(metric)}
                        onChange={() => toggleExportMetric(metric)}
                      />
                      {metricNames[metric]}
                    </label>
                  ))}
                </div>
                <div className="button-row">
                  <button onClick={() => setExportMetrics([...historyMetrics])}>
                    {t.selectAll}
                  </button>
                  <button onClick={() => setExportMetrics([])}>
                    {t.selectNone}
                  </button>
                  <button
                    disabled={!exportMetrics.length || !visibleSeries.length}
                    onClick={() =>
                      download(
                        historyCsv(visibleSeries, exportMetrics),
                        "deploy-speed-history.csv",
                        "text/csv",
                      )
                    }
                  >
                    {t.exportData}
                  </button>
                  <button
                    disabled={!exportMetrics.length || !visibleSeries.length}
                    onClick={() =>
                      void historyXlsx(visibleSeries, exportMetrics).then(
                        (file) =>
                          download(
                            file,
                            "deploy-speed-history.xlsx",
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                          ),
                      )
                    }
                  >
                    {t.exportXlsx}
                  </button>
                  <button
                    disabled={!exportMetrics.length || !visibleSeries.length}
                    onClick={() =>
                      download(
                        historyChartsHtml(visibleSeries, exportMetrics),
                        "deploy-speed-charts.html",
                        "text/html",
                      )
                    }
                  >
                    {t.exportCharts}
                  </button>
                  <button
                    disabled={!exportMetrics.length || !visibleSeries.length}
                    onClick={() =>
                      void historyPdf(visibleSeries, exportMetrics)
                        .then((file) =>
                          download(
                            file,
                            "deploy-speed-charts.pdf",
                            "application/pdf",
                          ),
                        )
                        .catch((error) =>
                          alert(`${t.exportPdf}: ${String(error)}`),
                        )
                    }
                  >
                    {t.exportPdf}
                  </button>
                </div>
              </fieldset>
            )}
            <div className="button-row">
              <label>
                {t.retention}
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={retention}
                  onChange={(e) =>
                    setRetention(Math.max(1, Number(e.target.value) || 1))
                  }
                />
              </label>
              <button
                onClick={async () => {
                  await chrome.storage.local.set({ retention });
                  const removed = await db.series.prune(retention);
                  alert(`${t.retain}: ${removed}`);
                  await reload();
                }}
              >
                {t.retain}
              </button>
              <button
                className="danger"
                onClick={async () => {
                  await db.series.clear();
                  await reload();
                }}
              >
                {t.clear}
              </button>
            </div>
          </section>
        )}
      </div>
      {debug && (
        <aside className="debug-console">
          <div>
            <strong>{t.debugLog}</strong>
            <button onClick={() => setDebugLog([])}>{t.clearLog}</button>
          </div>
          {debugLog.length ? (
            <ol>
              {debugLog.map((entry, index) => (
                <li className={entry.level} key={`${entry.at}-${index}`}>
                  <time>{entry.at}</time>
                  {entry.message}
                </li>
              ))}
            </ol>
          ) : (
            <small>{t.debugLogEmpty}</small>
          )}
        </aside>
      )}
      <footer>
        <label className="check">
          <input
            type="checkbox"
            checked={debug}
            onChange={(e) => {
              setDebug(e.target.checked);
              if (e.target.checked)
                setDebugLog([
                  {
                    at: new Date().toLocaleTimeString(lang),
                    level: "info",
                    message:
                      lang === "pl"
                        ? "Tryb debug włączony."
                        : "Debug mode enabled.",
                  },
                ]);
            }}
          />
          {t.debug}
          <HelpIcon
            hint={
              lang === "pl"
                ? "Pokazuje lokalny panel zdarzeń nad stopką i zapisuje dodatkowy artefakt DEBUG dla każdego runu. Nie wysyła danych poza przeglądarkę."
                : "Shows a local event panel above the footer and stores an extra DEBUG artifact for every run. It never sends data outside the browser."
            }
          />
        </label>
        <a
          href="https://buymeacoffee.com/m.slawinski"
          target="_blank"
          rel="noopener noreferrer"
          title="Fuel my creativity with a small caffeine donation! ⚡"
        >
          ☕ {t.coffee}
        </a>
        <small>v0.1.0 · local only</small>
        <small className="manual-tip">
          Tip:{" "}
          {lang === "pl"
            ? "załaduj dist/ jako „Rozpakowane rozszerzenie” w chrome://extensions, aby odebrać wersję ręcznie."
            : "load dist/ as an unpacked extension in chrome://extensions for manual acceptance."}
        </small>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
