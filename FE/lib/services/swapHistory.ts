/**
 * Local Swap History Store
 *
 * LiFi swaps (USDC -> WBTC / XAUt0) happen directly via the LiFi Diamond,
 * NOT through the vault contract. So vault event logs won't capture them.
 *
 * We track completed swaps in localStorage so they appear in the
 * transaction history and recent activity feeds.
 */

export interface SwapRecord {
  id: string;
  fromToken: string;
  fromTokenSymbol: string;
  toToken: string;
  toTokenSymbol: string;
  fromAmount: string;    // raw wei
  fromAmountHuman: number; // human-readable
  toAmount: string;      // raw wei
  toAmountHuman: number;  // human-readable
  txHash: string;
  toolUsed: string;
  timestamp: number;     // ms since epoch
  status: 'completed' | 'pending' | 'failed';
}

const STORAGE_KEY = 'golda_swap_history';

function getAllSwaps(): SwapRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSwaps(swaps: SwapRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Keep last 50 swaps
    localStorage.setItem(STORAGE_KEY, JSON.stringify(swaps.slice(0, 50)));
  } catch {
    // localStorage full or unavailable — silently skip
  }
}

export function addSwapRecord(swap: SwapRecord): void {
  const swaps = getAllSwaps();
  // Avoid duplicates by txHash
  if (swaps.some(s => s.txHash === swap.txHash)) return;
  swaps.unshift(swap);
  saveSwaps(swaps);
}

export function updateSwapStatus(txHash: string, status: SwapRecord['status']): void {
  const swaps = getAllSwaps();
  const idx = swaps.findIndex(s => s.txHash === txHash);
  if (idx >= 0) {
    swaps[idx].status = status;
    saveSwaps(swaps);
  }
}

export function getSwapHistory(limit?: number): SwapRecord[] {
  const swaps = getAllSwaps();
  return limit ? swaps.slice(0, limit) : swaps;
}

export function clearSwapHistory(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
