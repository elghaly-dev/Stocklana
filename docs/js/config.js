/** Peg Watch stock registry — mints verified via xStocks / Backed public API. */

export const THRESHOLDS = {
  /** Flag when |premium/discount| exceeds this many basis points. */
  premiumBps: 100,
  /** Flag reference price as STALE when older than this (seconds) during market hours. */
  staleSeconds: 300,
  /** Jupiter blockId age uses the MEASURED slot rate: this many recent ~60 s performance samples (~5 min). */
  slotRateSamples: 5,
  /** Flag reference as STALE regardless of market hours when older than this (covers long weekends). */
  maxRefAgeSeconds: 96 * 3600,
  /** xStocks quote vs Jupiter / Pyth: MATCH when within this fraction (1%). */
  referenceMatch: 0.01,
  /**
   * When Pyth is older than maxRefAgeSeconds, the xStocks issuer quote becomes the reference if its snapshot is at most this old.
   * GitHub runs the 30-minute snapshot schedule only every 4-6 h in practice (Oct 19-20: gaps up to 6 h 15 m), so 2 h left the
   * page on REF STALE most of the day. The flag shows the quote's age.
   */
  issuerRefMaxAgeSeconds: 8 * 3600,
};

/** Pyth Solana programs (docs.pyth.network/price-feeds/core/upgrade/contracts). */
export const PYTH_PROGRAMS = {
  current: { priceFeed: 'pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT', receiver: 'rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ' },
  upgraded: { priceFeed: 'pyt2F414BA6dPttK6RddPZUdHfapoBN24GL5wbrPCou', receiver: 'rec2HHDDnjLfj4kE7VyEtFA1HPGQLK33259532cRyHp' },
};

/**
 * Where the page reads the snapshot JSON files, in order. The Action writes them to the `data`
 * branch, because main is protected. docs/data/ is the copy bundled with the site, used only when
 * the data branch can't be read.
 */
export const DATA_SOURCES = [
  'https://raw.githubusercontent.com/elghaly-dev/Stocklana/data/',
  'data/',
];

export const ENDPOINTS = {
  jupiterPrice: 'https://api.jup.ag/price/v3',
  pythHermesMeta: 'https://hermes.pyth.network/v2/price_feeds',
  solanaRpc: [
    'https://api.mainnet-beta.solana.com',
    'https://solana-rpc.publicnode.com',
  ],
};

