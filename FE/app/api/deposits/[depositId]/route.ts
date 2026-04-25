import { NextRequest, NextResponse } from 'next/server';
import { deposits } from '../route';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ depositId: string }> }
) {
  try {
    const { depositId } = await params;
    const deposit = deposits.find((d) => d.depositId === depositId);

    if (!deposit) {
      return NextResponse.json({ error: 'Deposit not found' }, { status: 404 });
    }

    return NextResponse.json({
      depositId: deposit.depositId,
      amount: deposit.amount,
      asset: deposit.asset,
      status: deposit.status,
      lifiTool: deposit.lifiTool,
      lifiToAmount: deposit.lifiToAmount,
      lifiFeeUSD: deposit.lifiFeeUSD,
      txHash: deposit.txHash,
      createdAt: deposit.createdAt,
    });
  } catch (error) {
    console.error('Get Deposit Error:', error);
    return NextResponse.json({ error: 'Failed to fetch deposit' }, { status: 500 });
  }
}
