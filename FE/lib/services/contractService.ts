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

let _readProvider: ethers.JsonRpcProvider | null = null;

function readProvider(): ethers.JsonRpcProvider {
  if (!_readProvider) {
    _readProvider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID, {
      staticNetwork: true, // prevent auto-chain detection which can cause issues
    });
  }
  return _readProvider;
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
  try {
    const usdc = usdcRead(readProvider());
    const bal: bigint = await usdc.balanceOf(userAddress);
    return Number(ethers.formatUnits(bal, USDC_DECIMALS));
  } catch (err) {
    console.error("getUSDCBalance:", err);
    return 0;
  }
}

export async function getShareBalance(userAddress: string): Promise<number> {
  try {
    const vault = vaultRead(readProvider());
    const bal: bigint = await vault.balanceOf(userAddress);
    // Vault shares use 18 decimals (confirmed on-chain: decimals() returns 18)
    return Number(ethers.formatUnits(bal, VAULT_SHARE_DECIMALS));
  } catch (err) {
    console.error("getShareBalance:", err);
    return 0;
  }
}

/** Price of 1 share in USDC (human number). Defaults to 1.0 at genesis. */
export async function getSharePrice(): Promise<number> {
  try {
    const vault = vaultRead(readProvider());
    const price: bigint = await vault.sharePrice();
    // sharePrice returns USDC units (6 decimals) — confirmed on-chain
    return Number(ethers.formatUnits(price, USDC_DECIMALS));
  } catch (err) {
    console.error("getSharePrice:", err);
    return 1;
  }
}

export async function getNAV(): Promise<number> {
  try {
    const vault = vaultRead(readProvider());
    const nav: bigint = await vault.navUSDC();
    // navUSDC is in USDC units (6 decimals)
    return Number(ethers.formatUnits(nav, USDC_DECIMALS));
  } catch (err) {
    console.error("getNAV:", err);
    return 0;
  }
}

export async function getUSDCAllowance(userAddress: string): Promise<number> {
  try {
    const usdc = usdcRead(readProvider());
    const allowance: bigint = await usdc.allowance(userAddress, VAULT_ADDRESS);
    return Number(ethers.formatUnits(allowance, USDC_DECIMALS));
  } catch (err) {
    console.error("getUSDCAllowance:", err);
    return 0;
  }
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
  try {
    const provider = readProvider();
    const vault = vaultRead(provider);
    const usdc = usdcRead(provider);

    const ids: bigint[] = await vault.userWithdrawals(userAddress);
    if (ids.length === 0) return [];

    const vaultUsdcBalRaw: bigint = await usdc.balanceOf(VAULT_ADDRESS);
    let vaultBal = Number(ethers.formatUnits(vaultUsdcBalRaw, USDC_DECIMALS));

    const rows: WithdrawalView[] = await Promise.all(
      ids.map(async (idBn) => {
        const id = Number(idBn);
        const w = await vault.withdrawals(id);
        // usdcOwed is stored in USDC units (6 decimals)
        const owed = Number(ethers.formatUnits(w.usdcOwed, USDC_DECIMALS));
        return {
          id,
          user: w.user as string,
          usdcOwed: owed,
          settled: w.settled as boolean,
          claimable: false,
        };
      })
    );

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
  } catch (err) {
    console.error("getUserWithdrawals:", err);
    return [];
  }
}

export interface UserBalances {
  usdc: number;
  shares: number;
  sharePrice: number;
  navUSDC: number;
  shareValueUSDC: number;
  usdcAllowance: number;
}

export async function getUserBalances(
  userAddress: string
): Promise<UserBalances> {
  const [usdc, shares, sharePrice, navUSDC, usdcAllowance] = await Promise.all([
    getUSDCBalance(userAddress),
    getShareBalance(userAddress),
    getSharePrice(),
    getNAV(),
    getUSDCAllowance(userAddress),
  ]);

  return {
    usdc,
    shares,
    sharePrice,
    navUSDC,
    shareValueUSDC: shares * sharePrice,
    usdcAllowance,
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
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, readProvider());
    const bal: bigint = await contract.balanceOf(userAddress);
    return Number(ethers.formatUnits(bal, decimals));
  } catch (err) {
    console.error("getTokenBalance:", err);
    return 0;
  }
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
  return { txHash: receipt.hash };
}

/**
 * Check if USDC has infinite approval to the LiFi Diamond.
 * Returns true if allowance >= MaxUint256 / 2 (practically infinite).
 */
export async function hasLiFiApproval(userAddress: string): Promise<boolean> {
  try {
    const usdc = usdcRead(readProvider());
    const allowance: bigint = await usdc.allowance(userAddress, CONTRACT_ADDRESSES.LIFI_DIAMOND);
    return allowance >= ethers.MaxUint256 / BigInt(2);
  } catch (err) {
    console.error("hasLiFiApproval:", err);
    return false;
  }
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
  return { txHash: receipt.hash };
}

export async function claimWithdrawal(
  signer: ethers.Signer,
  id: number
): Promise<TxResult> {
  const vault = new ethers.Contract(VAULT_ADDRESS, GOLDA_VAULT_ABI, signer);
  const tx = await vault.claim(id);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}