/** @typedef {Object} StockConfig */
/** @type {StockConfig[]} */
export const STOCKS = [
  {
    symbol: 'TSLAx',
    underlying: 'TSLA',
    mint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB',
    pythFeedId: '16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1',
    pythSymbol: 'Equity.US.TSLA/USD',
    // Pyth push-feed PDAs (seeds: [shard u16 LE, feed id]) for the CURRENT Price Feed program
    // (pythWSn…, shards 0 and 1) and the UPGRADED program (pyt2F4…, shards 0 and 1).
    // The freshest valid account (receiver-owned, matching feed id) is used. See README "Pyth accounts".
    pythOnChainAccounts: [
      { address: 'E8WFH8brgP58arcuW2wwsPHiomYrSvrgWTsRLZLAEZUQ', program: 'current', shard: 0 },
      { address: 'FQB8c4zB8Emrp9W8bmyk6GanCLq4aRytHYPDAnaEpq9z', program: 'current', shard: 1 },
      { address: 'Ayoy1gwnhWiycXt31Jj14MDPwnmcERXEg6zTybju8kYo', program: 'upgraded', shard: 0 },
      { address: 'GPMViYaeA8hgkm5BQNNFdMqkT8k7eEDjnwAxDC7Eq7W7', program: 'upgraded', shard: 1 },
    ],
    mintSource: 'https://api.backed.fi/api/v2/public/assets/TSLAx',
  },
  {
    symbol: 'AAPLx',
    underlying: 'AAPL',
    mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp',
    pythFeedId: '49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688',
    pythSymbol: 'Equity.US.AAPL/USD',
    // Pyth push-feed PDAs (seeds: [shard u16 LE, feed id]) for the CURRENT Price Feed program
    // (pythWSn…, shards 0 and 1) and the UPGRADED program (pyt2F4…, shards 0 and 1).
    // The freshest valid account (receiver-owned, matching feed id) is used. See README "Pyth accounts".
    pythOnChainAccounts: [
      { address: 'DJ2FyTgUAkEtXW3U5P9PF19meFTRtW4ZWKKFgACfVbUy', program: 'current', shard: 0 },
      { address: 'D9uk39pqZMcnmtPP9WeC8cREUpKZmyXLga9mSQ79SphW', program: 'current', shard: 1 },
      { address: 'AMg1o31UCgYtBgg6FuSCqUuYYq19XVmN11JTdMQ4eK6L', program: 'upgraded', shard: 0 },
      { address: 'GaheeEkhsRGUQuz4vULmjZNg3gH5QxckhPLHeKx7Fajq', program: 'upgraded', shard: 1 },
    ],
    mintSource: 'https://api.backed.fi/api/v2/public/assets/AAPLx',
  },
  {
    symbol: 'NVDAx',
    underlying: 'NVDA',
    mint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh',
    pythFeedId: 'b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593',
    pythSymbol: 'Equity.US.NVDA/USD',
    // Pyth push-feed PDAs (seeds: [shard u16 LE, feed id]) for the CURRENT Price Feed program
    // (pythWSn…, shards 0 and 1) and the UPGRADED program (pyt2F4…, shards 0 and 1).
    // The freshest valid account (receiver-owned, matching feed id) is used. See README "Pyth accounts".
    pythOnChainAccounts: [
      { address: '2w1Tg1XTZbUib7srfRoStJ4v5JXVsK7roQEGMsMaGZFC', program: 'current', shard: 0 },
      { address: '5VETJ8h3p4JrESYrzhjTDAWPEjDjfcnduqe9CjxgqBNd', program: 'current', shard: 1 },
      { address: 'BpsV4NCkHxC3FzykhvwMqo3Xkntm2EyPWdC92fVum1Xh', program: 'upgraded', shard: 0 },
      { address: '6QgKoDKkYftT129TaRgWY9jL4anWZZLekq15Ttk2W9GD', program: 'upgraded', shard: 1 },
    ],
    mintSource: 'https://api.backed.fi/api/v2/public/assets/NVDAx',
  },
  {
    symbol: 'GOOGLx',
    underlying: 'GOOGL',
    mint: 'XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN',
    pythFeedId: '5a48c03e9b9cb337801073ed9d166817473697efff0d138874e0f6a33d6d5aa6',
    pythSymbol: 'Equity.US.GOOGL/USD',
    // Pyth push-feed PDAs (seeds: [shard u16 LE, feed id]) for the CURRENT Price Feed program
    // (pythWSn…, shards 0 and 1) and the UPGRADED program (pyt2F4…, shards 0 and 1).
    // The freshest valid account (receiver-owned, matching feed id) is used. See README "Pyth accounts".
    pythOnChainAccounts: [
      { address: 'HShKFQqhYkUiXpVyyLmrAALXwWqHB7ikLmPbrwJzpRNh', program: 'current', shard: 0 },
      { address: '7aUtbtC3o3GVwRWvaDp5fxKjBq53QL3UrVmDzDgeNo8M', program: 'current', shard: 1 },
      { address: '3pPk4HK7RWig3k9oibQiKPU21gr3PA7BPr4EHpoA1dqA', program: 'upgraded', shard: 0 },
      { address: 'HLfcrataVrKFLr71W4VSpnLLfUPswn2eok3ttUF3mQ6x', program: 'upgraded', shard: 1 },
    ],
    mintSource: 'https://api.backed.fi/api/v2/public/assets/GOOGLx',
  },
  {
    symbol: 'SPYx',
    underlying: 'SPY',
    mint: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W',
    pythFeedId: '19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5',
    pythSymbol: 'Equity.US.SPY/USD',
    // Pyth push-feed PDAs (seeds: [shard u16 LE, feed id]) for the CURRENT Price Feed program
    // (pythWSn…, shards 0 and 1) and the UPGRADED program (pyt2F4…, shards 0 and 1).
    // The freshest valid account (receiver-owned, matching feed id) is used. See README "Pyth accounts".
    pythOnChainAccounts: [
      { address: '9owhtgrdLiUMAH9JKxYFt5pUY4Luy4EzzLhdcWPVuDyy', program: 'current', shard: 0 },
      { address: 'CRDaGwcVnKdRNRtx6fjHtvrBgKM5U55AhbqBWhtPMDA', program: 'current', shard: 1 },
      { address: '2Gejay6wFavogtNP8HifRscSEi85erznugWAkAty5zjw', program: 'upgraded', shard: 0 },
      { address: 'FbCd3rSihn7PqHriCUCd5JFnzSTzRXJzxZhCaU26X9Q9', program: 'upgraded', shard: 1 },
    ],
    mintSource: 'https://api.backed.fi/api/v2/public/assets/SPYx',
  },
];
