import { ethers } from "ethers";

// ============================================
// Golda Finance — GoldaVault on Monad Mainnet
// ============================================
// MAINNET ONLY. Chain ID 143.
// One vault, one share token (gUSDC). Users deposit USDC, receive shares,
// request withdraw (burn + queue), then claim once the vault is liquid.
// LiFi swaps (USDC -> XAUt0 / WBTC) and yield moves are handled
// off-chain by the operator; this frontend only talks to the vault + USDC.
// ============================================

export const MONAD_CHAIN_ID = 143;

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.monad.xyz";

export const CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_CHAIN_ID || MONAD_CHAIN_ID
);

export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL || "https://monadscan.com";

// ============================================
// Contract addresses (Monad mainnet)
// ============================================

const VAULT_ADDRESS =
  process.env.NEXT_PUBLIC_GOLDA_VAULT_ADDRESS ||
  "0xbf8f03002e91daacc8e3597d650a4f1b2d21a39e";

const USDC_ADDRESS =
  process.env.NEXT_PUBLIC_USDC_ADDRESS ||
  "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";

// ============================================
// Hardcoded decimals (verified on-chain)
// ============================================
// These are confirmed via direct eth_call to the contracts on Monad mainnet.
// We hardcode them to avoid the BAD_DATA / CALL_EXCEPTION errors that occur
// when the RPC returns empty data for decimals() on some tokens.

const USDC_DECIMALS = 6;
const VAULT_SHARE_DECIMALS = 18; // gUSDC shares use 18 decimals (ERC20 default)

// ============================================
// Supported savings assets
// ============================================

export const SUPPORTED_ASSETS = [
  {
    id: "XAUT",
    label: "XAUt0",
    description: "Tether Gold — 1 token = 1 troy oz",
    address: "0x01bFF41798a0BcF287b996046Ca68b395DbC1071",
    decimals: 6,
    category: "gold",
  },
  {
    id: "WBTC",
    label: "WBTC",
    description: "Wrapped Bitcoin",
    address: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c",
    decimals: 8,
    category: "btc",
  },
] as const;

export type SupportedAssetId = (typeof SUPPORTED_ASSETS)[number]["id"];

// ============================================
// ABIs
// ============================================

