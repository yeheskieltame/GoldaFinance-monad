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
  { params }: { params: Promise<{ walletAddress: string }> }
) {
  try {
    const { walletAddress } = await params;
    const deposits = await loadDeposits();
    const userDeposits = deposits
      .filter((d) => d.walletAddress === walletAddress.toLowerCase())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
