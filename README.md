# Golda Finance

Golda Finance is an anti-inflation savings protocol built on Monad. Users deposit USDC into a non-custodial vault and receive gUSDC shares representing their proportional claim on the underlying portfolio. The vault operator routes capital into tokenized gold (PAXG, XAUt0) and wrapped Bitcoin (WBTC) via LiFi cross-chain swaps. An AI agent powered by Google Gemini and Pyth Network price feeds continuously monitors market conditions and can execute deposits autonomously on behalf of users.

---

## Table of Contents

- [Problem Statement](#problem-statement)
- [Solution](#solution)
- [Architecture](#architecture)
- [System Workflow](#system-workflow)
- [Technology Stack](#technology-stack)
- [Smart Contracts](#smart-contracts)
- [Frontend](#frontend)
- [AI Agent](#ai-agent)
- [x402 Micropayment Protocol](#x402-micropayment-protocol)
- [Known Issues and Limitations](#known-issues-and-limitations)
- [Deployment](#deployment)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)

---

## Problem Statement

Traditional savings accounts denominated in fiat currencies lose real purchasing power over time due to inflation. Most retail investors lack the tools, time, or expertise to actively move capital into inflation-resistant assets. Existing DeFi vaults either expose users to complex interfaces, require manual rebalancing, or provide no market-timing guidance.

Specific gaps this project addresses:

- Capital sitting idle in USDC slowly erodes in real value
- Users have no on-chain, automated mechanism to rotate into gold or BTC at optimal entry points
- Premium market analysis tools are inaccessible without high subscription costs or technical knowledge
- Most DeFi savings products are not designed for mobile-first, non-technical users

---

## Solution

Golda Finance separates concerns cleanly across three layers:

1. **Vault (on-chain)** — A minimal, auditable ERC-20 vault contract that handles USDC deposits, share minting, withdrawal queuing, and claim settlement. It contains no swap or lending logic, making it simple to verify and upgrade.

2. **Operator (off-chain)** — A privileged wallet that reads LiFi quotes and Pyth oracle prices, then calls the vault's `execute` function to route capital into the best available savings asset at the time of deployment.

3. **AI Agent (application layer)** — A Google Gemini 2.5 Flash model that ingests live gold prices from the Pyth Hermes REST API and produces structured BUY / WAIT / SELL recommendations. Users can run manual analysis or enable auto-execution, which runs on a server-side cron schedule even when the user is offline.

---

## Architecture

```
User (browser / mobile)
        |
        | USDC deposit / withdraw request
        v
   GoldaVault.sol  (Monad Testnet)
        |
        | gUSDC shares minted
        v
   Operator wallet
        |
        | LiFi SDK calldata (off-chain)
        v
   LiFi Diamond  -->  DEX / Bridge
        |
        | PAXG / XAUt0 / WBTC received
        v
   GoldaVault holds savings assets

   ---- AI layer (Next.js API routes) ----

   Pyth Hermes API  -->  getPythGoldPrice()
        |
        v
   Gemini 2.5 Flash  -->  GoldMarketAnalysis
        |
        v
   Cron job  -->  executeDepositForUser()
        |
        v
   GoldaVault.deposit()
```

---

## System Workflow

### User Deposit

1. User authenticates via Privy (embedded wallet or WalletConnect).
2. User enters a USDC amount and selects a preferred savings asset (XAUt0, PAXG, or WBTC).
3. The frontend calls LiFi SDK to preview the estimated output and fees.
4. User approves USDC spending and calls `GoldaVault.deposit()`.
5. The vault mints gUSDC shares at the current NAV-derived share price and records the deposit.
6. The operator detects the deposit event, builds LiFi swap calldata off-chain, and calls `GoldaVault.execute()` to swap idle USDC into the target savings asset.
7. The operator updates the vault NAV via `reportNav()` to reflect the new portfolio value.

### User Withdrawal

1. User calls `GoldaVault.requestWithdraw(shares)`.
2. The vault burns the shares, computes the USDC owed at the current share price, and queues a `Withdrawal` record.
3. The operator unwinds positions (swaps gold/BTC back to USDC via LiFi) and ensures the vault holds sufficient liquid USDC.
4. User calls `GoldaVault.claim(id)` to receive the USDC once it is available.

### AI Agent (Manual)

1. User navigates to the Agent page and clicks Analyze.
2. The frontend fetches the current gold price from the Pyth Hermes API.
3. The price and user portfolio data are passed to Gemini 2.5 Flash with a structured prompt.
4. The model returns a JSON-formatted recommendation (action, confidence, reasoning, risk level, price target).
5. If confidence meets the user-defined threshold, the user can manually execute a deposit or enable auto-execution.

### AI Agent (Automated / Cron)

1. The user saves agent settings (risk level, min confidence, max amount per trade) to the server via `/api/agent/settings`.
2. Vercel Cron triggers `GET /api/cron/analyze` on a recurring schedule.
3. The cron handler retrieves all active agents, runs `analyzeGoldMarket()` for each, and calls `executeDepositForUser()` when conditions are met.
4. Execution logs are stored in the server-side `agentStore` and surfaced in the UI.

### x402 Premium Endpoints

1. The client requests a protected endpoint (`/api/x402/analyze` or `/api/x402/smart-buy`).
2. The server returns HTTP 402 with a payment requirement (amount, USDC token address, payee).
3. The client signs an EIP-3009 `transferWithAuthorization` for the required USDC amount.
4. The client retries the request with an `X-PAYMENT` header containing the base64-encoded authorization.
5. The server validates the signature and processes the request.

---

## Technology Stack

### Blockchain

| Technology | Purpose |
|---|---|
| Monad Testnet (Chain ID 10143) | Target network for all contract deployments |
| Solidity 0.8.26 | Smart contract language |
| Foundry (forge, cast) | Contract compilation, testing, and deployment |
| OpenZeppelin Contracts v5 | ERC-20, Ownable, ReentrancyGuard, SafeERC20 |
| Pyth Network (on-chain SDK) | Price oracle integration in Solidity |
| forge-std | Testing utilities (Foundry standard library) |

### Frontend

| Technology | Purpose |
|---|---|
| Next.js 16 (App Router) | React framework and API route handling |
| TypeScript 5 | Type-safe development |
| Tailwind CSS v4 | Utility-first styling |
| Radix UI | Accessible, unstyled UI primitives (Dialog, Slot, Icons) |
| Lucide React | Icon library |
| ethers.js v6 | EVM contract reads and writes |
| Privy (`@privy-io/react-auth`) | Wallet authentication and embedded wallets |
| LiFi SDK v3 (`@lifi/sdk`) | Cross-chain swap quotes and routing |
| Google Generative AI SDK | Gemini 2.5 Flash model inference |
| Pyth Hermes REST API | Real-time XAU/USD price feed (off-chain) |
| Axios | HTTP client for Pyth and other external APIs |
| html5-qrcode | QR code scanning for payment addresses |
| class-variance-authority | Component variant styling |
| Vercel Cron | Scheduled server-side agent execution |

### Protocol Integrations

| Protocol | Role |
|---|---|
| LiFi (Jumper Exchange) | USDC to PAXG / XAUt0 / WBTC swap routing and bridging |
| Pyth Network | Real-time XAU/USD spot price with confidence intervals |
| Google Gemini 2.5 Flash | AI market analysis and natural language advisory |
| x402 | Pay-per-use HTTP micropayment standard over USDC |
| Privy | Embedded wallet creation and social login |

### Savings Assets Supported

| Asset | Description | Standard |
|---|---|---|
| XAUt0 | Tether Gold — 1 token represents 1 troy ounce of gold | ERC-20 |
| PAXG | Paxos Gold — 1 token represents 1 fine troy ounce of gold | ERC-20 |
| WBTC | Wrapped Bitcoin | ERC-20 |

---

## Smart Contracts

### GoldaVault

The vault is an accounting-only contract. All swap logic is executed off-chain by the operator; the vault merely holds assets and enforces access control on which external contracts the operator may call.

**Key design decisions:**

- The vault does not implement ERC-4626 to keep the withdrawal path asynchronous. Since assets are deployed into illiquid positions (gold tokens, yield vaults), a two-step request-then-claim pattern is necessary.
- NAV is reported by the operator after each rebalance, priced using LiFi quotes and Pyth oracle data. This is a trusted off-chain valuation, not a trustless one.
- The `execute()` function forwards arbitrary calldata to allowlisted targets only. This prevents the operator from calling arbitrary contracts while still enabling full LiFi SDK flexibility.
- `forceApprove` (OpenZeppelin SafeERC20) is used for token approvals to handle non-standard ERC-20 tokens like USDT.

**Functions:**

| Function | Caller | Description |
|---|---|---|
| `deposit(uint256)` | User | Deposit USDC, receive gUSDC shares at current NAV |
| `requestWithdraw(uint256)` | User | Burn shares, queue a USDC withdrawal |
| `claim(uint256)` | User | Claim liquid USDC once the vault has settled the withdrawal |
| `execute(address, uint256, bytes)` | Operator | Forward calldata to an allowlisted target (LiFi, yield vaults) |
| `approveToken(IERC20, address, uint256)` | Operator | Approve an allowlisted spender |
| `reportNav(uint256)` | Operator | Push updated portfolio valuation in USDC |
| `setOperator(address)` | Owner | Replace the operator wallet |
| `setAllowedTarget(address, bool)` | Owner | Add or remove a callable contract |
| `rescue(IERC20, uint256, address)` | Owner | Recover non-USDC tokens stuck in the vault |
| `sharePrice()` | View | Current price of one gUSDC share in USDC (6 decimals) |

---

## Frontend

The application is structured as a mobile-first progressive web app with four main views:

- **Dashboard** — Wallet overview, gUSDC share balance, current share price, and quick actions
- **Deposit** — LiFi quote preview, asset selection, deposit flow with USDC approval
- **Agent** — AI market analysis, auto-agent settings, chat with GOLDA AI
- **History** — Transaction and withdrawal history

State management for on-chain data is handled through custom React hooks (`useAureoContract`, `useAgentSettings`, `useTransactionHistory`). Agent settings are persisted server-side via API routes so that auto-execution continues even when the user is not actively using the app.

---

## AI Agent

The GOLDA AI agent uses Google Gemini 2.5 Flash to analyze gold market conditions. The analysis pipeline works as follows:

1. Fetch the current XAU/USD spot price and confidence interval from Pyth Hermes (`https://hermes.pyth.network`), using price feed ID `0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2`.
2. Compute EMA deviation and approximate volatility from the confidence interval.
3. Send a structured prompt to Gemini 2.5 Flash requesting a JSON response with fields: `action`, `confidence`, `reasoning`, `currentPrice`, `priceTarget`, `riskLevel`, `marketSentiment`.
4. Validate and sanitize the parsed JSON before returning it to the caller.
5. Fall back to a rule-based decision (price vs. EMA) if the AI service is unavailable.

The agent supports three risk profiles (conservative, moderate, aggressive) which adjust the confidence threshold required before a BUY recommendation is acted upon. Auto-execution is gated by both the confidence threshold and the user-defined maximum trade amount.

---

## x402 Micropayment Protocol

Two API endpoints are protected by x402:

| Endpoint | Price | Description |
|---|---|---|
| `POST /api/x402/analyze` | $0.01 USDC | AI-powered market analysis with deposit/wait recommendation |
| `POST /api/x402/smart-buy` | $0.05 USDC | AI timing analysis with automated swap execution |

Payment uses EIP-3009 `transferWithAuthorization` signed by the user's wallet, valid for five minutes per request. This allows the server to verify payment without requiring a separate on-chain transaction for each API call.

---

## Known Issues and Limitations

### Simulated Market Data

The Pyth Hermes API provides a spot price and confidence interval but does not expose historical high/low data. The current implementation approximates 24-hour high and low as ±2% of the spot price, and volatility is derived from the confidence band. For production use, a historical price API or on-chain TWAP would be required.

### In-Memory Agent Store

Agent settings and execution logs are stored in a module-level JavaScript object (`agentStore`). This state is lost on every server restart or Vercel function cold start. A persistent database (e.g., PostgreSQL, Redis, or a key-value store) is required before this feature is suitable for production.

### Trusted NAV Reporting

The share price is computed from a NAV figure that the operator pushes manually. There is no on-chain mechanism to verify that the reported NAV matches the actual portfolio value. A production system should integrate on-chain price oracles directly into the NAV calculation or implement a time-locked dispute window.

### Empty PAXG Address

The PAXG asset entry in `contractService.ts` has an empty `address` field. LiFi quote previews for PAXG reference the Ethereum mainnet address correctly, but any on-chain interaction with PAXG on Monad Testnet will fail until the correct testnet address is populated.

### Client-Side AI API Key Exposure

`aiService.ts` reads `NEXT_PUBLIC_GEMINI_API_KEY`, which is bundled into the client-side JavaScript. This exposes the key to any user who inspects the page source. AI inference calls that do not go through a server-side API route should use the `GEMINI_API_KEY` environment variable via a server action or API route only.

### Cron Secret Default Value

`/api/cron/analyze` falls back to the string `"hackathon-demo-secret"` when `CRON_SECRET` is not set. In any deployment, `CRON_SECRET` must be set to a strong, randomly generated value.

### Synchronous Agent Processing

The cron handler processes all active agents sequentially in a single request. Under load, this will exceed Vercel's function timeout limit. A production implementation should dispatch each agent as an independent background job.

---

## Deployment

The protocol smart contracts are deployed and verified on Monad Testnet.

| Component | Contract Address |
|---|---|
| Golda Vault | `0xbf8f03002e91daacc8e3597d650a4f1b2d21a39e` |
| USDC (Mock) | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` |

### Network Configuration

| Parameter | Value |
|---|---|
| Network | Monad Testnet |
| Chain ID | 10143 |
| RPC URL | `https://testnet-rpc.monad.xyz` |
| Block Explorer | `https://testnet.monadscan.com` |

---

## Environment Variables

Copy `FE/.env.example` to `FE/.env.local` and fill in the required values.

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_RPC_URL` | Yes | Monad RPC endpoint |
| `NEXT_PUBLIC_CHAIN_ID` | Yes | Chain ID (10143 for testnet) |
| `NEXT_PUBLIC_GOLDA_VAULT_ADDRESS` | Yes | Deployed GoldaVault contract address |
| `NEXT_PUBLIC_USDC_ADDRESS` | Yes | USDC token contract address |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Yes | Privy application ID for wallet auth |
| `NEXT_PUBLIC_GEMINI_API_KEY` | No | Gemini API key for client-side chat (not recommended for production) |
| `GEMINI_API_KEY` | Yes | Gemini API key for server-side AI analysis |
| `AI_AGENT_PRIVATE_KEY` | Yes | Private key for the server-side auto-agent wallet |
| `NEXT_PUBLIC_X402_PAYEE` | Yes | Recipient address for x402 micropayments |
| `CRON_SECRET` | Yes | Authorization secret for the cron endpoint |

---

## Local Development

### Prerequisites

- Node.js 20+
- pnpm
- Foundry (for smart contract work)

### Frontend

```bash
cd FE
pnpm install
cp .env.example .env.local
# fill in .env.local
pnpm dev
```

The application runs on `http://localhost:3000`.

### Smart Contracts

```bash
cd SC
forge build
forge test
forge script script/DeployGoldaVault.s.sol --rpc-url https://testnet-rpc.monad.xyz --broadcast
```
