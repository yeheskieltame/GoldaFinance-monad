# Golda Finance

Golda Finance is an anti-inflationary savings protocol built on the Monad network, designed to protect and sustainably grow capital.

Traditional savings accounts leave capital idle, inevitably resulting in a loss of purchasing power due to inflation. Golda Finance addresses this inefficiency by ensuring that user assets remain productive. Through an AI-assisted asset allocation strategy, capital is systematically deployed into instruments optimized for both growth and value preservation.

## Core Value Proposition

* **Anti-Inflation Protection:** Deposits are structured to preserve purchasing power by maintaining continuous exposure to yield-generating assets.
* **AI-Driven Asset Allocation:** The protocol utilizes an artificial intelligence module to assist users in determining the optimal investment strategy, balancing between growth (Bitcoin) and stability (Gold).
* **Binary Investment Strategy:** The protocol focuses strictly on two primary assets, Bitcoin and Gold. This leverages their inverse correlation to minimize systemic risk in financial markets.
* **Monad Network Efficiency:** Leveraging Monad's high transaction throughput and instant finality to ensure highly efficient yield compounding and liquidity management.

## Technical Flow

1. **Deposit:** Users deposit stable assets into the Golda Vault. For the scope of this hackathon, the protocol focuses exclusively on USDC deposits.
2. **AI Decision Support:** The AI module analyzes current market conditions and the user's risk profile to provide tailored capital allocation recommendations.
3. **Investment Instrument Selection:** Users allocate their deposited funds into two distinct asset categories based on the AI's guidance:
   * **Bitcoin (BTC):** Targeted for high capital growth potential.
   * **Gold (Tokenized Gold):** Utilized as a safe-haven asset to preserve capital value during periods of market volatility.
4. **Strategy Rationale:** The limitation to these two assets is rooted in established risk diversification principles. Historically, gold tends to remain stable or appreciate when high-risk markets (such as equities or broader crypto) decline, and vice versa. This binary system provides a natural hedge.
5. **Minting:** The protocol mints Vault Shares, representing the user's proportional ownership of the chosen asset positions within the vault.
6. **Withdrawal:** Users can seamlessly burn their Vault Shares to redeem their initial capital along with any accumulated yield.

## Deployment Information

The protocol smart contracts are currently deployed and verified on the Monad Testnet.

| Component | Contract Address |
| :--- | :--- |
| **Golda Vault** | `0xbf8f03002e91daacc8e3597d650a4f1b2d21a39e` |
| **USDC (Mock)** | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` |

### Network Configuration

* **Network:** Monad Testnet
* **Chain ID:** 10143
* **RPC URL:** https://testnet-rpc.monad.xyz
* **Block Explorer:** https://testnet.monadscan.com

---
*Built for the [Insert Hackathon Name] Hackathon.*
