import fs from "fs";
import path from "path";

const OUT_DIR = path.resolve(process.cwd(), "data");
const OUT_JSON = path.join(OUT_DIR, "kucoin_perp_symbols.json");
const OUT_TXT = path.join(OUT_DIR, "kucoin_perp_symbols.txt");

const URL = "https://api-futures.kucoin.com/api/v1/contracts/active";

/**
 * KuCoin Futures docs:
 * - Endpoint returns tradable contracts (public).
 * - Perpetual contracts have expireDate == null.
 *   (The docs’ response example shows expireDate: null for XBTUSDTM.) :contentReference[oaicite:1]{index=1}
 */
function isPerpetualContract(c) {
  // Defensive: treat undefined as perpetual only if explicitly null.
  const isPerp = c?.expireDate === null;
  const isOpen = (c?.status || "").toLowerCase() === "open";
  return isPerp && isOpen;
}

function normalizeContracts(payload) {
  // KuCoin responses sometimes wrap data as array OR single object depending on endpoint/version.
  // The docs show "data" as an object example, but in practice this endpoint returns a list of contracts. :contentReference[oaicite:2]{index=2}
  const data = payload?.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return [data];
  return [];
}

async function main() {
  const res = await fetch(URL, {
    method: "GET",
    headers: { "accept": "application/json" }
  });

  if (!res.ok) {
    throw new Error(`KuCoin HTTP ${res.status}: ${await res.text()}`);
  }

  const payload = await res.json();
  const contracts = normalizeContracts(payload);

  const symbols = contracts
    .filter(isPerpetualContract)
    .map(c => c.symbol)
    .filter(Boolean);

  // Uniq + stable sort
  const uniq = Array.from(new Set(symbols)).sort();

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const outObj = {
    generatedAt: new Date().toISOString(),
    source: URL,
    count: uniq.length,
    symbols: uniq
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(outObj, null, 2), "utf8");
  fs.writeFileSync(OUT_TXT, uniq.join("\n") + "\n", "utf8");

  console.log(`Wrote ${uniq.length} perpetual symbols -> ${OUT_JSON} and ${OUT_TXT}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

