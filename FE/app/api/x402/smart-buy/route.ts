/**
 * x402-Protected Smart Deposit Endpoint
 *
 * After AI analysis recommends BUY, this endpoint deposits the user's
 * USDC into the GoldaVault. Protected by x402 — users pay $0.05 USDC
 * per execution.
 *
 * NOTE: For demo purposes the AI agent wallet (server-side) executes
 * the deposit on behalf of the user. In production this should use a
 * delegated session-key flow or EIP-2612 permit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withX402Protection, X402_CONFIG } from '@/lib/x402';
import { ethers } from 'ethers';
import {
    CONTRACT_ADDRESSES,
    CONTRACT_ABIS,
    RPC_URL,
} from '@/lib/services/contractService';

const AI_AGENT_PRIVATE_KEY = process.env.AI_AGENT_PRIVATE_KEY || '';

interface SmartBuyRequest {
    userAddress: string;
    usdcAmount: number;
    aiDecision: {
        action: 'BUY';
        confidence: number;
        reasoning: string;
        currentPrice: number;
    };
}

async function executeSmartBuy(
    request: NextRequest,
    payer: string
): Promise<NextResponse> {
    try {
        const body: SmartBuyRequest = await request.json();
        const { usdcAmount, aiDecision } = body;

        if (aiDecision.action !== 'BUY') {
            return NextResponse.json(
                { error: 'AI decision must be BUY to execute smart deposit' },
                { status: 400 }
            );
        }

        if (aiDecision.confidence < 60) {
            return NextResponse.json(
                { error: 'AI confidence too low for execution', confidence: aiDecision.confidence },
                { status: 400 }
            );
        }

        if (!AI_AGENT_PRIVATE_KEY) {
            return NextResponse.json(
                { error: 'AI agent not configured' },
                { status: 500 }
            );
        }

        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const agentWallet = new ethers.Wallet(AI_AGENT_PRIVATE_KEY, provider);

        const vault = new ethers.Contract(
            CONTRACT_ADDRESSES.GOLDA_VAULT,
            CONTRACT_ABIS.GOLDA_VAULT,
            agentWallet
        );
        const usdc = new ethers.Contract(
            CONTRACT_ADDRESSES.USDC,
            CONTRACT_ABIS.USDC,
            agentWallet
        );

        const usdcAmountWei = ethers.parseUnits(usdcAmount.toString(), 6);

        // Make sure the agent has approval set
        const approveTx = await usdc.approve(CONTRACT_ADDRESSES.GOLDA_VAULT, usdcAmountWei);
        await approveTx.wait();

        // Deposit on behalf of agent (shares accrue to agent address)
        const depositTx = await vault.deposit(usdcAmountWei);
        const receipt = await depositTx.wait();

        // Parse Deposit event for shares received
        let sharesReceived = 0;
        for (const log of receipt.logs) {
            try {
                const parsed = vault.interface.parseLog(log);
                if (parsed?.name === 'Deposit') {
                    sharesReceived = Number(ethers.formatUnits(parsed.args.sharesOut, 6));
                    break;
                }
            } catch {
                // not our event
            }
        }

        return NextResponse.json({
            success: true,
            txHash: receipt.hash,
            usdcSpent: usdcAmount,
            sharesReceived,
            aiDecision,
            payer,
            x402Fee: X402_CONFIG.pricing.smartBuyExecution / 1_000_000,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Smart deposit execution error:', error);
        return NextResponse.json(
            { error: 'Smart deposit execution failed', details: (error as Error).message },
            { status: 500 }
        );
    }
}

export const POST = withX402Protection(
    executeSmartBuy,
    X402_CONFIG.pricing.smartBuyExecution,
    'AI Smart Deposit — Optimal vault entry powered by GOLDA AI'
);

export async function GET() {
    return NextResponse.json({
        endpoint: '/api/x402/smart-buy',
        description: 'AI-powered smart deposit execution into the Golda Vault',
        pricing: {
            amount: X402_CONFIG.pricing.smartBuyExecution,
            amountUSDC: X402_CONFIG.pricing.smartBuyExecution / 1_000_000,
            currency: 'USDC',
            network: X402_CONFIG.paymentToken.network,
        },
        x402: {
            version: '1',
            payee: X402_CONFIG.payee,
            token: X402_CONFIG.paymentToken.address,
        },
    });
}
