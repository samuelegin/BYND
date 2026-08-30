// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/finance/VestingWallet.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "../BYND.sol";

/// @title BYNDVestingFactoryBase
/// @notice Shared machinery for BYNDTeamVesting and BYNDInvestorVesting.
///
/// Deploys one OpenZeppelin VestingWallet per beneficiary and mints their
/// grant directly into it — this contract itself holds BYND's MINTER_ROLE,
/// the same pattern BYNDEmissions uses, so the pool's cap is enforced AT
/// THE MINTING SOURCE, not by a separate bookkeeping check that could be
/// bypassed by minting some other way. Mirrors the 40M protocol-emission
/// budget's philosophy exactly, just for a one-time allocation instead of a
/// continuous stream.
///
/// Deliberately reuses OZ's own audited VestingWallet rather than writing
/// custom vesting math: VestingWallet's stock linear-release formula
/// (0 before `start`, linear from `start` to `start + duration`, then the
/// full amount) already IS a cliff-and-linear schedule for free — a
/// "12-month cliff then 36-month linear" grant is just
/// start = TGE + 365 days, duration = 1095 days. No custom arithmetic to
/// get wrong.
///
/// One VestingWallet instance per beneficiary (the standard, widely-used
/// pattern for this) — not a single shared multi-beneficiary contract —
/// because that's exactly what VestingWallet is designed for, and it keeps
/// each beneficiary's schedule and released-so-far state fully isolated
/// and independently auditable on a block explorer.
abstract contract BYNDVestingFactoryBase is AccessControl {
    /// @dev Monetary-policy-adjacent power: who gets a grant, how much, and
    /// (for investors) on what schedule. Timelock/governance-gated, never a
    /// bare EOA — same reasoning as BYNDEmissions' TIMELOCK_ROLE.
    bytes32 public constant TIMELOCK_ROLE = keccak256("TIMELOCK_ROLE");

    BYND public immutable byndToken;

    /// @notice Hard cap on cumulative BYND minted through this pool.
    /// Set once at deployment (10M for both team and investors per the
    /// mainnet tokenomics design) — separate constant per concrete
    /// contract, not shared, so team and investor pools can never draw
    /// against each other's budget even by accident.
    uint256 public immutable poolCap;

    /// @notice Cumulative BYND minted through this pool so far.
    uint256 public totalAllocated;

    address[] public vestingWallets;
    mapping(address => address) public vestingWalletOf; // beneficiary => wallet

    event GrantCreated(
        address indexed beneficiary,
        address indexed vestingWallet,
        uint256 amount,
        uint64 start,
        uint64 duration
    );

    constructor(address admin, address byndToken_, uint256 poolCap_) {
        require(admin != address(0), "admin=0");
        require(byndToken_ != address(0), "bynd=0");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        byndToken = BYND(byndToken_);
        poolCap = poolCap_;
        // TIMELOCK_ROLE deliberately NOT granted to `admin` here — same
        // reasoning as BYNDEmissions: grant it explicitly to the timelock
        // address after deployment, keep the EOA-facing deploy step free
        // of monetary-policy power by default.
    }

    /// @notice How much of this pool's cap is left to allocate.
    function remainingCap() public view returns (uint256) {
        return totalAllocated >= poolCap ? 0 : poolCap - totalAllocated;
    }

    function vestingWalletCount() external view returns (uint256) {
        return vestingWallets.length;
    }

    /// @dev One grant per beneficiary — a second grant attempt for an
    /// address that already has a vesting wallet reverts rather than
    /// silently deploying a confusing second wallet for the same person.
    /// Concrete subclasses (BYNDTeamVesting/BYNDInvestorVesting) decide the
    /// schedule and call this once it's determined.
    function _createGrant(
        address beneficiary,
        uint256 amount,
        uint64 start,
        uint64 duration
    ) internal returns (address wallet) {
        require(beneficiary != address(0), "beneficiary=0");
        require(amount > 0, "amount=0");
        require(vestingWalletOf[beneficiary] == address(0), "already has a grant");
        require(totalAllocated + amount <= poolCap, "exceeds pool cap");

        VestingWallet vw = new VestingWallet(beneficiary, start, duration);
        wallet = address(vw);

        totalAllocated += amount;
        vestingWallets.push(wallet);
        vestingWalletOf[beneficiary] = wallet;

        // Minting directly to the freshly-deployed wallet, not to this
        // contract first — the wallet is the sole holder of its own grant
        // for its entire lifetime, matching VestingWallet's intended usage
        // (tokens sent to it are what release() draws down over time).
        byndToken.mint(wallet, amount);

        emit GrantCreated(beneficiary, wallet, amount, start, duration);
    }
}
