/**
 * Golda Finance — LiFi SDK integration
 *
 * The vault is asset-agnostic on-chain: users deposit USDC, the operator
 * routes USDC -> chosen savings asset (XAUt0 / PAXG / WBTC) and supplies
 * the asset into yield protocols (Euler).
 *
 * On the frontend we use LiFi for two purposes:
 *  1) Quote preview — show the user how much of their chosen asset their
 *     deposit would buy at current market rates (transparency).
 *  2) Direct user swap link — open the LiFi widget/explorer with the
 *     prefilled swap as a fallback for "I want to swap myself".
 *
 * The vault `deposit()` call itself does NOT perform a swap — that runs
 * off-chain from the operator wallet using these same LiFi quotes.
 */

import {
  createConfig,
  getQuote,
  ChainId,
  type LiFiStep,
} from '@lifi/sdk';
import { ethers } from 'ethers';
import type { SavingsAssetId } from '@/lib/types';

let configured = false;

function ensureConfig() {
  if (configured) return;
  createConfig({ integrator: 'GoldaFinance' });
  configured = true;
}

// ============================================
// Asset routing
// ============================================
//
// The operator targets these mainnet assets when fulfilling deposits.
// Quotes are fetched on Ethereum because that's where deepest liquidity
// for tokenized gold (PAXG/XAUt0) and WBTC sits — even if the source
// chain ends up being Arbitrum/Base/etc., the quote shape is the same.

const ETHEREUM_USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

interface AssetTarget {
  chainId: number;
  address: string;
  decimals: number;
  symbol: string;
}

export const LIFI_ASSET_MAP: Record<SavingsAssetId, AssetTarget> = {
  PAXG: {
    chainId: ChainId.ETH,
    address: '0x45804880De22913dAFE09f4980848ECE6EcbAf78',
    decimals: 18,
    symbol: 'PAXG',
  },
  XAUT: {
    chainId: ChainId.ETH,
    address: '0x68749665FF8D2d112Fa859AA293F07A622782F38',
    decimals: 6,
    symbol: 'XAUT',
  },
  WBTC: {
    chainId: ChainId.ETH,
    address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    decimals: 8,
    symbol: 'WBTC',
  },
};

export interface DepositQuotePreview {
  asset: SavingsAssetId;
  symbol: string;
  estimatedAmount: number;     // human-readable amount of asset
  estimatedAmountUSD: number;  // USD value of that amount
  pricePerUnit: number;        // USD per 1 unit of asset
  feeUSD: number;              // total LiFi/gas fees in USD
  durationSeconds: number;     // estimated time to settle
  toolUsed: string;            // bridge/dex name
}

/**
 * Fetch a LiFi quote that previews how much of the target asset a USDC
 * deposit would buy at current market rates. The quote is sourced from
 * Ethereum mainnet (deepest liquidity) and uses a placeholder address
 * if no wallet is connected — this is a read-only preview.
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

  // LiFi expects amounts in smallest units. USDC is 6 decimals.
  const fromAmount = ethers.parseUnits(usdcAmount.toString(), 6).toString();

  try {
    const step: LiFiStep = await getQuote({
      fromChain: ChainId.ETH,
      toChain: target.chainId,
      fromToken: ETHEREUM_USDC,
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

/**
 * Build a deep link into the LiFi widget pre-filled with the equivalent
 * swap, for users who want to execute it themselves.
 */
export function buildLifiSwapLink(usdcAmount: number, asset: SavingsAssetId): string {
  const target = LIFI_ASSET_MAP[asset];
  if (!target) return 'https://jumper.exchange';
  const params = new URLSearchParams({
    fromChain: String(ChainId.ETH),
    toChain: String(target.chainId),
    fromToken: ETHEREUM_USDC,
    toToken: target.address,
    fromAmount: usdcAmount.toString(),
  });
  return `https://jumper.exchange/?${params.toString()}`;
}

export type { LiFiStep };
