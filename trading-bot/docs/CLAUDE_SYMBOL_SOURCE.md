# KuCoin Perpetual Futures Symbols — Source of Truth

The screener MUST read symbols from:

- data/kucoin_perp_symbols.json  (preferred)
- data/kucoin_perp_symbols.txt   (fallback)

Symbols are generated from KuCoin Futures public endpoint:
GET https://api-futures.kucoin.com/api/v1/contracts/active

Selection rule:
- include only contracts where expireDate == null AND status == "Open".

No symbols may be hardcoded elsewhere.
Update list using:
node scripts/update_kucoin_perp_symbols.mjs

