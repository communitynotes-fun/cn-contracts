// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {wadMul, wadDiv, wadPow} from "solmate/src/utils/SignedWadMath.sol";

library Algebra {
    error VectorDimMismatch();

    int256 constant MIN_WEIGHT = 0.0001e18;

    // Convert a number to WAD format (18 decimals)
    function toWad(uint256 x) internal pure returns (int256) {
        return int256(x) * 1e18;
    }

    // Calculate dot product of two vectors
    function dot(
        int256[] memory a,
        int256[] memory b
    ) internal pure returns (int256) {
        if (a.length != b.length) {
            revert VectorDimMismatch();
        }

        int256 result = 0;
        for (uint256 i = 0; i < a.length; i++) {
            result += wadMul(a[i], b[i]);
        }

        return result;
    }

    // Calculate the norm (magnitude) of a vector
    function norm(int256[] memory a) internal pure returns (int256) {
        return wadPow(dot(a, a), 0.5e18);
    }

    // Calculate cosine similarity between two vectors
    function similarity(
        int256[] memory a,
        int256[] memory b
    ) internal pure returns (int256) {
        int256 dotProduct = dot(a, b);
        int256 normA = norm(a);
        int256 normB = norm(b);

        // Avoid division by zero
        if (normA == 0 || normB == 0) {
            return 0;
        }

        // Calculate similarity using fixed-point math
        return wadDiv(dotProduct, wadMul(normA, normB));
    }

    // Calculate weighted similarity with shift and weight factors
    function weightedSimilarity(
        int256[] memory a,
        int256[] memory b,
        int256 wadShift,
        int256 wadWeight
    ) internal pure returns (int256) {
        int256 sim = similarity(a, b);

        // Apply shift to similarity and ensure minimum weight
        int256 shiftedSim = sim + wadShift > 0 ? sim + wadShift : MIN_WEIGHT;

        // Apply weight to the shifted similarity
        return wadMul(shiftedSim, wadWeight);
    }

    // Get minimum of two values
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
