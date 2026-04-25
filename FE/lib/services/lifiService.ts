/**
 * Golda Finance — LiFi SDK integration (Monad-focused)
 *
 * Full LiFi integration on Monad (chain 143):
 *  1) Same-chain swaps on Monad — USDC -> XAUt0 / WBTC / WETH / wstETH etc.
 *  2) Cross-chain bridge + swap — bring USDC from Ethereum/Arbitrum/Base to Monad
 *  3) Quote preview — show the user how much of the target asset they'll receive
 *  4) Swap execution — sign and send the LiFi transaction via the connected wallet
 *  5) Status tracking — poll transfer status until DONE or FAILED
 *
 * The vault `deposit()` call itself does NOT perform a swap — the operator
 * routes USDC -> chosen savings asset off-chain using these same LiFi quotes.
 * Users can also swap directly via the Swap UI component.
 */

import {
  createConfig,
  getQuote,
  getRoutes,
  getStatus,
  type LiFiStep,
  type Route,
} from '@lifi/sdk';
import { ethers } from 'ethers';
import type { SavingsAssetId } from '@/lib/types';

let configured = false;

function ensureConfig() {
  if (configured) return;
  createConfig({
    integrator: 'GoldaFinance',
  });
  configured = true;
}

// ============================================
// Monad chain & token addresses
// ============================================

export const MONAD_CHAIN_ID = 143;

/** LiFi Diamond on Monad — the approval target & entry point for swaps */
export const LIFI_DIAMOND_MONAD = '0x026F252016A7C47CDEf1F05a3Fc9E20C92a49C37';
export const PERMIT2_MONAD = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
export const PERMIT2_PROXY_MONAD = '0x3c6B2E0b7421254846C53c118e24c65d59eAe75e';

