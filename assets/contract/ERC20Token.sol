// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract Token is ERC20, ERC20Burnable {

    constructor(string memory name, string memory symbol, uint256 initialSupply) ERC20(name, symbol) {
        uint256 supply = initialSupply * 10**uint(decimals()); // with 9 decimals
        _mint(msg.sender, supply);
    }

}