# Stocklana — Peg Watch + PreStocks

**Site:** https://stocklana.elghaly.dev/ (tabs: **xStocks** and **PreStocks**)

## xStocks tab — Peg Watch

**Is a tokenized stock on Solana priced like the real stock?**

Peg Watch compares **on-chain xStock prices** (Jupiter Price API) against **Pyth equity reference prices** (`Equity.US.*/USD`) for five tokens: **TSLAx, AAPLx, NVDAx, GOOGLx, SPYx**.

Built for **[Stocklana](https://hackathons.solana.com)** — submitted under two bounties: **Best Use of PreStocks** (PreStocks tab: pre-IPO token price vs PreStocks mark, depth quotes, on-chain checks) and **Best use of Pyth market data** (xStocks tab: underlying equity vs on-chain tokenized exposure).

> **AI-assisted:** analysis text, README, and demo script in this repo were written with AI assistance.

## What it measures

| Column | Source |
|--------|--------|
| On-chain $ | [Jupiter Price API v3](https://dev.jup.ag/docs/price) (`api.jup.ag/price/v3`, keyless) |
| On-chain age | Estimated from Jupiter `blockId` vs current Solana slot, at the slot time measured on each refresh from `getRecentPerformanceSamples` (sum of seconds / sum of slots over the last ~5 min, shown under the table); UNKNOWN if that call fails |
| Reference $ | [Pyth Network](https://docs.pyth.network/) `Equity.US.*/USD` push-oracle price-update accounts on Solana (public RPC). Both shard 0 and shard 1 PDAs are read and the freshest valid account (owned by the Pyth receiver program, matching feed id) is used. As of 2026-10-20, **both** have stopped updating: shard 0 last published on 2026-08-14 to 2026-09-11, shard 1 on 2026-09-28 (TSLA 2026-10-14), so every Reference $ is older than the 96 h limit and flagged **REF STALE** — exact times in the status section below. |
| Ref age | `publishTime` from Pyth on-chain account |
| Premium / discount | `(on_chain − reference) / reference × 10 000` basis points |
| US market | Pyth Hermes `market_hours` metadata (no key) with local NYSE schedule fallback |
| xStocks quote | xStocks (Backed) public API `GET /public/assets/{symbol}/price-data` → `quote`; compared with Jupiter and with Pyth — **MATCH** within 1%, else **DIFF** with both values |
| Multiplier | `GET /public/assets/{symbol}/multiplier?network=Solana` → `currentMultiplier`, cross-checked against the mint's Token-2022 `scaledUiAmountConfig` (on-chain MATCH/DIFF). Shown with fair value per raw token = underlying × multiplier |
| HALTED | `GET /public/assets/{symbol}` → `isTradingHalted`; when true the row shows **HALTED** and premium flags are suppressed |
| Proof of reserves | `GET /public/proof-of-reserves/{symbol}` → `sharesHeld`, `circulatingSupply`, `holdings[]`, `timestamp` — shown **as published by Backed/xStocks** |
| Flags | See below |

### Pyth accounts (Solana push feeds) — current vs upgraded program

Per the [Pyth contracts page](https://docs.pyth.network/price-feeds/core/upgrade/contracts), the Solana Price Feed program ID changes with the
Pyth Core upgrade, so every per-feed push account changes too. Accounts are PDAs with seeds `[shard (u16 LE), feed_id]` — the docs'
own table derives the "upgraded account address" with shard 0 and the upgraded program, exactly as below.

| | Current | Upgraded |
|---|---|---|
| Price Feed program | `pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT` | `pyt2F414BA6dPttK6RddPZUdHfapoBN24GL5wbrPCou` |
| Solana receiver (account owner) | `rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ` | `rec2HHDDnjLfj4kE7VyEtFA1HPGQLK33259532cRyHp` |

| Feed | current shard 0 | current shard 1 | upgraded shard 0 | upgraded shard 1 |
|---|---|---|---|---|
| Equity.US.TSLA/USD | `E8WFH8brgP58arcuW2wwsPHiomYrSvrgWTsRLZLAEZUQ` | `FQB8c4zB8Emrp9W8bmyk6GanCLq4aRytHYPDAnaEpq9z` | `Ayoy1gwnhWiycXt31Jj14MDPwnmcERXEg6zTybju8kYo` | `GPMViYaeA8hgkm5BQNNFdMqkT8k7eEDjnwAxDC7Eq7W7` |
| Equity.US.AAPL/USD | `DJ2FyTgUAkEtXW3U5P9PF19meFTRtW4ZWKKFgACfVbUy` | `D9uk39pqZMcnmtPP9WeC8cREUpKZmyXLga9mSQ79SphW` | `AMg1o31UCgYtBgg6FuSCqUuYYq19XVmN11JTdMQ4eK6L` | `GaheeEkhsRGUQuz4vULmjZNg3gH5QxckhPLHeKx7Fajq` |
| Equity.US.NVDA/USD | `2w1Tg1XTZbUib7srfRoStJ4v5JXVsK7roQEGMsMaGZFC` | `5VETJ8h3p4JrESYrzhjTDAWPEjDjfcnduqe9CjxgqBNd` | `BpsV4NCkHxC3FzykhvwMqo3Xkntm2EyPWdC92fVum1Xh` | `6QgKoDKkYftT129TaRgWY9jL4anWZZLekq15Ttk2W9GD` |
| Equity.US.GOOGL/USD | `HShKFQqhYkUiXpVyyLmrAALXwWqHB7ikLmPbrwJzpRNh` | `7aUtbtC3o3GVwRWvaDp5fxKjBq53QL3UrVmDzDgeNo8M` | `3pPk4HK7RWig3k9oibQiKPU21gr3PA7BPr4EHpoA1dqA` | `HLfcrataVrKFLr71W4VSpnLLfUPswn2eok3ttUF3mQ6x` |
| Equity.US.SPY/USD | `9owhtgrdLiUMAH9JKxYFt5pUY4Luy4EzzLhdcWPVuDyy` | `CRDaGwcVnKdRNRtx6fjHtvrBgKM5U55AhbqBWhtPMDA` | `2Gejay6wFavogtNP8HifRscSEi85erznugWAkAty5zjw` | `FbCd3rSihn7PqHriCUCd5JFnzSTzRXJzxZhCaU26X9Q9` |

**Status, re-checked on-chain 2026-10-20 ~18:40 UTC** (slot ~459 333 636, with the same account parser the page uses; each line says what changed since the 2026-09-25 check):
- **Upgraded program** — as of 2026-10-20: running on mainnet. SOL/USD's upgraded shard-0 account `7AviUf9n…` exists, is owned by `rec2HH…`, and had published 10 s before the read. Unchanged since 2026-09-25.
- **Upgraded accounts for these five feeds** — as of 2026-10-20: shard 0 and shard 1 PDAs **do not exist**. Unchanged since 2026-09-25.
- **Sponsored feed list** — as of 2026-10-20: the [Pyth Solana push-feeds page](https://docs.pyth.network/price-feeds/core/push-feeds/solana) lists 64 sponsored feeds (46 on 2026-09-25); none of them is one of these five feed ids. The only equity entry is `Equity.US.GLXY/USD`; `INDEX.FORD/USD`, listed on 2026-09-25, is no longer there.
- **Current shard 0** — as of 2026-10-20: stopped. Last publish: TSLA 2026-09-11 23:59:59, AAPL 2026-08-14 20:00:19, GOOGL 2026-08-14 20:00:20, NVDA and SPY 2026-08-26 15:54:46 UTC (right before the 16:00 UTC upgrade). Unchanged since 2026-09-25.
- **Current shard 1** — as of 2026-10-20: **stopped** (on 2026-09-25 it was updating within seconds). Last publish: TSLA 2026-10-14 17:59:44, AAPL 2026-09-28 11:53:02, GOOGL 11:53:03, SPY 11:53:09, NVDA 11:53:13 UTC (all 2026-09-28). Still verification level Full, owner `rec5EK…`, feed id matches.

Peg Watch reads all four candidates for each feed in one `getMultipleAccounts` call and uses the freshest valid one (owned by either
receiver, matching feed id). As of 2026-10-20 that is **current program, shard 1**, but it is past the 96 h reference-age limit for all five
feeds, so every row is flagged **REF STALE** and the premium compares against an old reference price. If the upgraded accounts come into existence and are fresher,
they are picked up automatically. The page shows which program/shard/account and the publish time for every Pyth price.

**Hermes:** Pyth's Hermes price-update endpoints (`/v2/updates/price/latest`) have required an API key since the Aug 26 2026 upgrade (as of 2026-10-20: a keyless request returns HTTP 401 `unauthorized`). Peg Watch
uses no key; prices are on-chain reads only. The keyless Hermes metadata endpoint `/v2/price_feeds` is used only for market-hours metadata,
with a local NYSE-schedule fallback if it fails.

### Flags

- **OK** — within thresholds
- **WIDE (N bps)** — \|premium/discount\| > **100 bps** (1%)
- **STALE** — reference older than **300 seconds** while US market is **open**
- **REF STALE (Nh old)** — reference older than **96 hours** at any time (the feed account is not being updated)
- **UNKNOWN** — a fetch failed; the reason is shown under the flag (never shown as 0 or blank)
- **AFTER-HOURS GAP** — wide peg during **closed** hours (expected; labeled, not alarmed)

### Multiplier math

xStocks on Solana are Token-2022 mints with a `ScaledUiAmount` multiplier (dividends are reinvested, so the multiplier grows).
Per [xStocks docs](https://docs.xstocks.fi/developers/multipliers), **scaled (UI) amount = raw amount × multiplier**, and one scaled
token represents one underlying share. Jupiter's `usdPrice` is per **scaled** token (verified: Jupiter's `usdPricePrescaled` =
`usdPrice × multiplier`), so the premium compares `usdPrice` with the share price directly. The equivalent raw-token view is shown
in the Multiplier column: Jupiter price per raw token = `usdPrice × multiplier` vs fair value per raw token = `underlying × multiplier`
— the ratio is identical. Multiplying the UI price by the multiplier *and* comparing it with the plain share price would double count.

### xStocks (Backed) API — public endpoints used

Primary `https://api.xstocks.fi/api/v2/public` (the production server listed in the docs), fallback `https://api.backed.fi/api/v2/public`;
the host that answered is recorded per value (`host`) and shown on the page. No key, nothing under `/client` or `/trades`.

| Endpoint | Used for |
|---|---|
| `/public/assets/{symbol}` | `isTradingHalted`, Solana mint cross-check |
| `/public/assets/{symbol}/price-data` | xStocks quote |
| `/public/assets/{symbol}/multiplier?network=Solana` | current multiplier; pending `newMultiplier` / `activationDateTime` |
| `/public/system/status/{symbol}` | market / atomic trading halt |
| `/public/proof-of-reserves/{symbol}` | shares held, circulating supply, custody, timestamp → **reserve coverage** |
| `/public/corporate-actions/upcoming?symbol={symbol}` | upcoming corporate actions strip |

**Reserve coverage** = `sharesHeld ÷ circulatingSupply` from the same proof-of-reserves record, shown as a % with the PoR timestamp and
flagged **UNDER 100%** below 100%. Both figures are as published; the API does not state whether `circulatingSupply` is in share-equivalent
(multiplier-scaled) or raw token units, so the ratio is exactly the published quotient and not multiplier-adjusted.

**Upcoming corporate actions**: only entries whose `effectiveTimeUtc` is still in the future are shown ("none announced" otherwise); the
endpoint also returns past-dated `Scheduled` entries, which are counted but not shown. **Pending multiplier**: "multiplier change scheduled
<date>" when the mint's on-chain `newMultiplierEffectiveTimestamp` is in the future with a different `newMultiplier`, or the API reports a
non-zero `newMultiplier` + `activationDateTime`; otherwise "none announced".

**Not done:** circulating supply excluding Backed operational wallets (`/public/system/wallets`). The wallet list spans EVM, Solana, TON
and Tron, while `circulatingSupply` is aggregated across chains; doing the exclusion correctly would need per-chain balances for every
wallet, so it is skipped rather than approximated.
The API sends no CORS headers, so `scripts/fetch-xstocks.mjs` runs in the scheduled GitHub Action (same workflow as PreStocks) and writes
[`xstocks.json`](https://raw.githubusercontent.com/elghaly-dev/Stocklana/data/xstocks.json) to the `data` branch with `fetched_at`; the CLI calls the API directly.

## Depth-adjusted premium

For every PreStocks token and every tracked xStock, the scheduled Action (`scripts/fetch-depth.mjs`) asks the
**Jupiter quote API** (alternating between `lite-api.jup.ag/swap/v1/quote` and `api.jup.ag/swap/v1/quote` to spread rate limits, retrying on HTTP 429; keyless, `slippageBps=50`, `ExactIn`) for:

- **buy**: USDC → token for **$1,000** and **$10,000**
- **sell**: token → USDC for a token amount worth ~**$1,000** / ~**$10,000** at the Jupiter price

It never builds, signs, or sends a swap. From each quote:

- **effective price per token** = USDC in (or out) ÷ tokens out (or in), in **scaled (UI) tokens**: quote amounts are raw units, so
  tokens = raw ÷ 10^decimals × the mint's effective Token-2022 `ScaledUiAmount` multiplier (read on-chain). This matters for
  tokens with a multiplier ≠ 1 (e.g. some PreStocks after splits, xStocks after dividends).
- **premium at size** = effective price ÷ reference − 1 (PreStocks: mark price as published by the PreStocks API; xStocks: Pyth `Equity.US` price)
- **price impact** = effective price ÷ Jupiter Price API `usdPrice` − 1 (our computation; Jupiter's own `priceImpactPct` is stored verbatim)
- **NO ROUTE** when Jupiter returns no route; **UNKNOWN** + reason on any other failure (e.g. rate limiting)

The page shows these next to the headline premium, labelled **at $1k** / **at $10k**, buy and sell.

## Premium history

`history.json` (on the `data` branch) is append-only: one point per Action run (headline premium + $10k buy/sell premiums), capped at 14 days.
It was seeded once (`scripts/seed-history.mjs`) from the real `docs/data/prestocks.json` snapshots in git history — those older
points have the PreStocks headline premium only (no depth, no xStocks), with the snapshot's own `fetched_at` and the commit sha as
`source`. Each row shows a sparkline (tap for a larger chart) with point count and time range. Missing values are gaps; nothing is interpolated.

## Open JSON feeds

All feeds are files on the `data` branch, served by `raw.githubusercontent.com` (CORS-friendly) and refreshed by the Action on a ~30-minute schedule (manual dispatch when the schedule does not fire). Timestamps are ISO 8601 UTC.
The Action writes to `data` because `main` is protected. `docs/data/` on `main` holds an older copy that the page uses only when the `data` branch can't be read; the PreStocks tab then says so, and every value still shows its own age.
Anyone may read them; a failed value is recorded as `null` / `status: "UNKNOWN"` with an `error`, never as 0.

### `https://raw.githubusercontent.com/elghaly-dev/Stocklana/data/prestocks.json`

| Field | Description |
|-------|-------------|
| `fetched_at` | when the PreStocks API was fetched |
| `last_attempt` | `{at, ok, error?}` — if the latest fetch failed, the previous snapshot is kept and this records the failure |
| `tokens[].symbol`, `name`, `mint`, `external_url` | from the PreStocks API (`contract_address` → `mint`) |
| `tokens[].prestocks` | `{fetched_at, tokenPrice, markPrice, markValuation, impliedValuation, supply}` as published by the PreStocks API |
| `tokens[].premium` | `tokenPrice / markPrice − 1` |
| `tokens[].premium_flag` | `"RICH vs mark"` (≥ +10%), `"CHEAP vs mark"` (≤ −10%), `null`, or `"UNKNOWN"` |
| `tokens[].checks.jupiter_price` | `{status: MATCH/DIFF/UNKNOWN, prestocks, jupiter, diff, fetched_at, scaled_ui_config}` (MATCH within 1%) |
| `tokens[].checks.supply` | `{status, prestocks, onchain, slot, rpc, fetched_at}` vs `getTokenSupply` |
| `tokens[].checks.mint_exists` | `{status: EXISTS/NOT FOUND/NOT A MINT/UNKNOWN, owner_program, slot, fetched_at}` |

### `https://raw.githubusercontent.com/elghaly-dev/Stocklana/data/xstocks.json`

| Field | Description |
|-------|-------------|
| `fetched_at`, `source`, `fallback` | snapshot time; primary and fallback API base. Every sub-object records the `host` that answered |
| `assets[].asset` | `{ok, fetched_at, name, underlyingSymbol, isTradingHalted, currentPeriod, solanaMint, mintMatchesConfig}` from `/public/assets/{symbol}` |
| `assets[].quote` | `{ok, fetched_at, quote}` from `/public/assets/{symbol}/price-data` |
| `assets[].multiplier` | `{ok, fetched_at, currentMultiplier, newMultiplier, activationDateTime, reason}` from `/multiplier?network=Solana` |
| `assets[].status` | `{ok, fetched_at, isMarketTradingHalted, isAtomicTradingHalted}` from `/public/system/status/{symbol}` |
| `assets[].proof_of_reserves` | `{ok, fetched_at, host, timestamp, sharesHeld, circulatingSupply, coverage, holdings[]}` as published by Backed/xStocks; `coverage` = sharesHeld ÷ circulatingSupply |
| `assets[].corporate_actions` | `{ok, fetched_at, host, upcoming[{caType, effectiveTimeUtc, status, multiplierOld, multiplierNew, grossCashflowUsd, netCashflowUsd, fromUnits, toUnits}], past_dated_listed, total_nodes}` |
| `assets[].pending_multiplier` | `{status: NONE/SCHEDULED/UNKNOWN, api_newMultiplier, api_activationDateTime, onchain_newMultiplier, onchain_effective_at, fetched_at}` |
| `assets[].onchain_multiplier`, `multiplier_check` | effective multiplier from the mint's `scaledUiAmountConfig`; MATCH/DIFF vs the API |

Every sub-object has `ok`; when `ok` is `false` it carries `error` instead of values.

### `https://raw.githubusercontent.com/elghaly-dev/Stocklana/data/depth.json`

| Field | Description |
|-------|-------------|
| `fetched_at`, `sizes_usd`, `sources`, `note` | run time, `[1000, 10000]`, endpoints, disclaimer |
| `tokens[].group`, `symbol`, `mint` | `prestocks` or `xstocks` |
| `tokens[].ref`, `ref_label`, `ref_fetched_at` | reference price (PreStocks mark / Pyth) |
| `tokens[].headline_premium`, `headline_fetched_at` | PreStocks `tokenPrice/markPrice − 1`; xStocks Jupiter `usdPrice / Pyth − 1` |
| `tokens[].jupiter_price`, `jupiter_price_fetched_at` | Jupiter Price API v3 `usdPrice` (per UI token) |
| `tokens[].mint_info` | `{decimals, multiplier, fetched_at}` read on-chain |
| `tokens[].legs.{buy,sell}_{1000,10000}` | `{status: OK/NO ROUTE/UNKNOWN, fetched_at, usdc, ui_tokens, effective_price, premium_vs_ref, price_impact_vs_jupiter_price, jupiter_price_impact_pct, route[], context_slot, quote_host, error?}` |

### `https://raw.githubusercontent.com/elghaly-dev/Stocklana/data/history.json`

| Field | Description |
|-------|-------------|
| `cap_days`, `updated_at` | retention (14 days) and last write |
| `points[].t` | snapshot time (ISO) |
| `points[].source` | `action` (live run) or `git:<sha>` (seeded from a real past snapshot) |
| `points[].prestocks.{SYMBOL}` / `points[].xstocks.{SYMBOL}` | `{p, b10k, s10k}` — headline premium and $10k buy / sell premium vs reference (fractions; `null` = not available) |

## Mint verification

All five mints were verified against the official xStocks / Backed public API (`GET https://api.backed.fi/api/v2/public/assets/{symbol}` → Solana deployment address):

| Token | Mint | Verified via |
|-------|------|--------------|
| TSLAx | `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB` | [backed.fi TSLAx](https://api.backed.fi/api/v2/public/assets/TSLAx) |
| AAPLx | `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp` | [backed.fi AAPLx](https://api.backed.fi/api/v2/public/assets/AAPLx) |
| NVDAx | `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh` | [backed.fi NVDAx](https://api.backed.fi/api/v2/public/assets/NVDAx) |
| GOOGLx | `XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN` | [backed.fi GOOGLx](https://api.backed.fi/api/v2/public/assets/GOOGLx) |
| SPYx | `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W` | [backed.fi SPYx](https://api.backed.fi/api/v2/public/assets/SPYx) |

## Quick start

### Web (GitHub Pages)

1. Open https://stocklana.elghaly.dev/ (GitHub Pages from `main` `/docs`), or serve locally: `python3 -m http.server -d docs`.
2. Click **Refresh** (xStocks) or switch to the **PreStocks** tab.

### CLI

```bash
node cli.js
# or
npm run peg-watch
```

Requires **Node.js 18+**. No dependencies, no install step beyond cloning the repo.

## PreStocks tab

Pre-IPO tokens issued by **[PreStocks](https://prestocks.com)** on Solana — **PreStocks tokens only** (no other pre-IPO issuers).

| Column | Source |
|--------|--------|
| Token price, mark price, implied / mark valuation, supply | PreStocks public API `GET https://prestocks.com/api/prestocks` (fields `symbol`, `contract_address`, `tokenPrice`, `markPrice`, `impliedValuation`, `markValuation`, `supply`). Mark price is shown **as published by the PreStocks API**. |
| Premium / discount | `tokenPrice / markPrice − 1`; **≥ +10% → RICH vs mark**, **≤ −10% → CHEAP vs mark** |
| Implied vs mark valuation | `impliedValuation` vs `markValuation`, in $B |
| Jupiter price check | PreStocks `tokenPrice` vs [Jupiter Price API v3](https://dev.jup.ag/docs/price) `usdPrice` for the same mint — **MATCH** within 1%, else **DIFF** with both values |
| Supply check | PreStocks `supply` vs Solana RPC `getTokenSupply` (UI amount) — MATCH / DIFF |
| Mint | Solana RPC `getAccountInfo` — account exists and is a token mint |

Every number shows its fetch time; any failure shows **UNKNOWN** plus the reason.

**Why a snapshot file:** `prestocks.com/api/prestocks` sends no CORS headers, so browsers cannot call it directly.
The GitHub Action [`.github/workflows/prestocks-snapshot.yml`](.github/workflows/prestocks-snapshot.yml) is scheduled every ~30 minutes (cron
`13,43 * * * *`, plus `workflow_dispatch`; GitHub may delay or skip scheduled runs — snapshots are then refreshed by manual dispatch,
and the page always shows the actual data age), executes `node scripts/fetch-prestocks.mjs` (PreStocks API + all on-chain checks), and commits
[`prestocks.json`](https://raw.githubusercontent.com/elghaly-dev/Stocklana/data/prestocks.json) to the `data` branch with `fetched_at`. Each run starts from the files on `data`, so
history keeps growing. The page reads that one file and shows the data age.
If a refresh fails, the previous snapshot is kept and the failed attempt (time + error) is shown on the page.

```bash
node scripts/fetch-prestocks.mjs   # refresh docs/data/prestocks.json locally
```

### PreStocks limits

- **Depth quotes are indicative.** Jupiter quotes are not executable guarantees; prices move and routes change between the snapshot and any trade. A premium at size is **not an arbitrage**.

- **Not investment advice.** Informational, read-only; no wallet connect, no trading.
- **Mark is not fair value.** The mark price is simply the value published by the PreStocks API.
- **A premium is not an arbitrage.** Tokens may not be redeemable at mark; minting/redemption has its own eligibility and process.
- **Structure and methodology are PreStocks'.** This project does not describe or verify how the mark price is determined.
- **Snapshot, not real time.** Data can be up to ~30 minutes old (plus GitHub Actions schedule delays); the page shows the age.

## Limits (what Peg Watch does **not** measure)

- **Not a trade signal** — read-only monitor; no wallet connect, no swaps, no execution.
- **Not proof of redemption** — does not check xStock issuer reserves, NAV, or mint/redeem queues.
- **Not full market microstructure** — Jupiter returns one heuristic USD price, not order-book mid or TWAP across all venues.
- **Corporate actions: multiplier only** — the current issuer multiplier is shown and cross-checked on-chain; pending multiplier changes and corporate-action calendars are not modeled. If the multiplier endpoint fails the column shows UNKNOWN.
- **xStocks quote is the issuer's indicative price** (`price-data`), not an executable price; issuer data is a ~30-minute snapshot (age shown).
- **Depth quotes ($1k / $10k) are indicative** Jupiter quote-API results, not executable guarantees and not arbitrage; public quote API rate limits can leave some legs UNKNOWN.
- **History** holds only real snapshot points (max 14 days); points seeded from git history have the PreStocks headline premium only.
- **Proof of reserves is shown as published by Backed/xStocks** — not audited or independently verified here; no collateral ratio is derived.
- **Not all xStocks** — only five liquid names with verified mints and Pyth equity feeds.
- **Not Hermes price-update API** — Pyth’s Hermes `/v2/updates/price/latest` requires an API key since the Aug 26 2026 upgrade. Peg Watch reads Pyth prices from **on-chain push accounts** via public Solana RPC (keyless). Hermes is used only for **market-hours metadata** (no key).
- **Pyth equity feeds are not Pyth-sponsored on Solana** — the shard-1 accounts used are kept fresh by whoever pushes updates; if they stop, the age column and REF STALE flag show it. As of 2026-10-20 they have stopped (see the status section above).
- **Jupiter omissions** — Jupiter Price API v3 leaves tokens without a reliable price out of the reply; that shows as UNKNOWN (“Jupiter omitted: no reliable price”), covered by `npm test`.
- **Not holiday-perfect** — US market schedule uses Pyth metadata when available; local fallback is Mon–Fri 09:30–16:00 ET only (no holiday calendar).
- **Not latency-critical** — browser RPC + Jupiter fetches are fine for a dashboard, not for HFT or liquidation bots.
- **Not legal/financial advice** — informational only.

## Project layout

```
docs/           Static web app (GitHub Pages, served from main /docs)
  index.html
  js/           Shared fetch + peg logic (also used by CLI); prestocks.js renders the PreStocks tab
  data/         older copies of the snapshots, used only when the data branch can't be read
scripts/fetch-prestocks.mjs   PreStocks API + on-chain checks -> docs/data/prestocks.json
scripts/fetch-xstocks.mjs     xStocks public API -> docs/data/xstocks.json
scripts/fetch-depth.mjs       Jupiter $1k/$10k quotes -> docs/data/depth.json + history.json
scripts/seed-history.mjs      one-off seed of history.json from git history
.github/workflows/prestocks-snapshot.yml   ~30-minute schedule + workflow_dispatch; commits snapshots to the data branch
data branch     prestocks.json, xstocks.json, depth.json, history.json (written by the Action only)
cli.js          Terminal table
DEMO_SCRIPT.md  2-minute hackathon video script
```

## Hackathon bounties

Submitted under both the **Best Use of PreStocks** and the **Best use of Pyth market data** bounties.

**Best Use of PreStocks** — the PreStocks tab compares each PreStocks token's Jupiter price with the mark price published by the PreStocks API and flags ±10% as RICH / CHEAP vs mark. Read-only Jupiter quotes at $1k and $10k (buy and sell) show the depth-adjusted premium and price impact, and every API figure is re-checked on-chain: Jupiter price for the same mint, supply via `getTokenSupply`, and mint account via `getAccountInfo`. The mark is not fair value, and a premium is not an arbitrage — tokens may not be redeemable at mark.

**Best use of Pyth market data** — compares Pyth `Equity.US.*/USD` reference feeds to on-chain xStock prices from Jupiter (with the issuer's own quote as a third reference), exactly the “underlying market vs on-chain asset” wedge described in the bounty brief. Also relevant to Stocklana **Infrastructure** (price feeds / analytics).

## License

MIT — see [LICENSE](LICENSE).
