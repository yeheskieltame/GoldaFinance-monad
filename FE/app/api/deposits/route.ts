import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

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
  createdAt: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DEPOSITS_FILE = path.join(DATA_DIR, 'deposits.json');

// In-memory cache for deposits
let depositsCache: Deposit[] | null = null;

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (e) {
    // Directory may already exist
  }
}

async function loadDeposits(): Promise<Deposit[]> {
  if (depositsCache) return depositsCache;
  
  try {
    await ensureDataDir();
    const data = await fs.readFile(DEPOSITS_FILE, 'utf-8');
    depositsCache = JSON.parse(data);
    return depositsCache || [];
  } catch (e) {
    // File doesn't exist or is corrupted
    return [];
  }
}

async function saveDeposits(deposits: Deposit[]) {
  await ensureDataDir();
  await fs.writeFile(DEPOSITS_FILE, JSON.stringify(deposits, null, 2));
  depositsCache = deposits;
}

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
      createdAt: new Date().toISOString(),
    };

    const deposits = await loadDeposits();
    deposits.unshift(deposit);
    if (deposits.length > 1000) deposits.pop();
    await saveDeposits(deposits);

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

export async function GET() {
  try {
    const deposits = await loadDeposits();
    return NextResponse.json({
      success: true,
      deposits: deposits.slice(0, 100),
    });
  } catch (error) {
    console.error('Deposits GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deposits' },
      { status: 500 }
    );
  }
}
