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

    /**
     * @notice Reveal the outcome of a market, performing necessary verifications.
     * @dev Called by the designated resolver.
     * @param marketId ID of the market
     * @param hasNote Whether the tweet received a Community Note
     * @param noteText The text of the Community Note (empty if no note)
     * @param noteEmbeddingBytes The ABI encoded int256[] embedding bytes of the note text (empty if no note)
     * @param noteProof The Reclaim.Proof struct for tweet status.
     * @param embeddingProof The Reclaim.Proof struct for embedding.
     */
    function resolve(
        uint256 marketId,
        bool hasNote,
        string calldata noteText,
        bytes calldata noteEmbeddingBytes,
        Reclaim.Proof memory noteProof,
        Reclaim.Proof memory embeddingProof
    ) external;

    /**
     * @notice Resolves a market when the deadline has passed and no community note was found.
     * @param marketId ID of the market to resolve.
     */
    function resolveWithoutNote(uint256 marketId) external;

    /**
     * @notice Triggers the calculation of similarity scores in the resolver or marks market as tracked.
     * @param marketId ID of the market
     */
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
}
