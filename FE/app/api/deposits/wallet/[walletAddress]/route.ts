import { NextRequest, NextResponse } from 'next/server';
import { deposits } from '../../route';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ walletAddress: string }> }
) {
  try {
    const { walletAddress } = await params;
    const userDeposits = deposits
      .filter((d) => d.walletAddress === walletAddress.toLowerCase())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return NextResponse.json({
      deposits: userDeposits.map((d) => ({
        depositId: d.depositId,
        amount: d.amount,
        asset: d.asset,
        status: d.status,
        lifiTool: d.lifiTool,
        lifiToAmount: d.lifiToAmount,
        lifiFeeUSD: d.lifiFeeUSD,
        txHash: d.txHash,
        createdAt: d.createdAt,
      })),
    });
  } catch (error) {
    console.error('Get Wallet Deposits Error:', error);
    return NextResponse.json({ error: 'Failed to fetch deposits' }, { status: 500 });
  }
}
