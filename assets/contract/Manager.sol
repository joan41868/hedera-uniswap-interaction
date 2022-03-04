pragma solidity =0.8.12;

import "./HederaTokenService.sol";

contract Manager is HederaTokenService {
    constructor() public {
    }

    event AssociateFailed(address indexed token0, address indexed token1, address pair, int);

    function associatePair(address pair, address token1, address token2) external {
        address[] memory tokens = new address[](2);
        tokens[0] = token1;
        tokens[1] = token2;
        int result = HederaTokenService.associateTokens(pair, tokens);
        if (result != 22) {
            revert();
        }
    }
}
