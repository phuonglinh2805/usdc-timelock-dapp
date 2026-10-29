// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract USDCTimeLock is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error NotYetUnlocked();
    error NoActiveLock();
    error LockAlreadyActive();
    error InvalidAmount();
    error InvalidDuration();

    struct LockInfo {
        uint256 amount;
        uint256 unlockAt;
    }

    IERC20 public immutable usdc;
    mapping(address => LockInfo) private _locks;

    event Locked(address indexed user, uint256 amount, uint256 unlockAt);
    event Withdrawn(address indexed user, uint256 amount);

    constructor(address usdc_, address owner_) Ownable(owner_) {
        usdc = IERC20(usdc_);
    }

    function lock(uint256 amount, uint256 lockDuration) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (lockDuration == 0) revert InvalidDuration();

        LockInfo storage userLock = _locks[msg.sender];
        if (userLock.amount != 0) revert LockAlreadyActive();

        uint256 unlockAt = block.timestamp + lockDuration;
        userLock.amount = amount;
        userLock.unlockAt = unlockAt;

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit Locked(msg.sender, amount, unlockAt);
    }

    function withdraw() external nonReentrant {
        LockInfo storage userLock = _locks[msg.sender];
        uint256 amount = userLock.amount;
        uint256 unlockAt = userLock.unlockAt;

        if (amount == 0) revert NoActiveLock();
        if (block.timestamp < unlockAt) revert NotYetUnlocked();

        delete _locks[msg.sender];
        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    function getLock(address user) external view returns (uint256 amount, uint256 unlockAt) {
        LockInfo storage userLock = _locks[user];
        return (userLock.amount, userLock.unlockAt);
    }
}
