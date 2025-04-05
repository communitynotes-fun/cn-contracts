// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {MarketConfig, PredictionTracker, Prediction, Outcome} from "../data/CNStructs.sol";
import "@reclaimprotocol/verifier-solidity-sdk/contracts/Reclaim.sol";

interface ICNMarket {
    // Get market configuration
    function getMarket(
        uint256 marketId
    ) external view returns (MarketConfig memory);

    // Get prediction tracker
    function getPredictionTracker(
        uint256 marketId
    ) external view returns (PredictionTracker memory);

    // Get prediction
    function getPrediction(
        uint256 marketId,
        uint256 predictionId
    ) external view returns (Prediction memory);

    // Get outcome
    function getOutcome(
        uint256 marketId
    ) external view returns (Outcome memory);

    // Get resolver address (Updated - no marketId)
    function getResolver() external view returns (address);

    // Create market
    function createMarket(string calldata tweetId) external returns (uint256);

    // resolve market outcome
    function resolve(
        uint256 marketId,
        bool hasNote,
        string calldata noteText,
        bytes calldata noteEmbeddingBytes,
        Reclaim.Proof memory noteProofBytes,
        Reclaim.Proof memory embeddingProofBytes
    ) external;

    // Track market predictions (renamed)
    function finalizeScores(uint256 marketId) external;

    // Make prediction
    function predict(
        uint256 marketId,
        bool isAgree,
        string calldata reasonText,
        bytes calldata reasonEmbedding
    ) external payable;

    // Get total market value
    function getTotalMarketValue(
        uint256 marketId
    ) external view returns (uint256);

    // Get prediction ratio
    function getPredictionRatio(
        uint256 marketId
    ) external view returns (int256);

    // Resolve market without a note
    function resolveWithoutNote(uint256 marketId) external;
}
