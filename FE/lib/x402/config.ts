/**
 * x402 Protocol Configuration for AUREO AI Agent
 * 
 * x402 enables pay-per-use AI agent services where:
 * - Users pay small amounts of USDC for AI-powered gold trading analysis
 * - AI executes optimal swap timing based on market analysis
 * 
 * Payment Flow:
 * 1. Client requests premium endpoint (AI analysis or smart buy)
 * 2. Server returns 402 with payment requirements
 * 3. Client signs EIP-3009 authorization for USDC payment
 * 4. Client retries request with X-PAYMENT header
 * 5. Server validates payment and executes request
 */

export const X402_CONFIG = {
    // USDC contract on Monad Mainnet
    paymentToken: {
        address: process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x754704Bc059F8C67012fEd69BC8A327a5aafb603',
        symbol: 'USDC',
        decimals: 6,
        network: 'monad',
        chainId: 143,
    },

    // Recipient address for x402 payments (AI service provider)
    payee: process.env.NEXT_PUBLIC_X402_PAYEE || '',

    // Pricing tiers for AI services (in USDC cents, 6 decimals)
    pricing: {
        // Basic market analysis - $0.01 USDC
        marketAnalysis: 10000, // 0.01 USDC = 10000 (6 decimals)

        // AI-powered smart buy execution - $0.05 USDC  
        smartBuyExecution: 50000, // 0.05 USDC

        // Premium detailed analysis with multiple indicators - $0.02 USDC
        premiumAnalysis: 20000, // 0.02 USDC

        // Instant swap without AI timing (user wants immediate) - $0.01 USDC
        instantSwap: 10000, // 0.01 USDC
    },

    // x402 protocol headers
    headers: {
        payment: 'X-PAYMENT',
        paymentRequired: 'X-PAYMENT-REQUIRED',
    },

    // Payment validity (how long a payment signature is valid)
    paymentValiditySeconds: 300, // 5 minutes
};

export interface X402PaymentRequirement {
    version: '1';
    network: string;
    chainId: number;
    payee: string;
    token: string;
    amount: string;
    validUntil: number;
    description: string;
    resource: string;
}

export interface X402Payment {
    version: '1';
    authorization: {
        from: string;
        to: string;
        value: string;
        validAfter: number;
        validBefore: number;
        nonce: string;
        v: number;
        r: string;
        s: string;
    };
}

/**
 * Generate x402 payment requirement for a protected resource
 */
export function generatePaymentRequirement(
    resource: string,
    amountMicro: number,
    description: string
): X402PaymentRequirement {
    return {
        version: '1',
        network: X402_CONFIG.paymentToken.network,
        chainId: X402_CONFIG.paymentToken.chainId,
        payee: X402_CONFIG.payee,
        token: X402_CONFIG.paymentToken.address,
        amount: amountMicro.toString(),
        validUntil: Math.floor(Date.now() / 1000) + X402_CONFIG.paymentValiditySeconds,
        description,
        resource,
    };
}

/**
 * Format USDC amount for display
 */
export function formatUSDCAmount(amountMicro: number): string {
    const usdc = amountMicro / 1_000_000;
    return `$${usdc.toFixed(usdc < 0.01 ? 4 : 2)} USDC`;
}

/**
 * Parse x402 payment from header
 */
export function parsePaymentHeader(header: string): X402Payment | null {
    try {
        const decoded = Buffer.from(header, 'base64').toString('utf-8');
        return JSON.parse(decoded);
    } catch {
        return null;
    }
}

/**
 * Encode x402 payment for header
 */
export function encodePaymentHeader(payment: X402Payment): string {
    return Buffer.from(JSON.stringify(payment)).toString('base64');
}
