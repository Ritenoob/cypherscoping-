export type SymbolPolicyErrorCode =
  | 'E_SYMBOL_DENIED'
  | 'E_SYMBOL_NOT_ALLOWED'
  | 'E_UNIVERSE_EMPTY';

export interface SymbolPolicyConfig {
  tradingUniverse: string[];
  denylistSymbols: string[];
  defaultSymbol: string;
}

export interface SymbolPolicyValidation {
  allowed: boolean;
  normalizedSymbol: string;
  code?: SymbolPolicyErrorCode;
  reason?: string;
}

const DEFAULT_TRADING_UNIVERSE = [
  'ETHUSDTM',
  'SOLUSDTM',
  'XRPUSDTM',
  'ADAUSDTM',
  'DOGEUSDTM',
  'MATICUSDTM',
  'LINKUSDTM',
  'AVAXUSDTM',
  'DOTUSDTM',
  'UNIUSDTM',
  'ATOMUSDTM',
  'LTCUSDTM',
  'BCHUSDTM',
  'ETCUSDTM'
];

const DEFAULT_DENYLIST = ['BTC/USDT', 'BTCUSDT', 'BTCUSDTM', 'XBTUSDTM'];

function parseCsvSymbols(value?: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function canonicalizeSymbol(symbol: string): string {
  const raw = symbol.trim().toUpperCase();
  if (!raw) return raw;

  const normalized = raw.replace(/[-_:]/g, '/').replace(/\s+/g, '');
  if (normalized === 'BTC/USDT') return 'BTCUSDT';
  if (normalized === 'XBT/USDT') return 'BTCUSDT';

  const compact = normalized.replace(/\//g, '');

  if (compact === 'XBTUSDTM' || compact === 'XBTUSDT') return 'BTCUSDT';
  if (compact === 'BTCUSDTM' || compact === 'BTCUSDT') return 'BTCUSDT';

  return compact;
}

export function loadSymbolPolicy(env: NodeJS.ProcessEnv = process.env): SymbolPolicyConfig {
  const configuredUniverse = parseCsvSymbols(env.TRADING_UNIVERSE);
  const configuredDenylist = parseCsvSymbols(env.DENYLIST_SYMBOLS);

  const tradingUniverseBase = configuredUniverse.length > 0 ? configuredUniverse : DEFAULT_TRADING_UNIVERSE;
  const denylistSymbols = dedupe(configuredDenylist.length > 0 ? configuredDenylist : DEFAULT_DENYLIST);
  const denyCanonical = new Set(denylistSymbols.map(canonicalizeSymbol));

  const tradingUniverse = dedupe(
    tradingUniverseBase.filter((symbol) => !denyCanonical.has(canonicalizeSymbol(symbol)))
  );

  if (tradingUniverse.length === 0) {
    throw new Error('E_UNIVERSE_EMPTY: trading universe is empty after denylist policy');
  }

  const configuredDefault = (env.DEFAULT_SYMBOL || '').trim();
  const defaultSymbol = configuredDefault || tradingUniverse[0];
  const defaultValidation = validateSymbolPolicy(defaultSymbol, {
    tradingUniverse,
    denylistSymbols,
    defaultSymbol
  });

  if (!defaultValidation.allowed && defaultValidation.code) {
    throw new Error(`${defaultValidation.code}: invalid DEFAULT_SYMBOL ${defaultSymbol}`);
  }

  return {
    tradingUniverse,
    denylistSymbols,
    defaultSymbol
  };
}

export function validateSymbolPolicy(
  symbol: string,
  config: SymbolPolicyConfig
): SymbolPolicyValidation {
  const canonical = canonicalizeSymbol(symbol);
  const denyCanonical = new Set(config.denylistSymbols.map(canonicalizeSymbol));

  if (denyCanonical.has(canonical)) {
    return {
      allowed: false,
      normalizedSymbol: canonical,
      code: 'E_SYMBOL_DENIED',
      reason: `${symbol} is explicitly denied by policy`
    };
  }

  const allowCanonical = new Set(config.tradingUniverse.map(canonicalizeSymbol));
  if (!allowCanonical.has(canonical)) {
    return {
      allowed: false,
      normalizedSymbol: canonical,
      code: 'E_SYMBOL_NOT_ALLOWED',
      reason: `${symbol} is not present in trading universe`
    };
  }

  return {
    allowed: true,
    normalizedSymbol: canonical
  };
}
