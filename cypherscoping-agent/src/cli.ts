import { createAgent } from './main';
import { OHLCV } from './types';
import { loadSymbolPolicy } from './config/symbol-policy';

interface CliArgs {
  allToolsAllowed: boolean;
  optimizeExecution: boolean;
  mode: 'manual' | 'algo';
  scan: boolean;
  analyze: boolean;
  tradeAction: 'buy' | 'sell' | 'close' | null;
  symbol: string;
  size?: number;
  asJson: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    allToolsAllowed: false,
    optimizeExecution: true,
    mode: 'algo',
    scan: false,
    analyze: false,
    tradeAction: null,
    symbol: loadSymbolPolicy().defaultSymbol,
    asJson: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--all-tools-allowed') args.allToolsAllowed = true;
    if (arg === '--no-optimize') args.optimizeExecution = false;
    if (arg === '--optimize') args.optimizeExecution = true;
    if (arg === '--scan') args.scan = true;
    if (arg === '--analyze') args.analyze = true;
    if (arg === '--json') args.asJson = true;

    if (arg === '--mode' && (next === 'manual' || next === 'algo')) {
      args.mode = next;
      i++;
    }

    if (arg === '--symbol' && next) {
      args.symbol = next;
      i++;
    }

    if (arg === '--trade' && (next === 'buy' || next === 'sell' || next === 'close')) {
      args.tradeAction = next;
      i++;
    }

    if (arg === '--size' && next) {
      const parsed = Number(next);
      if (!Number.isNaN(parsed) && parsed > 0) {
        args.size = parsed;
      }
      i++;
    }
  }

  return args;
}

function mockOHLCV(count: number = 120): OHLCV[] {
  const out: OHLCV[] = [];
  let price = 50000;
  for (let i = 0; i < count; i++) {
    const drift = (Math.random() - 0.5) * 250;
    const open = price;
    const close = Math.max(1, open + drift);
    const high = Math.max(open, close) + Math.random() * 100;
    const low = Math.max(1, Math.min(open, close) - Math.random() * 100);
    out.push({
      timestamp: Date.now() - (count - i) * 30 * 60 * 1000,
      open,
      high,
      low,
      close,
      volume: 500 + Math.random() * 5000
    });
    price = close;
  }
  return out;
}

function printOutput(asJson: boolean, title: string, payload: unknown): void {
  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`\n[CypherScope] ${title}`);
  console.log(payload);
}

async function main(): Promise<void> {
  const symbolPolicy = loadSymbolPolicy();
  const args = parseArgs(process.argv.slice(2));
  const agent = await createAgent({
    allToolsAllowed: args.allToolsAllowed,
    optimizeExecution: args.optimizeExecution
  });

  try {
    if (!args.asJson) {
      console.log(
        `[CypherScope] symbol policy: default=${symbolPolicy.defaultSymbol}, universe=${symbolPolicy.tradingUniverse.join(',')}, denylist=${symbolPolicy.denylistSymbols.join(',')}`
      );
    }

    agent.setMode(args.mode);

    if (args.scan) {
      const scan = await agent.scan();
      printOutput(args.asJson, 'Scan complete', scan);
    }

    if (args.analyze) {
      const analysis = await agent.analyze(args.symbol, mockOHLCV());
      printOutput(args.asJson, `Analysis for ${args.symbol}`, analysis);
    }

    if (args.tradeAction) {
      const trade = await agent.trade(args.symbol, args.tradeAction, args.size);
      printOutput(args.asJson, `Trade action ${args.tradeAction}`, trade);
    }

    if (!args.scan && !args.analyze && !args.tradeAction) {
      printOutput(args.asJson, 'Agent stats', agent.getStats());
    }
  } finally {
    await agent.shutdown();
  }
}

main().catch((error) => {
  console.error('[CypherScope] CLI error:', error?.message || error);
  process.exit(1);
});