/** Well-known tokens on Monad (verified via LiFi /tokens API) */
export const MONAD_TOKENS = {
  MON:   { address: '0x0000000000000000000000000000000000000000', decimals: 18, symbol: 'MON' },
  WMON:  { address: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', decimals: 18, symbol: 'WMON' },
  USDC:  { address: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', decimals: 6,  symbol: 'USDC' },
  USDT0: { address: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', decimals: 6,  symbol: 'USDT0' },
  USD1:  { address: '0x111111d2bf19e43C34263401e0CAd979eD1cdb61', decimals: 6,  symbol: 'USD1' },
  WBTC:  { address: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', decimals: 8,  symbol: 'WBTC' },
  cbBTC: { address: '0xd18B7EC58Cdf4876f6AFebd3Ed1730e4Ce10414b', decimals: 8,  symbol: 'cbBTC' },
  LBTC:  { address: '0xecAc9C5F704e954931349Da37F60E39f515c11c1', decimals: 8,  symbol: 'LBTC' },
  WETH:  { address: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', decimals: 18, symbol: 'WETH' },
  wstETH:{ address: '0x10Aeaf63194db8d453d4D85a06E5eFE1dd0b5417', decimals: 18, symbol: 'wstETH' },
  weETH: { address: '0xA3D68b74bF0528fdD07263c60d6488749044914b', decimals: 18, symbol: 'weETH' },
  XAUt0: { address: '0x01bFF41798a0BcF287b996046Ca68b395DbC1071', decimals: 6,  symbol: 'XAUt0' },
  AUSD:  { address: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', decimals: 6,  symbol: 'AUSD' },
} as const;

export type MonadTokenSymbol = keyof typeof MONAD_TOKENS;

// ============================================
// Asset routing (vault savings targets)
// ============================================

interface AssetTarget {
  chainId: number;
  address: string;
  decimals: number;
  symbol: string;
}

export const LIFI_ASSET_MAP: Record<SavingsAssetId, AssetTarget> = {
  XAUT: {
    chainId: MONAD_CHAIN_ID,
    address: MONAD_TOKENS.XAUt0.address,
    decimals: MONAD_TOKENS.XAUt0.decimals,
    symbol: 'XAUt0',
  },
  WBTC: {
    chainId: MONAD_CHAIN_ID,
    address: MONAD_TOKENS.WBTC.address,
    decimals: MONAD_TOKENS.WBTC.decimals,
    symbol: 'WBTC',
  },
};

// ============================================
// Quote types
// ============================================

export interface SwapQuote {
  fromToken: string;
  fromTokenSymbol: string;
  fromChainId: number;
  fromAmount: string;
  toToken: string;
  toTokenSymbol: string;
  toChainId: number;
  toAmount: string;
  toAmountMin: string;
  toAmountUSD: number;
  fromAmountUSD: number;
  feeUSD: number;
  gasUSD: number;
  durationSeconds: number;
  toolUsed: string;
  slippage: number;
  approvalAddress: string;
  /** Raw LiFi step — needed for execution */
  _step: LiFiStep;
}

export interface DepositQuotePreview {
  asset: SavingsAssetId;
  symbol: string;
  estimatedAmount: number;
  estimatedAmountUSD: number;
  pricePerUnit: number;
  feeUSD: number;
  durationSeconds: number;
  toolUsed: string;
}

export interface SwapStatus {
  status: 'NOT_FOUND' | 'PENDING' | 'DONE' | 'FAILED';
  substatus?: string;
  txHash?: string;
}

// ============================================
// Same-chain swap on Monad
// ============================================

/**
 * Get a quote for a same-chain swap on Monad.
 * Example: USDC -> WBTC, MON -> WETH, etc.
 */
export async function getMonadSwapQuote(params: {
  fromToken: string;
  toToken: string;
  fromAmount: string;   // in smallest unit (wei)
  fromAddress: string;
  slippage?: number;    // default 0.005 (0.5%)
}): Promise<SwapQuote | null> {
  ensureConfig();

  try {
    const step: LiFiStep = await getQuote({
      fromChain: MONAD_CHAIN_ID,
      toChain: MONAD_CHAIN_ID,
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      fromAddress: params.fromAddress,
      slippage: params.slippage ?? 0.005,
    });

    return stepToSwapQuote(step);
  } catch (err) {
    console.warn('[LiFi] Monad swap quote failed:', err);
    return null;
  }
}

/**
 * Get multiple route options for a swap on Monad.
 * Useful for showing the user alternatives (different DEXs, different paths).
 */
export async function getMonadSwapRoutes(params: {
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
  slippage?: number;
}): Promise<SwapQuote[]> {
  ensureConfig();

  try {
    const routesResult = await getRoutes({
      fromChainId: MONAD_CHAIN_ID,
      toChainId: MONAD_CHAIN_ID,
      fromTokenAddress: params.fromToken,
      toTokenAddress: params.toToken,
      fromAmount: params.fromAmount,
      fromAddress: params.fromAddress,
      options: {
        slippage: params.slippage ?? 0.005,
      },
    });

    const routes: Route[] = routesResult.routes ?? [];
    return routes
      .flatMap((r) => r.steps)
      .map((step) => stepToSwapQuote(step))
      .filter((q): q is SwapQuote => q !== null);
  } catch (err) {
    console.warn('[LiFi] Monad swap routes failed:', err);
    return [];
  }
}

// ============================================
// Cross-chain bridge + swap to Monad
// ============================================

/**
 * Get a quote for bridging tokens from another chain to Monad.
 * Example: USDC on Ethereum -> USDC on Monad, ETH on Arbitrum -> MON on Monad.
 */
export async function getBridgeToMonadQuote(params: {
  fromChainId: number;
  fromToken: string;
  toToken: string;     // token on Monad
  fromAmount: string;
  fromAddress: string;
  slippage?: number;
}): Promise<SwapQuote | null> {
  ensureConfig();

  try {
    const step: LiFiStep = await getQuote({
      fromChain: params.fromChainId,
      toChain: MONAD_CHAIN_ID,
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      fromAddress: params.fromAddress,
      slippage: params.slippage ?? 0.03, // higher slippage for bridges
    });

    return stepToSwapQuote(step);
  } catch (err) {
    console.warn('[LiFi] bridge-to-Monad quote failed:', err);
    return null;
  }
}

// ============================================
// Vault deposit quote preview (Monad-native)
// ============================================

/**
 * Fetch a LiFi quote that previews how much of the target asset a USDC
 * deposit would buy at current market rates. Same-chain on Monad.
 */
export async function getDepositQuotePreview(
  usdcAmount: number,
  asset: SavingsAssetId,
  fromAddress?: string
): Promise<DepositQuotePreview | null> {
  ensureConfig();
  if (usdcAmount <= 0) return null;

  const target = LIFI_ASSET_MAP[asset];
  if (!target) return null;

  const fromAmount = ethers.parseUnits(usdcAmount.toString(), 6).toString();

  try {
    const step: LiFiStep = await getQuote({
      fromChain: MONAD_CHAIN_ID,
      toChain: MONAD_CHAIN_ID,
      fromToken: MONAD_TOKENS.USDC.address,
      toToken: target.address,
      fromAmount,
      fromAddress: fromAddress || '0x0000000000000000000000000000000000000001',
    });

    const estimate = step.estimate;
    const estimatedAmount = Number(
      ethers.formatUnits(estimate.toAmount, target.decimals)
    );
    const estimatedAmountUSD = Number(estimate.toAmountUSD ?? '0');
    const fromAmountUSD = Number(estimate.fromAmountUSD ?? usdcAmount.toString());
    const feeUSD =
      estimate.feeCosts?.reduce(
        (sum, fc) => sum + Number(fc.amountUSD ?? 0),
        0
      ) ?? Math.max(0, fromAmountUSD - estimatedAmountUSD);
    const pricePerUnit =
      estimatedAmount > 0 ? estimatedAmountUSD / estimatedAmount : 0;

    return {
      asset,
      symbol: target.symbol,
      estimatedAmount,
      estimatedAmountUSD,
      pricePerUnit,
      feeUSD,
      durationSeconds: estimate.executionDuration ?? 0,
      toolUsed: step.toolDetails?.name ?? step.tool,
    };
  } catch (err) {
    console.warn('[LiFi] quote preview failed:', err);
    return null;
  }
}

// ============================================
// Swap execution
// ============================================

/**
 * Execute a swap using the LiFi SDK. Requires a connected ethers Signer.
 * The signer must be on Monad (chain 143).
 *
 * Steps:
 *  1. Approve USDC (or fromToken) to the LiFi Diamond if needed
 *  2. Send the transaction from the quote's transactionRequest
 *  3. Return the tx hash for status tracking
 */
export async function executeMonadSwap(
  signer: ethers.Signer,
  quote: SwapQuote
): Promise<{ txHash: string }> {
  const step = quote._step;
  const txRequest = step.transactionRequest;

  if (!txRequest) {
    throw new Error('No transaction request in quote — re-quote with a real fromAddress');
  }

  // 1. Check & set approval if needed
  const fromToken = step.action.fromToken;
  const approvalAddress = quote.approvalAddress;

  if (fromToken.address !== ethers.ZeroAddress) {
    const tokenContract = new ethers.Contract(
      fromToken.address,
      ['function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)'],
      signer
    );

    const owner = await signer.getAddress();
    const allowance: bigint = await tokenContract.allowance(owner, approvalAddress);

    if (allowance < BigInt(step.action.fromAmount)) {
      console.log('[LiFi] approving token for swap...');
      const approveTx = await tokenContract.approve(approvalAddress, ethers.MaxUint256);
      await approveTx.wait();
      console.log('[LiFi] approval confirmed');
    }
  }

  // 2. Send the LiFi transaction — pass txRequest directly so ethers handles
  //    gas field normalisation (EIP-1559 vs legacy, hex → bigint, etc.)
  const tx = await signer.sendTransaction({
    to:       txRequest.to,
    data:     txRequest.data,
    value:    txRequest.value    !== undefined ? BigInt(txRequest.value)    : undefined,
    gasLimit: txRequest.gasLimit !== undefined ? BigInt(txRequest.gasLimit) : undefined,
    // Prefer EIP-1559 fields; fall back to legacy gasPrice
    ...(txRequest.maxFeePerGas
      ? {
          maxFeePerGas:         BigInt(txRequest.maxFeePerGas),
          maxPriorityFeePerGas: txRequest.maxPriorityFeePerGas
            ? BigInt(txRequest.maxPriorityFeePerGas)
            : BigInt(txRequest.maxFeePerGas),
        }
      : txRequest.gasPrice
        ? { gasPrice: BigInt(txRequest.gasPrice) }
        : {}),
  });

  const receipt = await tx.wait(1);
  console.log('[LiFi] swap confirmed block:', receipt?.blockNumber);

  return { txHash: tx.hash };
}

// ============================================
// Status tracking
// ============================================

/**
 * Check the status of a cross-chain or same-chain LiFi transfer.
 * For same-chain swaps on Monad, status should be DONE immediately after
 * the tx is confirmed. For bridges, poll every 10-30 seconds.
 */
export async function checkSwapStatus(params: {
  txHash: string;
  bridge?: string;
  fromChainId?: number;
  toChainId?: number;
}): Promise<SwapStatus> {
  ensureConfig();

  try {
    const status = await getStatus({
      txHash: params.txHash,
      bridge: params.bridge,
      fromChain: params.fromChainId ?? MONAD_CHAIN_ID,
      toChain: params.toChainId ?? MONAD_CHAIN_ID,
    });

    return {
      status: status.status as SwapStatus['status'],
      substatus: status.substatus ?? undefined,
      txHash: params.txHash,
    };
  } catch (err) {
    console.warn('[LiFi] status check failed:', err);
    return { status: 'NOT_FOUND', txHash: params.txHash };
  }
}

/**
 * Poll swap status until it reaches a terminal state (DONE or FAILED).
 * Returns the final status.
 */
export async function waitForSwapCompletion(
  txHash: string,
  options?: {
    bridge?: string;
    fromChainId?: number;
    toChainId?: number;
    pollIntervalMs?: number;
    timeoutMs?: number;
  }
): Promise<SwapStatus> {
  const pollInterval = options?.pollIntervalMs ?? 15000;
  const timeout = options?.timeoutMs ?? 600000; // 10 min
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const status = await checkSwapStatus({
      txHash,
      bridge: options?.bridge,
      fromChainId: options?.fromChainId ?? MONAD_CHAIN_ID,
      toChainId: options?.toChainId ?? MONAD_CHAIN_ID,
    });

    if (status.status === 'DONE' || status.status === 'FAILED') {
      return status;
    }

    await new Promise((r) => setTimeout(r, pollInterval));
  }

  return { status: 'PENDING', txHash };
}

// ============================================
// Deep link builder
// ============================================

/**
 * Build a deep link into the LiFi/Jumper widget pre-filled with a swap.
 */
export function buildLifiSwapLink(params: {
  fromChainId?: number;
  toChainId?: number;
  fromToken: string;
  toToken: string;
  fromAmount: string;
}): string {
  const p = new URLSearchParams({
    fromChain: String(params.fromChainId ?? MONAD_CHAIN_ID),
    toChain: String(params.toChainId ?? MONAD_CHAIN_ID),
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: params.fromAmount,
  });
  return `https://jumper.exchange/?${p.toString()}`;
}

// ============================================
// Token list fetching
// ============================================

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  priceUSD: string;
  logoURI?: string;
}

/**
 * Fetch all tokens available on Monad via LiFi.
 */
export async function getMonadTokens(): Promise<TokenInfo[]> {
  try {
    const res = await fetch('https://li.quest/v1/tokens?chains=143');
    const data = await res.json();
    const tokens: TokenInfo[] = (data.tokens?.['143'] ?? []).map((t: Record<string, unknown>) => ({
      address: t.address as string,
      symbol: t.symbol as string,
      name: t.name as string,
      decimals: t.decimals as number,
      priceUSD: (t.priceUSD as string) ?? '0',
      logoURI: t.logoURI as string | undefined,
    }));
    return tokens;
  } catch (err) {
    console.warn('[LiFi] token fetch failed:', err);
    return [];
  }
}

// ============================================
// Internal helpers
// ============================================

function stepToSwapQuote(step: LiFiStep): SwapQuote | null {
  try {
    const estimate = step.estimate;
    const action = step.action;

    return {
      fromToken: action.fromToken.address,
      fromTokenSymbol: action.fromToken.symbol,
      fromChainId: action.fromChainId,
      fromAmount: action.fromAmount,
      toToken: action.toToken.address,
      toTokenSymbol: action.toToken.symbol,
      toChainId: action.toChainId,
      toAmount: estimate.toAmount,
      toAmountMin: estimate.toAmountMin,
      toAmountUSD: Number(estimate.toAmountUSD ?? '0'),
      fromAmountUSD: Number(estimate.fromAmountUSD ?? '0'),
      feeUSD:
        estimate.feeCosts?.reduce(
          (sum, fc) => sum + Number(fc.amountUSD ?? 0),
          0
        ) ?? 0,
      gasUSD:
        estimate.gasCosts?.reduce(
          (sum, gc) => sum + Number(gc.amountUSD ?? 0),
          0
        ) ?? 0,
      durationSeconds: estimate.executionDuration ?? 0,
      toolUsed: step.toolDetails?.name ?? step.tool,
      slippage: action.slippage ?? 0.005,
      approvalAddress: estimate.approvalAddress,
      _step: step,
    };
  } catch (err) {
    console.warn('[LiFi] stepToSwapQuote failed:', err);
    return null;
  }
}

// ============================================
// Auto-swap for AI Agent (one-approval flow)
// ============================================

/**
 * Execute an auto-swap for the AI agent.
 * Prerequisites: user must have approved USDC to LiFi Diamond (infinite approve).
 *
 * This function:
 *  1. Gets a fresh quote for USDC -> targetAsset on Monad
 *  2. Sends the LiFi transaction using the signer
 *  3. Returns tx hash + estimated output amount
 *
 * The user only needs to sign ONE approval transaction (approveUSDCToLiFi).
 * After that, the agent can call this function anytime.
 */
export async function agentAutoSwap(params: {
  signer: ethers.Signer;
  usdcAmount: number;  // human-readable USDC amount (e.g. 50.0)
  targetAsset: SavingsAssetId;
  slippage?: number;
}): Promise<{ txHash: string; estimatedOutput: number; toSymbol: string }> {
  ensureConfig();

  const target = LIFI_ASSET_MAP[params.targetAsset];
  if (!target) throw new Error(`Unknown target asset: ${params.targetAsset}`);

  const fromAmount = ethers.parseUnits(params.usdcAmount.toString(), 6).toString();
  const owner = await params.signer.getAddress();

  // 1. Get fresh quote
  const step: LiFiStep = await getQuote({
    fromChain: MONAD_CHAIN_ID,
    toChain: MONAD_CHAIN_ID,
    fromToken: MONAD_TOKENS.USDC.address,
    toToken: target.address,
    fromAmount,
    fromAddress: owner,
    slippage: params.slippage ?? 0.01, // 1% slippage for agent trades
  });

  const txRequest = step.transactionRequest;
  if (!txRequest) {
    throw new Error('No transaction request in quote — cannot execute auto-swap');
  }

  // 2. Send — approval is already infinite (granted by approveUSDCToLiFi)
  const tx = await params.signer.sendTransaction({
    to:       txRequest.to,
    data:     txRequest.data,
    value:    txRequest.value    !== undefined ? BigInt(txRequest.value)    : undefined,
    gasLimit: txRequest.gasLimit !== undefined ? BigInt(txRequest.gasLimit) : undefined,
    ...(txRequest.maxFeePerGas
      ? {
          maxFeePerGas:         BigInt(txRequest.maxFeePerGas),
          maxPriorityFeePerGas: txRequest.maxPriorityFeePerGas
            ? BigInt(txRequest.maxPriorityFeePerGas)
            : BigInt(txRequest.maxFeePerGas),
        }
      : txRequest.gasPrice
        ? { gasPrice: BigInt(txRequest.gasPrice) }
        : {}),
  });

  // 3. Wait for confirmation
  const receipt = await tx.wait(1);
  console.log('[LiFi Agent] auto-swap confirmed block:', receipt?.blockNumber);

  const estimatedOutput = Number(
    ethers.formatUnits(step.estimate.toAmount, target.decimals)
  );

  return {
    txHash: tx.hash,
    estimatedOutput,
    toSymbol: target.symbol,
  };
}

export type { LiFiStep, Route };
