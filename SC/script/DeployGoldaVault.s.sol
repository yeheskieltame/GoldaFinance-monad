// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {GoldaVault} from "../src/GoldaVault.sol";

/// @notice Deploy GoldaVault on Monad mainnet and preload the LiFi + Euler
/// allowlist so the operator can immediately run swap + yield routes.
///
/// Env:
///   PRIVATE_KEY       deployer key
///   OPERATOR          operator EOA (defaults to deployer)
contract DeployGoldaVault is Script {
    // Monad mainnet (chain id 143)
    address constant USDC          = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    address constant LIFI_DIAMOND  = 0x026F252016A7C47CDEf1F05a3Fc9E20C92a49C37;
    address constant PERMIT2       = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant PERMIT2_PROXY = 0x3c6B2E0b7421254846C53c118e24c65d59eAe75e;

    // Gold + BTC tokens available via LiFi on Monad
    address constant XAUT0         = 0x01bFF41798a0BcF287b996046Ca68b395DbC1071;
    address constant WBTC          = 0x0555E30da8f98308EdB960aa94C0Db47230d2B9c;
    address constant CBBTC         = 0xd18B7EC58Cdf4876f6AFebd3Ed1730e4Ce10414b;

    // Euler EVK yield vaults (USDC/XAUt0/WBTC legs — expand as needed)
    address constant EVK_USDC_5    = 0x1E4D67c666c2Ccf27A0aF980fE6c8e0f05aC8949;
    address constant EVK_USDC_10   = 0x289F801765B99B5E6263853859fE302dbecaB6d6;
    address constant EVK_XAUT0_2   = 0x234d354b39a4Ca1274CB04972D3A9e03f1d8C4FF;
    address constant EVK_XAUT0_3   = 0xd505ccE10571C1d07dd40D2D9001BEf22CDF0D71;
    address constant EVK_XAUT0_4   = 0x091298D908a216CfcA30729dB2B194Fe5f1d16be;
    address constant EVK_WBTC_2    = 0x8f47D9D9d5A8202a5a37c4E41fbDd3146D88A579;
    address constant EVK_WBTC_4    = 0x88927d35e37286805f343dC449b750F431E70a20;

    function run() external returns (GoldaVault vault) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address operator = vm.envOr("OPERATOR", deployer);

        vm.startBroadcast(pk);

        vault = new GoldaVault(USDC, operator);

        address[] memory targets = new address[](10);
        targets[0] = LIFI_DIAMOND;
        targets[1] = PERMIT2_PROXY;
        targets[2] = EVK_USDC_5;
        targets[3] = EVK_USDC_10;
        targets[4] = EVK_XAUT0_2;
        targets[5] = EVK_XAUT0_3;
        targets[6] = EVK_XAUT0_4;
        targets[7] = EVK_WBTC_2;
        targets[8] = EVK_WBTC_4;
        targets[9] = PERMIT2;
        vault.setAllowedTargets(targets, true);

        vm.stopBroadcast();

        console2.log("GoldaVault:", address(vault));
        console2.log("operator:", operator);
        console2.log("USDC:", USDC);
        console2.log("LiFi Diamond:", LIFI_DIAMOND);
    }
}
