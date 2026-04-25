// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title GoldaVault
/// @notice Accounting-only vault for Golda Finance (Monad).
/// Users deposit USDC and receive gUSDC shares. An operator executes LiFi
/// swaps (USDC -> XAUt0 / WBTC / PAXG) and yield moves (Euler, Hyperithm,
/// Steakhouse EVK vaults, etc.) by forwarding calldata to allowlisted
/// targets. The vault itself holds no swap or lending logic: it is a ledger
/// plus a gated executor so the app can use the full LiFi SDK off-chain.
contract GoldaVault is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public operator;

    /// @notice Admin-reported total vault value in USDC units (6 decimals).
    /// Covers idle USDC + gold tokens + yield vault shares, priced off-chain
    /// via LiFi / Pyth and pushed via `reportNav`.
    uint256 public navUSDC;
    uint256 public lastNavUpdate;

    /// @notice Contracts the operator may call (LiFi Diamond, Permit2Proxy,
    /// Euler vaults, etc.). Also used as the approve target allowlist.
    mapping(address => bool) public allowedTarget;

    struct Withdrawal {
        address user;
        uint128 usdcOwed;
        bool settled;
    }
    Withdrawal[] public withdrawals;
    mapping(address => uint256[]) internal _userWithdrawals;

    uint256 public constant MIN_DEPOSIT = 1e6; // 1 USDC
    uint256 public constant SHARE_INIT = 1e6;  // 1 share = 1 USDC at genesis

    event Deposit(address indexed user, uint256 usdcIn, uint256 sharesOut);
    event WithdrawRequested(address indexed user, uint256 indexed id, uint256 shares, uint256 usdcOwed);
    event WithdrawClaimed(uint256 indexed id, address indexed user, uint256 usdc);
    event NavReported(uint256 navUSDC, uint256 timestamp);
    event TargetAllowed(address indexed target, bool allowed);
    event Executed(address indexed target, uint256 value, bytes4 selector);
    event OperatorSet(address indexed operator);

    error NotOperator();
    error BelowMinDeposit();
    error ZeroShares();
    error InsufficientShares();
    error TargetNotAllowed();
    error ClaimNotReady();
    error NotOwnerOfClaim();
    error AlreadySettled();
    error CannotRescueUSDC();
    error CallFailed(bytes data);

    modifier onlyOperator() {
        if (msg.sender != operator && msg.sender != owner()) revert NotOperator();
        _;
    }

    constructor(address _usdc, address _operator)
        ERC20("Golda Vault Share", "gUSDC")
        Ownable(msg.sender)
    {
        usdc = IERC20(_usdc);
        operator = _operator;
        emit OperatorSet(_operator);
    }

    // ---------------------------------------------------------------- user

    /// @notice Deposit USDC and mint shares at current NAV.
    function deposit(uint256 usdcAmount) external nonReentrant returns (uint256 shares) {
        if (usdcAmount < MIN_DEPOSIT) revert BelowMinDeposit();

        uint256 supply = totalSupply();
        uint256 nav = navUSDC;

        shares = (supply == 0 || nav == 0)
            ? usdcAmount
            : (usdcAmount * supply) / nav;
        if (shares == 0) revert ZeroShares();

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        navUSDC = nav + usdcAmount;
        _mint(msg.sender, shares);

        emit Deposit(msg.sender, usdcAmount, shares);
    }

    /// @notice Burn shares and queue a USDC claim at the current share price.
    /// The operator then unwinds positions (withdraw from yield vaults,
    /// LiFi swap gold -> USDC) and the user calls `claim` once liquid.
    function requestWithdraw(uint256 shares) external nonReentrant returns (uint256 id) {
        if (shares == 0 || balanceOf(msg.sender) < shares) revert InsufficientShares();

        uint256 supply = totalSupply();
        uint256 nav = navUSDC;
        uint256 owed = (shares * nav) / supply;

        _burn(msg.sender, shares);
        navUSDC = nav - owed;

        withdrawals.push(Withdrawal({
            user: msg.sender,
            usdcOwed: uint128(owed),
            settled: false
        }));
        id = withdrawals.length - 1;
        _userWithdrawals[msg.sender].push(id);

        emit WithdrawRequested(msg.sender, id, shares, owed);
    }

    /// @notice Claim a queued withdrawal once the vault has enough liquid USDC.
    function claim(uint256 id) external nonReentrant {
        Withdrawal storage w = withdrawals[id];
        if (w.user != msg.sender) revert NotOwnerOfClaim();
        if (w.settled) revert AlreadySettled();
        uint256 owed = w.usdcOwed;
        if (usdc.balanceOf(address(this)) < owed) revert ClaimNotReady();

        w.settled = true;
        usdc.safeTransfer(w.user, owed);

        emit WithdrawClaimed(id, w.user, owed);
    }

    // ------------------------------------------------------------ operator

    /// @notice Execute arbitrary calldata against an allowlisted target.
    /// Operator builds LiFi swap/bridge calldata off-chain (via the LiFi SDK)
    /// and forwards it here; same pattern for yield vault deposit/withdraw.
    function execute(address target, uint256 value, bytes calldata data)
        external
        onlyOperator
        nonReentrant
        returns (bytes memory result)
    {
        if (!allowedTarget[target]) revert TargetNotAllowed();
        (bool ok, bytes memory ret) = target.call{value: value}(data);
        if (!ok) revert CallFailed(ret);
        bytes4 sel = data.length >= 4 ? bytes4(data[:4]) : bytes4(0);
        emit Executed(target, value, sel);
        return ret;
    }

    /// @notice Set ERC20 allowance for an allowlisted spender (LiFi Diamond,
    /// Permit2Proxy, yield vault). Uses forceApprove for USDT-style tokens.
    function approveToken(IERC20 token, address spender, uint256 amount)
        external
        onlyOperator
    {
        if (!allowedTarget[spender]) revert TargetNotAllowed();
        token.forceApprove(spender, amount);
    }

    /// @notice Push the off-chain valuation of the vault (idle USDC + gold +
    /// yield vault shares, priced via LiFi quotes / Pyth) in USDC 6dp.
    function reportNav(uint256 _navUSDC) external onlyOperator {
        navUSDC = _navUSDC;
        lastNavUpdate = block.timestamp;
        emit NavReported(_navUSDC, block.timestamp);
    }

    // --------------------------------------------------------------- admin

    function setOperator(address _op) external onlyOwner {
        operator = _op;
        emit OperatorSet(_op);
    }

    function setAllowedTarget(address target, bool allowed) external onlyOwner {
        allowedTarget[target] = allowed;
        emit TargetAllowed(target, allowed);
    }

    function setAllowedTargets(address[] calldata targets, bool allowed) external onlyOwner {
        for (uint256 i; i < targets.length; ++i) {
            allowedTarget[targets[i]] = allowed;
            emit TargetAllowed(targets[i], allowed);
        }
    }

    /// @notice Rescue non-USDC tokens stuck in the vault (e.g. dust).
    /// USDC is the unit of account and cannot be pulled this way.
    function rescue(IERC20 token, uint256 amount, address to) external onlyOwner {
        if (address(token) == address(usdc)) revert CannotRescueUSDC();
        token.safeTransfer(to, amount);
    }

    // --------------------------------------------------------------- views

    function userWithdrawals(address user) external view returns (uint256[] memory) {
        return _userWithdrawals[user];
    }

    function withdrawalsLength() external view returns (uint256) {
        return withdrawals.length;
    }

    /// @notice Price of one share in USDC units (6 decimals).
    function sharePrice() external view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return SHARE_INIT;
        return (navUSDC * SHARE_INIT) / supply;
    }

    receive() external payable {}
}
