// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract OwnerOnlyLockable {
    bool private locked = false;
    address private owner;

    modifier _ownerOnly(){
        require(msg.sender == owner);
        _;
    }
    modifier unlocked {
        require(!locked);
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function lock() public _ownerOnly {
        locked = true;
    }

    function unlock() public _ownerOnly {
        locked = false;
    }

    function isLocked() public view returns (bool) {
        return locked;
    }

    function getOwner() public view returns (address) {
        return owner;
    }
}

contract Token is ERC20, ERC20Burnable, OwnerOnlyLockable {

    uint256[2] private burnRatio;

    constructor(string memory name, string memory symbol, uint256 initialSupply) ERC20(name, symbol) {
        uint256 supply = initialSupply * 10**uint(decimals()); // with 9 decimals
        _mint(msg.sender, supply);
        // default burn ratio is 2% per txn
        burnRatio[0] = 20;
        burnRatio[1] = 1000;
    }

    function calculateBurnAmt(uint256 supp) public view returns (uint256) {
        uint256 amount = supp*burnRatio[0]/burnRatio[1];
        return amount;
    }

    /*
        Burn 2% of the sent amount on each tx
    */
    function transfer(address recipient, uint256 amount) public override unlocked returns (bool) {
        uint256 burnAmt = calculateBurnAmt(amount);
        uint256 newAmount = amount - burnAmt;
        burn(burnAmt);
        _transfer(msg.sender, recipient, newAmount);
        return true;
    }

    /*
        Effectively manipulates the token's burn ratio
     */
    function setBurnRatio(uint256 num, uint256 denom) public _ownerOnly {
        burnRatio[0] = num;
        burnRatio[1] = denom;
    }
}