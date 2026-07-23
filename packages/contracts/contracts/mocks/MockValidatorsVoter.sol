// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Mock BoostVoter for local testing.
///Tracks gauge registrations and simulates bribe claiming governance adds gauges via addGauge() tests seed bribes via seedBribe().
contract MockValidatorsVoter {
    using SafeERC20 for IERC20;

    struct GaugeInfo {
        address bribe;
        bool    alive;
        uint256 claimableAmount;
    }

    address[] public gaugeList;
    mapping(address => GaugeInfo) public gaugeInfo;
    mapping(address => bool) public whitelistedTokens;
    mapping(uint256 => mapping(address => uint256)) public voteWeights;

    address public rewardToken;
    bool public shouldRevertVote;
    bool public shouldRevertClaim;

    constructor(address _rewardToken) {
        rewardToken = _rewardToken;
    }

    function setShouldRevertVote(bool v) external {
        shouldRevertVote = v;
    }

    function setShouldRevertClaim(bool v) external {
        shouldRevertClaim = v;
    }

    function addGauge(address gauge, address bribe) external {
        gaugeList.push(gauge);
        gaugeInfo[gauge] = GaugeInfo({ bribe: bribe, alive: true, claimableAmount: 0 });
    }

    function killGauge(address gauge) external {
        gaugeInfo[gauge].alive = false;
    }

    function whitelistToken(address token) external {
        whitelistedTokens[token] = true;
    }

    function seedBribe(address bribe, uint256 amount) external {
        IERC20(rewardToken).transferFrom(msg.sender, address(this), amount);
        for (uint256 i = 0; i < gaugeList.length; i++) {
            if (gaugeInfo[gaugeList[i]].bribe == bribe) {
                gaugeInfo[gaugeList[i]].claimableAmount = amount;
            }
        }
    }

    function vote(
        uint256 tokenId,
        address[] calldata _gauges,
        uint256[] calldata weights
    ) external {
        require(!shouldRevertVote, "MockValidatorsVoter: vote reverted (test)");
        for (uint256 i = 0; i < _gauges.length; i++) {
            voteWeights[tokenId][_gauges[i]] = weights[i];
        }
    }

    function claimBribes(
        address[] calldata,
        address[][] calldata tokens,
        uint256
    ) external {
        require(!shouldRevertClaim, "MockValidatorsVoter: claimBribes reverted (test)");
        for (uint256 i = 0; i < tokens.length; i++) {
            for (uint256 j = 0; j < tokens[i].length; j++) {
                address token = tokens[i][j];
                uint256 bal   = IERC20(token).balanceOf(address(this));
                if (bal > 0) {
                    IERC20(token).transfer(msg.sender, bal);
                }
            }
        }
    }

    function gauges(uint256 index) external view returns (address) {
        return gaugeList[index];
    }

    function length() external view returns (uint256) {
        return gaugeList.length;
    }

    function gaugeToBribe(address gauge) external view returns (address) {
        return gaugeInfo[gauge].bribe;
    }

    function isAlive(address gauge) external view returns (bool) {
        return gaugeInfo[gauge].alive;
    }

    function isWhitelistedToken(address token) external view returns (bool) {
        return whitelistedTokens[token];
    }

    function claimable(address gauge) external view returns (uint256) {
        return gaugeInfo[gauge].claimableAmount;
    }

    /// @dev Mirrors real BoostVoter's pure calendar math so tests exercise
    /// the same gating logic as production: epochNext(t) = epochStart(t) + 7 days.
    uint256 private constant WEEK = 7 days;

    function epochNext(uint256 _timestamp) external pure returns (uint256) {
        uint256 start = _timestamp - (_timestamp % WEEK);
        return start + WEEK;
    }
}