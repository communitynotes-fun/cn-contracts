// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {wadMul, wadDiv} from "solmate/src/utils/SignedWadMath.sol";

library Claim {
    error Overflow();

    // Calculate the claim value based on score, total score, total value, and fee fraction
    function getClaimValue(
        int256 wadScore,
        int256 wadTotalScore,
        uint256 totalValue,
        int256 wadFeeFraction
    ) internal pure returns (uint256 payout, uint256 fees) {
        // Calculate the share of the total score
        int256 wadShare = wadDiv(wadScore, wadTotalScore);

        // Calculate the payout before fees
        int256 payoutPreFees = wadMul(wadShare, int256(totalValue));

        // Calculate fees
        fees = uint256(wadMul(wadFeeFraction, payoutPreFees));

        // Calculate final payout
        payout = uint256(payoutPreFees) - fees;
    }
}
