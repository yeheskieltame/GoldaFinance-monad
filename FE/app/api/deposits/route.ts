import { NextRequest, NextResponse } from 'next/server';

export type SavingsAssetId = 'XAUT' | 'WBTC';

export interface Deposit {
  depositId: string;
  walletAddress: string;
  amount: number;
  asset: SavingsAssetId;
  txHash: string;
  status: 'pending' | 'routing' | 'completed' | 'failed';
  // LiFi route metadata (set when operator/agent completes routing)
  lifiTool?: string;
  lifiToAmount?: number;     // est. amount of asset received
  lifiFeeUSD?: number;
  goldReceived?: number;     // legacy alias of lifiToAmount
  createdAt: Date;
}

const deposits: Deposit[] = [];

export async function POST(req: NextRequest) {
  try {
    const { walletAddress, amount, asset, txHash, lifiTool, lifiToAmount, lifiFeeUSD } =
      await req.json();

    if (!walletAddress || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const depositId = `DEP-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    const deposit: Deposit = {
      depositId,
      walletAddress: walletAddress.toLowerCase(),
      amount: Number(amount),
      asset: (asset as SavingsAssetId) || 'XAUT',
      txHash: txHash || '',
      status: 'routing',
      lifiTool,
      lifiToAmount,
      lifiFeeUSD,
      createdAt: new Date(),
    };

    deposits.unshift(deposit);
    if (deposits.length > 1000) deposits.pop();

    return NextResponse.json({
      success: true,
      depositId: deposit.depositId,
      status: deposit.status,
      message: `Deposit recorded. Operator will route into ${deposit.asset} via LiFi.`,
    });
  } catch (error) {
    console.error('Deposit API Error:', error);
    return NextResponse.json(
      { error: 'Failed to process deposit' },
      { status: 500 }
    );
  }
}

export { deposits };
