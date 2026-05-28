export function calculateUsdValue(balance: bigint, price: bigint, decimals: bigint): bigint {
  return (price * balance) / 10n ** decimals;
}

const PRICE_DECIMALS = 100_000_000n; // Aave oracle: 8 decimals
const CENTS_UNIT = 1_000_000n; // 2 decimal places of display precision

export function formatUsd(rawUsd: bigint): string {
  const dollars = rawUsd / PRICE_DECIMALS;
  const cents = (rawUsd % PRICE_DECIMALS) / CENTS_UNIT;
  const dollarsStr = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${dollarsStr}.${cents.toString().padStart(2, '0')}`;
}
