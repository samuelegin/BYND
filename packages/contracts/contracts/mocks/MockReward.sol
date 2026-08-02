// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockReward {
    mapping(address => uint256) public rewardPerEpoch;

    function setTokenRewardsPerEpoch(address token, uint256 amount) external {
        rewardPerEpoch[token] = amount;
    }

    function tokenRewardsPerEpoch(address token, uint256) external view returns (uint256) {
        return rewardPerEpoch[token];
    }
}