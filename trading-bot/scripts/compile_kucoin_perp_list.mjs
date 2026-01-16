import fs from "fs";
import path from "path";

const URL = "https://api-futures.kucoin.com/api/v1/contracts/active";

const OUT_DIR = path.resolve(process.cwd(), "data");
const OUT_JSON = path.join(OUT_DIR, "kucoin_perp_symbols.json");
const OUT_TXT = path.join(OUT_DIR, "kucoin_perp_symbols.txt");

// Perpetual = expireDate === null; only tradable = status === "Open" :contentReference[oaicite:1]{index=1}
function isPerpOpen(c) {
  return c && c.expireDate === null && String(c.status).toLowerCase() === "open";
}

function uniqSort(arr) {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));
}

async function main() {
  const res = await fetch(URL, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

  const payload = await res.json();

  // KuCoin returns { code: "200000", data: [...] } for this endpoint in practice.
  const contracts = Array.isArray(payload?.data) ? payload.data : [];
  if (!contracts.length) {
    throw new Error(
      `No contracts returned. Response keys: ${Object.keys(payload || {}).join(", ")}`
    );
  }

  const symbols = contracts
    .filter(isPerpOpen)
    .map((c) => c.symbol)
    .filter(Boolean);

  const finalList = uniqSort(symbols);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const outObj = {
    generatedAt: new Date().toISOString(),
    source: URL,
    count: finalList.length,
    symbols: finalList
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(outObj, null, 2), "utf8");
  fs.writeFileSync(OUT_TXT, finalList.join("\n") + "\n", "utf8");

  // Print results so you can copy/paste the full list if you want
  console.log(`\nKuCoin perpetual futures symbols: ${finalList.length}\n`);
  console.log(finalList.join("\n"));
  console.log(`\nWrote:\n- ${OUT_JSON}\n- ${OUT_TXT}\n`);
}

main().catch((e) => {
  console.error("\nFAILED:", e?.message || e);
  process.exit(1);
});

