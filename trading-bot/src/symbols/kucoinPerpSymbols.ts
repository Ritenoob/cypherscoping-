import fs from "fs";
import path from "path";

export type KucoinPerpSymbolsSource = {
  generatedAt?: string;
  source?: string;
  count?: number;
  symbols: string[];
};

export type LoadKucoinPerpSymbolsOptions = {
  /**
   * Repo root override. Default: process.cwd()
   * Use this if your runtime CWD is not the repo root.
   */
  rootDir?: string;

  /**
   * Prefer JSON (recommended). If JSON missing/broken, fallback to TXT if true.
   * Default: true
   */
  allowTxtFallback?: boolean;

  /**
   * Optional post-filter.
   * Examples:
   *  - only "USDTM" contracts
   *  - exclude specific symbols
   */
  filter?: (symbol: string) => boolean;

  /**
   * Stable sorting. Default: true
   */
  sort?: boolean;

  /**
   * Enforce at least N symbols or throw. Default: 1
   */
  minCount?: number;
};

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

function normalizeSymbols(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(s => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
}

function readJsonSymbols(jsonPath: string): string[] {
  const text = fs.readFileSync(jsonPath, "utf8");
  const parsed = JSON.parse(text) as Partial<KucoinPerpSymbolsSource>;
  return normalizeSymbols(parsed?.symbols);
}

function readTxtSymbols(txtPath: string): string[] {
  const text = fs.readFileSync(txtPath, "utf8");
  return text
    .split(/\r?\n/g)
    .map(l => l.trim())
    .filter(Boolean);
}

/**
 * Load KuCoin perpetual futures symbols from data/kucoin_perp_symbols.json.
 * This is the ONLY symbol source allowed for the screener.
 */
export function loadKucoinPerpSymbols(
  opts: LoadKucoinPerpSymbolsOptions = {}
): string[] {
  const {
    rootDir = process.cwd(),
    allowTxtFallback = true,
    filter,
    sort = true,
    minCount = 1
  } = opts;

  const dataDir = path.resolve(rootDir, "data");
  const jsonPath = path.join(dataDir, "kucoin_perp_symbols.json");
  const txtPath = path.join(dataDir, "kucoin_perp_symbols.txt");

  let symbols: string[] = [];

  // JSON is the canonical source
  try {
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`Missing file: ${jsonPath}`);
    }
    symbols = readJsonSymbols(jsonPath);
  } catch (err) {
    if (!allowTxtFallback) throw err;
    // Fallback to TXT only if JSON missing/broken
    if (!fs.existsSync(txtPath)) {
      throw new Error(
        `Failed to load JSON (${String(err)}), and TXT fallback missing: ${txtPath}`
      );
    }
    symbols = readTxtSymbols(txtPath);
  }

  // Normalize -> uniq -> optional filter -> stable sort
  symbols = uniq(symbols.map(s => s.trim()).filter(Boolean));
  if (filter) symbols = symbols.filter(filter);
  if (sort) symbols = symbols.sort((a, b) => a.localeCompare(b));

  if (symbols.length < minCount) {
    throw new Error(
      `KuCoin perp symbol list too small (${symbols.length}). ` +
        `Did you run: node scripts/update_kucoin_perp_symbols.mjs ?`
    );
  }

  return symbols;
}

/**
 * Convenience: common screener filter if you only want USDT-margined KuCoin perps.
 * (KuCoin uses "...USDTM" suffix for USDT-M contracts.)
 */
export function loadKucoinUsdtmPerpSymbols(
  opts: Omit<LoadKucoinPerpSymbolsOptions, "filter"> = {}
): string[] {
  return loadKucoinPerpSymbols({
    ...opts,
    filter: (s) => s.endsWith("USDTM")
  });
}