const GOLDA_VAULT_ABI = [
  "function usdc() view returns (address)",
  "function operator() view returns (address)",
  "function navUSDC() view returns (uint256)",
  "function lastNavUpdate() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function sharePrice() view returns (uint256)",
  "function MIN_DEPOSIT() view returns (uint256)",
  "function SHARE_INIT() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function deposit(uint256 usdcAmount) returns (uint256 shares)",
  "function requestWithdraw(uint256 shares) returns (uint256 id)",
  "function claim(uint256 id)",
  "function withdrawals(uint256) view returns (address user, uint128 usdcOwed, bool settled)",
  "function userWithdrawals(address user) view returns (uint256[])",
  "function withdrawalsLength() view returns (uint256)",
  "event Deposit(address indexed user, uint256 usdcIn, uint256 sharesOut)",
  "event WithdrawRequested(address indexed user, uint256 indexed id, uint256 shares, uint256 usdcOwed)",
  "event WithdrawClaimed(uint256 indexed id, address indexed user, uint256 usdc)",
  "event NavReported(uint256 navUSDC, uint256 timestamp)",
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

export const CONTRACT_ADDRESSES = {
  GOLDA_VAULT: VAULT_ADDRESS,
  USDC: USDC_ADDRESS,
  LIFI_DIAMOND: "0x026F252016A7C47CDEf1F05a3Fc9E20C92a49C37",
  PERMIT2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  PERMIT2_PROXY: "0x3c6B2E0b7421254846C53c118e24c65d59eAe75e",
};

export const CONTRACT_ABIS = {
  GOLDA_VAULT: GOLDA_VAULT_ABI,
  USDC: ERC20_ABI,
};

// ============================================
// RPC Provider (singleton for reads)
// ============================================
// Public Monad RPCs (especially testnet) rate-limit aggressively. We mitigate
// pressure on three fronts:
//  1. JSON-RPC batching — ethers v6 collapses multiple concurrent eth_call
//     requests into a single array request. We keep batches small (≤5) so
//     a single bad batch doesn't poison everything but most concurrent
//     reads still merge into one HTTP request.
//  2. In-memory cache (`cached()` below) — same call within READ_TTL_MS is
//     served from memory. Page navigation, re-renders, and parallel hook
//     instances reuse one network round-trip.
//  3. Retry with exponential backoff for transient failures (`withRetry()`).

let _readProvider: ethers.JsonRpcProvider | null = null;

function readProvider(): ethers.JsonRpcProvider {
  if (!_readProvider) {
    const network = ethers.Network.from(CHAIN_ID);
    _readProvider = new ethers.JsonRpcProvider(RPC_URL, network, {
      staticNetwork: network, // pin to chain, no auto-detection
      batchMaxCount: 5,       // small batches: consolidate without big-batch failures
      batchStallTime: 20,     // ms — collect concurrent calls before sending
    });
  }
  return _readProvider;
}

// ----------------------------------------------------------------------------
// Read cache (TTL-based)
// ----------------------------------------------------------------------------
// Repeated reads of the same key within the TTL are served from memory.
// The cache is shared across all consumers in the same JS runtime (browser
// tab or server process), so multiple pages / hooks mounting concurrently
// only trigger one round-trip per key.

const READ_TTL_MS = 8000;
const _cache = new Map<string, { value: unknown; expiresAt: number }>();
const _inflight = new Map<string, Promise<unknown>>();

async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttl = READ_TTL_MS,
): Promise<T> {
  const now = Date.now();

  const hit = _cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;

  // De-dupe concurrent callers asking for the same key.
  const pending = _inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = (async () => {
    try {
      const value = await fn();
      _cache.set(key, { value, expiresAt: Date.now() + ttl });
      return value;
    } finally {
      _inflight.delete(key);
    }
  })();
  _inflight.set(key, promise);
  return promise;
}

/** Clear the read cache. Call after a successful write so the next read is fresh. */
export function invalidateReadCache(): void {
  _cache.clear();
}

/**
 * Retry wrapper for transient RPC failures (rate limits, batch hiccups).
 * Returns the fallback value if every attempt fails.
 */
async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T,
  attempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        // 120ms, 360ms backoff
        await new Promise(r => setTimeout(r, 120 * Math.pow(3, i)));
      }
    }
  }
  console.error(`${label}:`, lastErr);
  return fallback;
}

function vaultRead(provider: ethers.Provider) {
  return new ethers.Contract(VAULT_ADDRESS, GOLDA_VAULT_ABI, provider);
}

function usdcRead(provider: ethers.Provider) {
  return new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
}

// ============================================
// Reads — with hardcoded decimals & robust error handling
// ============================================

export async function getUSDCBalance(userAddress: string): Promise<number> {
  return withRetry(
    "getUSDCBalance",
    () => cached(`usdc-balance:${userAddress}`, async () => {
      const usdc = usdcRead(readProvider());
      const bal: bigint = await usdc.balanceOf(userAddress);
      return Number(ethers.formatUnits(bal, USDC_DECIMALS));
    }),
    0,
  );
}

export async function getShareBalance(userAddress: string): Promise<number> {
  return withRetry(
    "getShareBalance",
    () => cached(`share-balance:${userAddress}`, async () => {
      const vault = vaultRead(readProvider());
      const bal: bigint = await vault.balanceOf(userAddress);
      // Vault shares use 18 decimals (confirmed on-chain).
      return Number(ethers.formatUnits(bal, VAULT_SHARE_DECIMALS));
    }),
    0,
  );
}

/** Price of 1 share in USDC (human number). Defaults to 1.0 at genesis. */
export async function getSharePrice(): Promise<number> {
  return withRetry(
    "getSharePrice",
    () => cached("share-price", async () => {
      const vault = vaultRead(readProvider());
      const price: bigint = await vault.sharePrice();
      return Number(ethers.formatUnits(price, USDC_DECIMALS));
    }),
    1,
  );
}

