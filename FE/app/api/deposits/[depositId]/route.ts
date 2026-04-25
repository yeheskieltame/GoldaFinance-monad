import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const DEPOSITS_FILE = path.join(DATA_DIR, 'deposits.json');

interface Deposit {
  depositId: string;
  walletAddress: string;
  amount: number;
  asset: 'XAUT' | 'WBTC';
  txHash: string;
  status: 'pending' | 'routing' | 'completed' | 'failed';
  lifiTool?: string;
  lifiToAmount?: number;
  lifiFeeUSD?: number;
  createdAt: string;
}

async function loadDeposits(): Promise<Deposit[]> {
  try {
    const data = await fs.readFile(DEPOSITS_FILE, 'utf-8');
    return JSON.parse(data) || [];
  } catch (e) {
    return [];
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ depositId: string }> }
) {
  try {
    const { depositId } = await params;
    const deposits = await loadDeposits();
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
