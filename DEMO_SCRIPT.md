# Stocklana (Peg Watch + PreStocks) — ~2.5-minute demo script

> AI-assisted: this script was written with AI assistance.

**Bounties:** Best Use of PreStocks and Best use of Pyth market data (Stocklana hackathon)

---

## [0:00–0:15] Hook

> "Tokenized stocks on Solana trade 24/7, but the underlying US equities don't. So the first question is simple: **is TSLAx actually priced like TSLA?**
>
> Peg Watch answers that in one table — no wallet, no keys, read-only."

*[Show `docs/index.html` or GitHub Pages URL. Click Refresh if needed.]*

---

## [0:15–0:45] What it measures

> "For five xStocks — TSLAx, AAPLx, NVDAx, GOOGLx, SPYx — we pull two public prices:
>
> - **On-chain:** Jupiter Price API, keyed by the official Solana mint from the xStocks Backed API.
> - **Reference:** Pyth `Equity.US.*/USD` feeds, read from Pyth push-oracle accounts on Solana via public RPC.
>
> The **premium or discount** is the gap in basis points. We show **how old each price is**, and whether the **US cash market is open**."

*[Point at columns: on-chain $, ref $, bps, market status, flags.]*

---

## [0:45–1:15] Smart flags (after hours)

> "Outside regular NYSE hours the gap between the 24/7 token and the equity reference can widen — we label that **AFTER-HOURS GAP**, not a red alert. If the reference account hasn't updated for days, we flag **REF STALE**.
>
> During market hours, if the reference is older than five minutes, we flag **STALE**. If on-chain diverges more than 100 bps, we flag **WIDE**.
>
> No invented numbers — if a feed fails, you see **UNKNOWN**."

*[If market is closed, highlight an AFTER-HOURS GAP row. If open, show OK vs WIDE.]*

---

**Issuer cross-check (optional, +15s):**

> "A third reference: the issuer's own xStocks quote from Backed's public API — MATCH or DIFF against both Jupiter and Pyth. We also show the dividend multiplier, cross-checked against the token's on-chain config, whether trading is halted, and proof of reserves as published by Backed/xStocks."

*[Point at the xStocks quote, Multiplier column, and the proof-of-reserves table. Read figures from the page.]*

---

## [1:15–1:40] CLI + repo

> "Same data in the terminal — one command:"

```bash
node cli.js
```

> "Static site, client-side fetch only. MIT license. Mint addresses verified against `api.backed.fi`. README has a Limits section for what we explicitly do **not** claim."

*[Run CLI briefly; show matching table.]*

---

## [1:40–2:10] PreStocks tab (~30s)

*[Click the **PreStocks** tab.]*

> "Second tab: pre-IPO tokens from **PreStocks** on Solana — PreStocks tokens only.
>
> For each token we show the token price next to the **mark price as published by the PreStocks API**, and the premium or discount. Plus ten percent or more is flagged **RICH vs mark**, minus ten percent or more **CHEAP vs mark**. Implied valuation versus mark valuation is shown in billions.
>
> Then we cross-check on-chain: the price against Jupiter for the same mint, the supply against Solana's `getTokenSupply`, and that the mint account exists. The summary line gives the MATCH / DIFF counts.
>
> The PreStocks API can't be called from a browser, so a GitHub Action snapshots it on a 30-minute schedule — and the page always shows the real data age, schedule hiccups included. Anything that failed says UNKNOWN. And to be clear: mark isn't fair value, and a premium isn't an arbitrage."

*[Point at a RICH/CHEAP row, the Jupiter MATCH column, and the "data age" line. Read the figures from the page — do not quote numbers from this script.]*

---

## [2:10–2:30] Close

> "Peg Watch is infrastructure for the tokenized-stock stack: a quick sanity check before you trade, build a vault, or wire a lending market. Built for Stocklana's PreStocks and Pyth bounties — comparing PreStocks tokens to their published mark, and real equity reference data from Pyth to on-chain xStock prices on Solana."

*[End on the web table with all five tokens visible.]*
