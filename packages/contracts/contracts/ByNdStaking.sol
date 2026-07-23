// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @title  ByNdStaking v2 Multi-token staking for veBYND holders
/// @notice Users stake veBYND to earn any ERC-20 rewards harvested from gauge fees and supports unlimited simultaneous reward tokens (Synthetix rewardPerToken pattern).
contract ByNdStaking is
    Initializable,
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    IERC20Upgradeable public stakingToken;
    address public distributor;

    struct RewardData {
        uint256 rewardPerTokenStored;
    }

    mapping(address => RewardData) public rewardData;
    mapping(address => mapping(address => uint256))  public userRewardPerTokenPaid;
    mapping(address => mapping(address => uint256))  public rewards;

    address[] public rewardTokens;
    mapping(address => bool) public isRewardToken;

    uint256 public totalStaked;
    mapping(address => uint256) public stakedBalance;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, address indexed token, uint256 amount);
    event RewardNotified(address indexed token, uint256 amount);
    event RewardTokenAdded(address indexed token);
    event DistributorUpdated(address indexed newDistributor);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _stakingToken, address _distributor) public initializer {
        __ReentrancyGuard_init();
        __Ownable_init(); 
        __UUPSUpgradeable_init();

        require(_stakingToken != address(0), "ByNdStaking: zero staking token");
        require(_distributor != address(0), "ByNdStaking: zero distributor");

        stakingToken = IERC20Upgradeable(_stakingToken);
        distributor = _distributor;
    }

    modifier updateRewards(address account) {
        uint256 len = rewardTokens.length;
        for (uint256 i = 0; i < len; i++) {
            address token = rewardTokens[i];
            rewardData[token].rewardPerTokenStored = _rewardPerToken(token);
            if (account != address(0)) {
                rewards[token][account] = claimable(token, account);
                userRewardPerTokenPaid[token][account] = rewardData[token].rewardPerTokenStored;
            }
        }
        _;
    }

    function stake(uint256 amount) external nonReentrant updateRewards(msg.sender) {
        require(amount > 0, "ByNdStaking: amount = 0");
        totalStaked += amount;
        stakedBalance[msg.sender] += amount;
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external nonReentrant updateRewards(msg.sender) {
        require(amount > 0, "ByNdStaking: amount = 0");
        require(stakedBalance[msg.sender] >= amount, "ByNdStaking: insufficient balance");
        totalStaked -= amount;
        stakedBalance[msg.sender] -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    function claimAll() external nonReentrant updateRewards(msg.sender) {
        uint256 len = rewardTokens.length;
        for (uint256 i = 0; i < len; i++) {
            address token  = rewardTokens[i];
            uint256 amount = rewards[token][msg.sender];
            if (amount > 0) {
                rewards[token][msg.sender] = 0;
                IERC20Upgradeable(token).safeTransfer(msg.sender, amount);
                emit RewardClaimed(msg.sender, token, amount);
            }
        }
    }

    function claimReward(address token) external nonReentrant updateRewards(msg.sender) {
        uint256 amount = rewards[token][msg.sender];
        if (amount > 0) {
            rewards[token][msg.sender] = 0;
            IERC20Upgradeable(token).safeTransfer(msg.sender, amount);
            emit RewardClaimed(msg.sender, token, amount);
        }
    }

    function notifyRewardAmount(address token, uint256 amount)
        external
        nonReentrant
        updateRewards(address(0))
    {
        require(msg.sender == distributor, "ByNdStaking: not distributor");
        if (totalStaked == 0 || amount == 0) return;

        if (!isRewardToken[token]) {
            isRewardToken[token] = true;
            rewardTokens.push(token);
            emit RewardTokenAdded(token);
        }

        IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), amount);
        rewardData[token].rewardPerTokenStored += (amount * 1e18) / totalStaked;
        emit RewardNotified(token, amount);
    }

    function claimable(address token, address user) public view returns (uint256) {
        return rewards[token][user] + (
            stakedBalance[user] *
            (_rewardPerToken(token) - userRewardPerTokenPaid[token][user])
        ) / 1e18;
    }

    function claimableAll(address user)
        external view
        returns (address[] memory tokens, uint256[] memory amounts)
    {
        uint256 len = rewardTokens.length;
        tokens  = new address[](len);
        amounts = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            tokens[i]  = rewardTokens[i];
            amounts[i] = claimable(rewardTokens[i], user);
        }
    }

    function rewardTokenCount() external view returns (uint256) {
        return rewardTokens.length;
    }

    function setDistributor(address _distributor) external onlyOwner {
        require(_distributor != address(0), "ByNdStaking: zero address");
        distributor = _distributor;
        emit DistributorUpdated(_distributor);
    }

    function _rewardPerToken(address token) internal view returns (uint256) {
        return rewardData[token].rewardPerTokenStored;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}