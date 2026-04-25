import { NextRequest, NextResponse } from 'next/server';
import { getUserBalances, SUPPORTED_ASSETS } from '@/lib/services/contractService';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ walletAddress: string }> }
) {
  try {
    const { walletAddress } = await params;
    const balances = await getUserBalances(walletAddress);

    return NextResponse.json({
      success: true,
      balances,
      assets: {
        XAUT: SUPPORTED_ASSETS.find(a => a.id === 'XAUT'),
        WBTC: SUPPORTED_ASSETS.find(a => a.id === 'WBTC'),
      },
    });
  } catch (error) {
    console.error('Balances API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch balances' },
      { status: 500 }
    );
  }
}
