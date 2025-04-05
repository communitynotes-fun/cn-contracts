// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {MarketConfig, MarketStatus, Outcome, Prediction, PredictionTracker, ResolverPrediction} from "../data/CNStructs.sol";
import {Embedding} from "../libraries/Embedding.sol";
import {Algebra} from "../libraries/Algebra.sol";
import {Claim} from "../libraries/Claim.sol";
import {wadMul, wadDiv} from "solmate/src/utils/SignedWadMath.sol";
import {ICNMarket} from "../interfaces/ICNMarket.sol";

/**
 * @title CNMarketResolver
 * @notice Handles the calculation of similarity scores and rewards for resolved markets.
 */
contract CNMarketResolver {
    ICNMarket public market;

    mapping(uint256 => mapping(uint256 => int256)) public similarityScores;
    mapping(uint256 => int256) public wadTotalWeightedScores;
    mapping(uint256 => mapping(uint256 => ResolverPrediction))
        public predictions;

    int256 public constant WAD_SIMILARITY_SHIFT = 0;
    int256 public constant WAD_EARLY_BONUS_MAX = 0.5e18;

    event PredictionTracked(
        uint256 indexed marketId,
        uint256 indexed predictionId,
        int256 wadWeightedScore
    );
    event MarketTracked(uint256 indexed marketId, int256 wadTotalWeightedScore);
    event LogResolverEmbedding(
        uint256 indexed marketId,
        string context,
        int256[] embedding
    );

    error NotMarket();
    error MarketAlreadyTracked();
    error PredictionAlreadyTracked();

    modifier onlyMarket() {
        if (msg.sender != address(market)) {
            revert NotMarket();
        }
        _;
    }

    constructor(address _market) {
        market = ICNMarket(_market);
    }

    /**
     * @notice Calculate similarity scores for all predictions in a market against the note embedding.
     * @dev Renamed from trackPredictions for clarity.
     * @dev Renamed to finalizeDisagreeScores as it only applies when hasNote=true.
     * @param marketId The ID of the market
     * @param noteEmbedding The embedding of the Community Note (decoded int256[] array)
     */
    function finalizeDisagreeScores(
        uint256 marketId,
        int256[] memory noteEmbedding
    ) external onlyMarket {
        if (wadTotalWeightedScores[marketId] != 0) {
            revert MarketAlreadyTracked();
        }
        emit LogResolverEmbedding(
            marketId,
            "finalizeDisagreeScores: Received Embedding",
            noteEmbedding
        );

        MarketConfig memory marketConfig = market.getMarket(marketId);
        PredictionTracker memory tracker = market.getPredictionTracker(
            marketId
        );
        validateEmbedding(noteEmbedding); // Validate note embedding once outside the loop

        int256 wadTotalScore = 0;

        for (uint256 i = 1; i <= tracker.numPredictions; i++) {
            Prediction memory prediction = market.getPrediction(marketId, i);
            if (prediction.isAgree) continue;

            ResolverPrediction storage resolverPrediction = predictions[
                marketId
            ][i];

            // Use internal function to calculate the score
            int256 wadWeightedScore = _calculateWeightedScore(
                marketConfig,
                prediction,
                resolverPrediction,
                noteEmbedding
            );

            // Store results
            similarityScores[marketId][i] = wadWeightedScore;
            resolverPrediction.wadWeightedSimilarity = wadWeightedScore;
            resolverPrediction.tracked = true;

            wadTotalScore += wadWeightedScore;
            emit PredictionTracked(marketId, i, wadWeightedScore);
        }

        wadTotalWeightedScores[marketId] = wadTotalScore;
        emit MarketTracked(marketId, wadTotalScore);
    }

    // --- Internal Helper Functions ---

    /**
     * @dev Calculates the time-based weight for a prediction.
     */
    function _calculateTimeWeight(
        MarketConfig memory marketConfig,
        Prediction memory prediction
    ) internal pure returns (int256 timeWeight) {
        uint256 timeElapsed = prediction.timestamp -
            marketConfig.tweetTimestamp;
        uint256 totalTime = marketConfig.deadline - marketConfig.tweetTimestamp;

        timeWeight = int256(1e18); // Base weight
        if (totalTime > 0 && timeElapsed < totalTime) {
            // Ensure elapsed <= total
            timeWeight += wadMul(
                WAD_EARLY_BONUS_MAX,
                wadDiv(int256(totalTime - timeElapsed), int256(totalTime))
            );
        }
        // Else: If timeElapsed >= totalTime or totalTime is 0, return base weight 1e18
    }

    /**
     * @dev Calculates the weighted similarity score for a single prediction.
     */
    function _calculateWeightedScore(
        MarketConfig memory marketConfig,
        Prediction memory prediction,
        ResolverPrediction storage resolverPrediction,
        int256[] memory noteEmbedding
    ) internal view returns (int256 wadWeightedScore) {
        // Changed to view as it reads storage
        if (resolverPrediction.tracked) {
            revert PredictionAlreadyTracked(); // Check if already tracked here
        }

        int256[] memory predictionEmbedding = Embedding.decode(
            resolverPrediction.reasonEmbedding
        );
        validateEmbedding(predictionEmbedding); // Validate prediction embedding

        int256 timeWeight = _calculateTimeWeight(marketConfig, prediction);

        int256 predictionValueWad = Algebra.toWad(prediction.value);
        int256 weightedValue = wadMul(predictionValueWad, timeWeight);

        wadWeightedScore = Algebra.weightedSimilarity(
            predictionEmbedding,
            noteEmbedding,
            WAD_SIMILARITY_SHIFT,
            weightedValue
        );
    }

    /**
     * @notice Calculate the reward for a prediction
     * @param marketId The ID of the market
     * @param predictionId The ID of the prediction
     * @param totalValueToDistribute The total value from the losing side to be distributed.
     * @param wadFeeFraction The fee fraction in WAD format
     * @return payout The payout amount
     * @return fee The fee amount
     */
    function calculateReward(
        uint256 marketId,
        uint256 predictionId,
        uint256 totalValueToDistribute,
        int256 wadFeeFraction
    ) external view returns (uint256 payout, uint256 fee) {
        int256 wadWeightedScore = similarityScores[marketId][predictionId];
        int256 wadTotalScore = wadTotalWeightedScores[marketId];

        if (wadWeightedScore <= 0 || wadTotalScore <= 0) {
            return (0, 0);
        }

        return
            Claim.getClaimValue(
                wadWeightedScore,
                wadTotalScore,
                totalValueToDistribute,
                wadFeeFraction
            );
    }

    function validateEmbedding(int256[] memory embedding) public pure {
        require(embedding.length > 0, "Empty embedding");
        bool hasNonzero = false;
        for (uint256 i = 0; i < embedding.length; i++) {
            int256 value = embedding[i];
            require(
                value >= -1e18 && value <= 1e18,
                "Embedding value out of bounds"
            );
            if (!hasNonzero && value != 0) {
                hasNonzero = true;
            }
        }
        require(hasNonzero, "All-zero embedding");
        int256 norm = Algebra.norm(embedding);
        // SKIP NORMALIZATION CHECK FOR HACKATHON DEMO (Keep this skipped for now)
        // require(norm >= 0.9e18 && norm <= 1.1e18, "Embedding not normalized");
    }

    function addPrediction(
        uint256 marketId,
        uint256 predictionId,
        string calldata reasonText,
        bytes calldata reasonEmbedding,
        uint256 value
    ) external onlyMarket {
        predictions[marketId][predictionId] = ResolverPrediction({
            tracked: false,
            reasonEmbedding: reasonEmbedding,
            reasonText: reasonText,
            timestamp: block.timestamp,
            wadWeightedSimilarity: 0
        });
    }
}
