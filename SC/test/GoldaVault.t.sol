// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GoldaVault} from "../src/GoldaVault.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amt) external { _mint(to, amt); }
}

contract MockGold is ERC20 {
    constructor() ERC20("Tether Gold", "XAUt0") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amt) external { _mint(to, amt); }
}

/// @dev Stub LiFi-like target. Pulls tokenIn from caller, returns tokenOut.
contract StubSwap {
    function swap(IERC20 tokenIn, uint256 amountIn, IERC20 tokenOut, uint256 amountOut) external {
        tokenIn.transferFrom(msg.sender, address(this), amountIn);
        tokenOut.transfer(msg.sender, amountOut);
    }
}

contract GoldaVaultTest is Test {
    GoldaVault vault;
    MockUSDC usdc;
    MockGold gold;
    StubSwap swapper;

    address owner    = address(0xA11CE);
    address operator = address(0x0B0B);
    address alice    = address(0xA1);
    address bob      = address(0xB0);

    function setUp() public {
        vm.startPrank(owner);
        usdc    = new MockUSDC();
        gold    = new MockGold();
        swapper = new StubSwap();
        vault   = new GoldaVault(address(usdc), operator);
        vault.setAllowedTarget(address(swapper), true);
        vm.stopPrank();

        usdc.mint(alice, 10_000e6);
        usdc.mint(bob,   10_000e6);
        gold.mint(address(swapper), 1_000_000e6);

        vm.prank(alice); usdc.approve(address(vault), type(uint256).max);
        vm.prank(bob);   usdc.approve(address(vault), type(uint256).max);
    }

    function test_deposit_mints_one_to_one_initially() public {
        vm.prank(alice);
        uint256 shares = vault.deposit(1_000e6);
        assertEq(shares, 1_000e6);
        assertEq(vault.balanceOf(alice), 1_000e6);
        assertEq(vault.navUSDC(), 1_000e6);
        assertEq(vault.sharePrice(), 1e6);
    }

    function test_deposit_below_min_reverts() public {
        vm.prank(alice);
        vm.expectRevert(GoldaVault.BelowMinDeposit.selector);
        vault.deposit(0.5e6);
    }

    function test_second_depositor_gets_proportional_shares() public {
        vm.prank(alice); vault.deposit(1_000e6);
        // NAV grows from reported value (simulating yield)
        vm.prank(operator); vault.reportNav(1_100e6);
        vm.prank(bob); uint256 bobShares = vault.deposit(1_100e6);
        // Bob deposits same USD value as alice share, should get same share count
        assertEq(bobShares, 1_000e6);
        assertEq(vault.balanceOf(bob), 1_000e6);
    }

    function test_request_withdraw_burns_and_queues() public {
        vm.prank(alice); vault.deposit(1_000e6);

        vm.prank(alice);
        uint256 id = vault.requestWithdraw(400e6);
        assertEq(id, 0);
        assertEq(vault.balanceOf(alice), 600e6);
        assertEq(vault.navUSDC(), 600e6);

        (address user, uint128 owed, bool settled) = vault.withdrawals(0);
        assertEq(user, alice);
        assertEq(uint256(owed), 400e6);
        assertFalse(settled);
    }

    function test_claim_pays_usdc_when_liquid() public {
        vm.prank(alice); vault.deposit(1_000e6);
        vm.prank(alice); uint256 id = vault.requestWithdraw(400e6);

        // Vault already holds 1_000 USDC from deposit, claim should succeed
        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice); vault.claim(id);
        assertEq(usdc.balanceOf(alice), before + 400e6);

        vm.prank(alice);
        vm.expectRevert(GoldaVault.AlreadySettled.selector);
        vault.claim(id);
    }

    function test_claim_reverts_when_not_liquid() public {
        vm.prank(alice); vault.deposit(1_000e6);
        vm.prank(alice); uint256 id = vault.requestWithdraw(400e6);

        // Operator moves USDC out via allowlisted target, vault becomes illiquid
        vm.prank(operator);
        vault.approveToken(IERC20(address(usdc)), address(swapper), type(uint256).max);
        bytes memory data = abi.encodeCall(
            StubSwap.swap,
            (IERC20(address(usdc)), 900e6, IERC20(address(gold)), 900e6)
        );
        vm.prank(operator); vault.execute(address(swapper), 0, data);

        vm.prank(alice);
        vm.expectRevert(GoldaVault.ClaimNotReady.selector);
        vault.claim(id);
    }

    function test_execute_routes_through_allowlisted_target() public {
        vm.prank(alice); vault.deposit(1_000e6);

        vm.prank(operator);
        vault.approveToken(IERC20(address(usdc)), address(swapper), type(uint256).max);

        bytes memory data = abi.encodeCall(
            StubSwap.swap,
            (IERC20(address(usdc)), 500e6, IERC20(address(gold)), 500e6)
        );
        vm.prank(operator); vault.execute(address(swapper), 0, data);

        assertEq(usdc.balanceOf(address(vault)), 500e6);
        assertEq(gold.balanceOf(address(vault)), 500e6);
    }

    function test_execute_rejects_unallowlisted() public {
        vm.prank(operator);
        vm.expectRevert(GoldaVault.TargetNotAllowed.selector);
        vault.execute(address(0xdead), 0, "");
    }

    function test_execute_rejects_non_operator() public {
        vm.prank(alice);
        vm.expectRevert(GoldaVault.NotOperator.selector);
        vault.execute(address(swapper), 0, "");
    }

    function test_report_nav_changes_share_price() public {
        vm.prank(alice); vault.deposit(1_000e6);
        vm.prank(operator); vault.reportNav(1_250e6);
        // 1 share now worth 1.25 USDC
        assertEq(vault.sharePrice(), 1_250_000);
    }

    function test_rescue_blocks_usdc() public {
        vm.prank(owner);
        vm.expectRevert(GoldaVault.CannotRescueUSDC.selector);
        vault.rescue(IERC20(address(usdc)), 1, owner);
    }

    function test_rescue_other_tokens_ok() public {
        gold.mint(address(vault), 100e6);
        vm.prank(owner);
        vault.rescue(IERC20(address(gold)), 100e6, owner);
        assertEq(gold.balanceOf(owner), 100e6);
    }

    function test_set_operator() public {
        vm.prank(owner); vault.setOperator(alice);
        assertEq(vault.operator(), alice);
    }

    function test_owner_can_also_operate() public {
        vm.prank(alice); vault.deposit(1_000e6);
        vm.prank(owner);
        vault.approveToken(IERC20(address(usdc)), address(swapper), 1);
    }
}
