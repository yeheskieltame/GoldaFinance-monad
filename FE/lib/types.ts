// ============================================
// Golda Finance — Monad Mainnet Types
// ============================================

export interface ContractAddresses {
  GOLDA_VAULT: string;
  USDC: string;
}

export interface VaultBalances {
  usdc: number;
  shares: number;
  sharePrice: number;
  navUSDC: number;
  shareValueUSDC: number;
  usdcAllowance: number;
  xaut: number;
  wbtc: number;
}

export interface TransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

// Event payloads
export interface DepositEvent {
  user: string;
  usdcIn: bigint;
  sharesOut: bigint;
}

export interface WithdrawRequestedEvent {
  user: string;
  id: bigint;
  shares: bigint;
  usdcOwed: bigint;
}

export interface WithdrawClaimedEvent {
  id: bigint;
  user: string;
  usdc: bigint;
}

// Savings asset preference. The contract is asset-agnostic; the operator
// routes USDC -> the selected asset via LiFi off-chain.
export type SavingsAssetId = "XAUT" | "WBTC";

// Network — Monad Mainnet ONLY
export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export const MONAD_MAINNET: NetworkConfig = {
  chainId: 143,
  name: "Monad",
  rpcUrl: "https://rpc.monad.xyz",
  explorerUrl: "https://monadscan.com",
  nativeCurrency: {
    name: "MON",
    symbol: "MON",
    decimals: 18,
  },
};
