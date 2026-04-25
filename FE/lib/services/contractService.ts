import { ethers } from "ethers";

// ============================================
// Golda Finance — GoldaVault on Monad
// ============================================
// One vault, one share token (gUSDC). Users deposit USDC, receive shares,
// request withdraw (burn + queue), then claim once the vault is liquid.
// LiFi swaps (USDC -> XAUt0 / WBTC / PAXG) and yield moves are handled
// off-chain by the operator; this frontend only talks to the vault + USDC.
// ============================================

export const MONAD_TESTNET_CHAIN_ID = 10143;
export const MONAD_MAINNET_CHAIN_ID = 143;

const DEFAULT_RPC_URL = "https://testnet-rpc.monad.xyz";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || DEFAULT_RPC_URL;

export const CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_CHAIN_ID || MONAD_TESTNET_CHAIN_ID
);

export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ||
  (CHAIN_ID === MONAD_MAINNET_CHAIN_ID
    ? "https://monadscan.com"
    : "https://testnet.monadscan.com");

// Deployed contracts (same address on mainnet and testnet per SC/README.md)
const VAULT_ADDRESS =
  process.env.NEXT_PUBLIC_GOLDA_VAULT_ADDRESS ||
  "0xbf8f03002e91daacc8e3597d650a4f1b2d21a39e";

const USDC_ADDRESS =
  process.env.NEXT_PUBLIC_USDC_ADDRESS ||
  "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";

// Supported savings assets — the contract itself is asset-agnostic, the
// operator routes USDC -> the selected asset via LiFi off-chain. We still
// want the user to express a preference so the backend knows what to buy.
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
    id: "PAXG",
    label: "PAXG",
    description: "Paxos Gold — 1 token = 1 fine troy oz",
    address: "",
    decimals: 18,
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

// Minimal GoldaVault ABI — only the entries the frontend uses.
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
};

export const CONTRACT_ABIS = {
  GOLDA_VAULT: GOLDA_VAULT_ABI,
  USDC: ERC20_ABI,
};

// ============================================
// Reads
// ============================================

function readProvider() {
  return new ethers.JsonRpcProvider(RPC_URL);
}

function vaultRead(provider: ethers.Provider) {
  return new ethers.Contract(VAULT_ADDRESS, GOLDA_VAULT_ABI, provider);
}

function usdcRead(provider: ethers.Provider) {
  return new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
}

export async function getUSDCBalance(userAddress: string): Promise<number> {
  try {
    const usdc = usdcRead(readProvider());
    const [bal, dec] = await Promise.all([
      usdc.balanceOf(userAddress),
      usdc.decimals(),
    ]);
    return Number(ethers.formatUnits(bal, dec));
  } catch (err) {
    console.error("getUSDCBalance:", err);
    return 0;
  }
}

export async function getShareBalance(userAddress: string): Promise<number> {
  try {
    const vault = vaultRead(readProvider());
    const bal = await vault.balanceOf(userAddress);
    // shares use the same 6 decimals as USDC (SHARE_INIT = 1e6)
    return Number(ethers.formatUnits(bal, 6));
  } catch (err) {
    console.error("getShareBalance:", err);
    return 0;
  }
}

/** Price of 1 share in USDC (human number). Defaults to 1.0 at genesis. */
export async function getSharePrice(): Promise<number> {
  try {
    const vault = vaultRead(readProvider());
    const price = await vault.sharePrice();
    return Number(ethers.formatUnits(price, 6));
  } catch (err) {
    console.error("getSharePrice:", err);
    return 1;
  }
}

export async function getNAV(): Promise<number> {
  try {
    const vault = vaultRead(readProvider());
    const nav = await vault.navUSDC();
    return Number(ethers.formatUnits(nav, 6));
  } catch (err) {
    console.error("getNAV:", err);
    return 0;
  }
}

export async function getUSDCAllowance(userAddress: string): Promise<number> {
  try {
    const usdc = usdcRead(readProvider());
    const [allowance, dec] = await Promise.all([
      usdc.allowance(userAddress, VAULT_ADDRESS),
      usdc.decimals(),
    ]);
    return Number(ethers.formatUnits(allowance, dec));
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

    const [vaultUsdcBalRaw, dec] = await Promise.all([
      usdc.balanceOf(VAULT_ADDRESS),
      usdc.decimals(),
    ]);
    let vaultBal = Number(ethers.formatUnits(vaultUsdcBalRaw, dec));

    const rows: WithdrawalView[] = await Promise.all(
      ids.map(async (idBn) => {
        const id = Number(idBn);
        const w = await vault.withdrawals(id);
        const owed = Number(ethers.formatUnits(w.usdcOwed, dec));
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
// Writes (need a connected signer)
// ============================================

export interface TxResult {
  txHash: string;
}

async function usdcDecimals(contract: ethers.Contract): Promise<number> {
  try {
    return Number(await contract.decimals());
  } catch {
    return 6;
  }
}

export async function approveUSDC(
  signer: ethers.Signer,
  usdcAmount: number
): Promise<TxResult> {
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
  const dec = await usdcDecimals(usdc);
  const amountWei = ethers.parseUnits(usdcAmount.toString(), dec);
  const tx = await usdc.approve(VAULT_ADDRESS, amountWei);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

export async function depositToVault(
  signer: ethers.Signer,
  usdcAmount: number
): Promise<TxResult> {
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
  const vault = new ethers.Contract(VAULT_ADDRESS, GOLDA_VAULT_ABI, signer);
  const owner = await signer.getAddress();

  const dec = await usdcDecimals(usdc);
  const amountWei = ethers.parseUnits(usdcAmount.toString(), dec);

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
  // Shares share the same 6-dp scale as USDC (see SHARE_INIT in contract).
  const amountWei = ethers.parseUnits(shareAmount.toString(), 6);
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