export async function getNAV(): Promise<number> {
  return withRetry(
    "getNAV",
    () => cached("vault-nav", async () => {
      const vault = vaultRead(readProvider());
      const nav: bigint = await vault.navUSDC();
      return Number(ethers.formatUnits(nav, USDC_DECIMALS));
    }),
    0,
  );
}

export async function getUSDCAllowance(userAddress: string): Promise<number> {
  return withRetry(
    "getUSDCAllowance",
    () => cached(`usdc-allowance:${userAddress}`, async () => {
      const usdc = usdcRead(readProvider());
      const allowance: bigint = await usdc.allowance(userAddress, VAULT_ADDRESS);
      return Number(ethers.formatUnits(allowance, USDC_DECIMALS));
    }),
    0,
  );
}

export interface WithdrawalView {
  id: number;
  user: string;
  usdcOwed: number;
  settled: boolean;
  claimable: boolean;
}

export async function getUserWithdrawals(
  userAddress: string
): Promise<WithdrawalView[]> {
  return withRetry(
    "getUserWithdrawals",
    () => cached(`withdrawals:${userAddress}`, async () => {
      const provider = readProvider();
      const vault = vaultRead(provider);
      const usdc = usdcRead(provider);

      const ids: bigint[] = await vault.userWithdrawals(userAddress);
      if (ids.length === 0) return [];

      // Run vault USDC balance + per-id withdrawal lookups in parallel so
      // they fold into the same JSON-RPC batch (batchMaxCount=5).
      const [vaultUsdcBalRaw, ...withdrawalRows] = await Promise.all([
        usdc.balanceOf(VAULT_ADDRESS),
        ...ids.map(id => vault.withdrawals(id)),
      ]);

      let vaultBal = Number(ethers.formatUnits(vaultUsdcBalRaw, USDC_DECIMALS));

      const rows: WithdrawalView[] = withdrawalRows.map((w, i) => ({
        id: Number(ids[i]),
        user: w.user as string,
        usdcOwed: Number(ethers.formatUnits(w.usdcOwed, USDC_DECIMALS)),
        settled: w.settled as boolean,
        claimable: false,
      }));

      // Mark claimable when the vault has enough liquid USDC, greedily
      // consumed in queue order for display purposes.
      for (const row of rows) {
        if (row.settled) continue;
        if (vaultBal >= row.usdcOwed) {
          row.claimable = true;
          vaultBal -= row.usdcOwed;
        }
      }

      // Newest first
      return rows.sort((a, b) => b.id - a.id);
    }),
    [],
  );
}

export interface UserBalances {
  usdc: number;
  shares: number;
  sharePrice: number;
  navUSDC: number;
  shareValueUSDC: number;
  usdcAllowance: number;
  xaut: number;
  wbtc: number;
}

export async function getUserBalances(
  userAddress: string
): Promise<UserBalances> {
  const xautAsset = SUPPORTED_ASSETS.find(a => a.id === 'XAUT');
  const wbtcAsset = SUPPORTED_ASSETS.find(a => a.id === 'WBTC');

  const [usdc, shares, sharePrice, navUSDC, usdcAllowance, xaut, wbtc] = await Promise.all([
    getUSDCBalance(userAddress),
    getShareBalance(userAddress),
    getSharePrice(),
    getNAV(),
    getUSDCAllowance(userAddress),
    xautAsset ? getTokenBalance(xautAsset.address, userAddress, xautAsset.decimals) : Promise.resolve(0),
    wbtcAsset ? getTokenBalance(wbtcAsset.address, userAddress, wbtcAsset.decimals) : Promise.resolve(0),
  ]);

  return {
    usdc,
    shares,
    sharePrice,
    navUSDC,
    shareValueUSDC: shares * sharePrice,
    usdcAllowance,
    xaut,
    wbtc,
  };
}

