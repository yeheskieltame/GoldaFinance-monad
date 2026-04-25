# Golda Finance

Golda Finance is an anti-inflation savings application built on Monad. The core premise is straightforward: traditional savings lose purchasing power over time because money sits idle. Golda Finance solves this by routing deposited capital into decentralized finance protocols that generate real yield, all while maintaining a frictionless mobile-first experience for the end user.

Live application: https://golda-finance-monad.vercel.app/

GitHub repository: https://github.com/yeheskieltame/GoldaFinance-monad

Announcement: https://x.com/YeheskielTame/status/2047969925667647757?s=20

## The Problem

Inflation silently erodes savings. A dollar held in a bank account today is worth less tomorrow, yet most people have no accessible, non-custodial way to put their money to work without dealing with complex DeFi tooling. Golda Finance bridges that gap by abstracting the complexity of yield-generating protocols behind a consumer-grade interface.

## How It Works

Users connect their wallet via Privy (supporting email, Google, and embedded wallets) and deposit USDC. From there, Golda Finance handles the rest through a two-step execution flow:

Step one is asset acquisition. If the user does not already hold the target yield asset (either XAUt0, a tokenized gold asset, or WBTC), the application routes a swap through LiFi, which aggregates liquidity across multiple DEXes to find the most efficient execution path on Monad mainnet.

Step two is deployment. The acquired asset is deposited into a vetted DeFi protocol vault. Currently integrated protocols include Kuru (XAUt0 liquidity), Neverland Finance (gold-backed yield), Ambient Finance (WBTC concentrated liquidity), and Morpho (WBTC lending).

An AI layer powered by Google Gemini analyzes the user's current holdings and the available protocol options, then recommends the optimal entry point with a confidence score and reasoning. Users can either follow the recommendation manually or trigger the Auto mode, which executes the full swap-and-deposit flow autonomously using ten percent of the user's USDC balance.

## Technology Stack

**Blockchain**
- Network: Monad Mainnet (Chain ID 143)
- Smart contracts written in Solidity using the Foundry framework
- ERC-4626 tokenized vault standard for deposit and share accounting
- Contract verified on MonadScan

**Frontend**
- Next.js 16 with the App Router and TypeScript
- Tailwind CSS v4 with a mobile-first, fintech-grade design system
- Privy for embedded wallet authentication (email, Google, and external wallets)
- Ethers.js v6 for contract interaction and transaction signing

**Cross-Chain Swaps**
- LiFi SDK for USDC to XAUt0 and USDC to WBTC routing
- Aggregates liquidity from multiple AMMs and bridges to find the best execution path
- Swap records are persisted locally and surfaced in the transaction history view

**AI Integration**
- Google Gemini (gemini-2.5-flash) for yield strategy analysis
- Analyzes user balances, protocol APYs, TVL, and risk profile
- Returns structured recommendations (protocol, confidence, action) in JSON
- x402 protocol used for pay-per-use AI endpoint access ($0.01 USDC per analysis)

**Payment Protocol**
- x402 for micropayment-gated API endpoints
- EIP-3009 (transferWithAuthorization) for gasless USDC payment signatures
- Protected endpoints: /api/x402/analyze and /api/x402/smart-buy

## Smart Contracts

| Contract | Address |
| --- | --- |
| Golda Vault | [0xbf8f03002e91daacc8e3597d650a4f1b2d21a39e](https://monadscan.com/address/0xbf8f03002e91daacc8e3597d650a4f1b2d21a39e#code) |

The vault is deployed and verified on Monad Mainnet. Source code is available on MonadScan.

## Local Development

Clone the repository and navigate to the frontend directory:

```bash
cd FE
pnpm install
```

Create a `.env.local` file with the following variables:

```env
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_api_key
NEXT_PUBLIC_X402_PAYEE=your_payee_wallet_address
X402_SERVICE_PRIVATE_KEY=your_service_wallet_private_key
```

Start the development server:

```bash
pnpm dev
```

For smart contract development, navigate to the `SC` directory and use Foundry:

```bash
cd SC
forge build
forge test
```

## Project Structure

```
/
├── FE/          Next.js frontend application
│   ├── app/     Pages and API routes
│   ├── components/
│   └── lib/     Services: LiFi, Privy, contract interactions, x402, AI
└── SC/          Solidity smart contracts (Foundry)
    ├── src/     Contract source files
    └── test/    Foundry tests
```

## Team

Yeheskiel Yunus Tame — https://github.com/yeheskieltame

Bernadus Xaverius Hitipeuw — https://github.com/NdusFTI

Nicholas Dwinata — https://github.com/ndwn023
