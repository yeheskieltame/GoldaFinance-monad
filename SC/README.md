# GoldaVault — Smart Contracts

Accounting-only vault for **Golda Finance** on Monad. Users deposit USDC and
receive `gUSDC` shares; an operator routes swaps via the LiFi SDK
(USDC → XAUt0 / WBTC / cbBTC) and supplies into yield vaults (Euler,
Hyperithm, Steakhouse) by forwarding calldata through an allowlist.

The contract itself holds **no swap or lending logic** — the app uses the full
LiFi SDK off-chain and reports NAV back on-chain.

## Deployments

| Network        | Chain ID | Address                                                                                          |
| -------------- | -------- | ------------------------------------------------------------------------------------------------ |
| Monad mainnet  | `143`    | [`0xbf8f03002e91daacc8e3597d650a4f1b2d21a39e`](https://monadscan.com/address/0xbf8f03002e91daacc8e3597d650a4f1b2d21a39e#code)         |
| Monad testnet  | `10143`  | [`0xbf8f03002e91daacc8e3597d650a4f1b2d21a39e`](https://testnet.monadscan.com/address/0xbf8f03002e91daacc8e3597d650a4f1b2d21a39e#code) |

Both are verified source on MonadScan.

## Protocol addresses (Monad mainnet)

| Role              | Address                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| USDC              | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` (6 dp)                     |
| XAUt0 (gold)      | `0x01bFF41798a0BcF287b996046Ca68b395DbC1071` (6 dp)                     |
| WBTC              | `0x0555E30da8f98308EdB960aa94C0Db47230d2B9c` (8 dp)                     |
| cbBTC             | `0xd18B7EC58Cdf4876f6AFebd3Ed1730e4Ce10414b` (8 dp)                     |
| LiFi Diamond      | `0x026F252016A7C47CDEf1F05a3Fc9E20C92a49C37`                            |
| Permit2           | `0x000000000022D473030F116dDEE9F6B43aC78BA3`                            |
| LiFi Permit2Proxy | `0x3c6B2E0b7421254846C53c118e24c65d59eAe75e`                            |

Yield legs pre-allowlisted in the deploy script: Euler EVK vaults
`eUSDC-5`, `eUSDC-10`, `eXAUt0-2/3/4`, `eWBTC-2/4` — extendable via
`setAllowedTargets`.

## Repository layout

```
src/    GoldaVault.sol        — share token + gated executor + NAV ledger
script/ DeployGoldaVault.s.sol — deploys and pre-allowlists LiFi + Euler
test/   GoldaVault.t.sol      — 14 unit tests
```

## Flow

1. User calls `deposit(usdcAmount)` → mints `gUSDC` shares at current NAV.
2. Backend requests a LiFi route (USDC → XAUt0 / WBTC), gets calldata.
3. Operator calls `approveToken(usdc, LIFI_DIAMOND, amount)` then
   `execute(LIFI_DIAMOND, 0, lifiCalldata)` to swap inside the vault.
4. Operator supplies to an Euler vault via
   `execute(EVK_XAUT0_*, 0, depositCalldata)` to start earning yield.
5. Operator periodically pushes `reportNav(totalUSDC)` — sum of idle USDC +
   gold valued via LiFi/Pyth + yield vault shares — so `sharePrice` stays
   accurate.
6. User calls `requestWithdraw(shares)` → burn + queue claim. Operator
   unwinds (Euler withdraw → LiFi gold→USDC). User calls `claim(id)` once
   the vault holds enough liquid USDC.

## Build & test

```bash
forge build
forge test -vv
```

All 14 tests pass (deposit math, share proportionality, withdraw queue,
liquidity guard, allowlist enforcement, NAV reporting, rescue guard).

## Deploy

The contract is already live at the addresses above. To redeploy / deploy
a new instance:

```bash
cp .env.example .env   # fill PRIVATE_KEY, OPERATOR, ETHERSCAN_API_KEY
source .env

forge script script/DeployGoldaVault.s.sol:DeployGoldaVault \
  --rpc-url monad-mainnet --broadcast -vvvv
```

## Verify on MonadScan (Etherscan API v2)

Etherscan API v2 is multichain — one key covers Monad mainnet (143) and
testnet (10143). Foundry 1.5.x doesn't yet recognize chain 143 as a named
chain, so verify runs **as a separate step** (numeric chain id is accepted
by `forge verify-contract`):

```bash
VAULT=$(jq -r '.transactions[] | select(.contractName=="GoldaVault") | .contractAddress' \
  broadcast/DeployGoldaVault.s.sol/143/run-latest.json)

forge verify-contract "$VAULT" src/GoldaVault.sol:GoldaVault \
  --chain 143 \
  --verifier etherscan \
  --verifier-url 'https://api.etherscan.io/v2/api?chainid=143' \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  --constructor-args $(cast abi-encode 'constructor(address,address)' \
    0x754704Bc059F8C67012fEd69BC8A327a5aafb603 "$OPERATOR") \
  --watch
```

For testnet: swap `--chain 10143`, `chainid=10143` in the verifier URL, and
`broadcast/.../10143/run-latest.json`.

## Admin reference

| Function                                | Who          | Purpose                                           |
| --------------------------------------- | ------------ | ------------------------------------------------- |
| `deposit(usdc)`                         | anyone       | Mint `gUSDC` at current share price               |
| `requestWithdraw(shares)`               | anyone       | Burn shares, queue USDC claim                     |
| `claim(id)`                             | claim owner  | Pay out once vault is liquid                      |
| `execute(target, value, data)`          | operator     | Forward calldata to allowlisted target            |
| `approveToken(token, spender, amount)`  | operator     | ERC20 allowance for allowlisted spender           |
| `reportNav(navUSDC)`                    | operator     | Push off-chain valuation of vault                 |
| `setOperator(addr)`                     | owner        | Rotate operator                                   |
| `setAllowedTarget(addr, bool)`          | owner        | Toggle one allowlist entry                        |
| `setAllowedTargets(addr[], bool)`       | owner        | Toggle many at once                               |
| `rescue(token, amount, to)`             | owner        | Sweep non-USDC tokens (USDC is blocked)           |

## License

MIT.
