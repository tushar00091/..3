//SPDX-License-Identifier: UNLICENSED

// Solidity files have to start with this pragma.
// It will be used by the Solidity compiler to validate its version.
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// This is the main building block for smart contracts.
contract TestToken is ERC20, Ownable {
    /**
     * Contract initialization.
     */
    constructor() ERC20("Test token", "TST") {
        // The totalSupply is assigned to the transaction sender, which is the
        // account that is deploying the contract.
        _mint(_msgSender(), 1000);
    }
}