// ============================================
// Token balance helper (for any ERC20 on Monad)
// ============================================

export async function getTokenBalance(
  tokenAddress: string,
  userAddress: string,
  decimals: number
): Promise<number> {
  return withRetry(
    `getTokenBalance(${tokenAddress})`,
    () => cached(`token-balance:${tokenAddress}:${userAddress}`, async () => {
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, readProvider());
      const bal: bigint = await contract.balanceOf(userAddress);
      return Number(ethers.formatUnits(bal, decimals));
    }),
    0,
  );
}

// ============================================
// Writes (need a connected signer)
// ============================================

export interface TxResult {
  txHash: string;
}

export async function approveUSDC(
  signer: ethers.Signer,
  usdcAmount: number
): Promise<TxResult> {
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
  const amountWei = ethers.parseUnits(usdcAmount.toString(), USDC_DECIMALS);
  const tx = await usdc.approve(VAULT_ADDRESS, amountWei);
  const receipt = await tx.wait();
  invalidateReadCache();
  return { txHash: receipt.hash };
}

/**
 * Grant infinite (MaxUint256) approval for USDC to the LiFi Diamond.
 * This allows the AI agent to execute swaps autonomously without
 * requiring per-transaction approval signatures.
 * One signature, then the agent can swap any amount forever.
 */
export async function approveUSDCToLiFi(
  signer: ethers.Signer
): Promise<TxResult> {
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
  const tx = await usdc.approve(CONTRACT_ADDRESSES.LIFI_DIAMOND, ethers.MaxUint256);
  const receipt = await tx.wait();
  invalidateReadCache();
  return { txHash: receipt.hash };
}

/**
 * Check if USDC has infinite approval to the LiFi Diamond.
 * Returns true if allowance >= MaxUint256 / 2 (practically infinite).
 */
export async function hasLiFiApproval(userAddress: string): Promise<boolean> {
  return withRetry(
    "hasLiFiApproval",
    () => cached(`lifi-approval:${userAddress}`, async () => {
      const usdc = usdcRead(readProvider());
      const allowance: bigint = await usdc.allowance(userAddress, CONTRACT_ADDRESSES.LIFI_DIAMOND);
      return allowance >= ethers.MaxUint256 / BigInt(2);
    }),
    false,
  );
}

export async function depositToVault(
  signer: ethers.Signer,
  usdcAmount: number
): Promise<TxResult> {
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
  const vault = new ethers.Contract(VAULT_ADDRESS, GOLDA_VAULT_ABI, signer);
  const owner = await signer.getAddress();

  const amountWei = ethers.parseUnits(usdcAmount.toString(), USDC_DECIMALS);

  const currentAllowance: bigint = await usdc.allowance(owner, VAULT_ADDRESS);
  if (currentAllowance < amountWei) {
    const approveTx = await usdc.approve(VAULT_ADDRESS, amountWei);
    await approveTx.wait();
  }

  const tx = await vault.deposit(amountWei);
  const receipt = await tx.wait();
  invalidateReadCache();
  return { txHash: receipt.hash };
}

export async function requestWithdrawFromVault(
  signer: ethers.Signer,
  shareAmount: number
): Promise<TxResult> {
  const vault = new ethers.Contract(VAULT_ADDRESS, GOLDA_VAULT_ABI, signer);
  // Shares use 18 decimals
  const amountWei = ethers.parseUnits(shareAmount.toString(), VAULT_SHARE_DECIMALS);
  const tx = await vault.requestWithdraw(amountWei);
  const receipt = await tx.wait();
  invalidateReadCache();
  return { txHash: receipt.hash };
}

export async function claimWithdrawal(
  signer: ethers.Signer,
  id: number
): Promise<TxResult> {
  const vault = new ethers.Contract(VAULT_ADDRESS, GOLDA_VAULT_ABI, signer);
  const tx = await vault.claim(id);
  const receipt = await tx.wait();
  invalidateReadCache();
  return { txHash: receipt.hash };
}
