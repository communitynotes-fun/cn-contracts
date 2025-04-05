// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

enum MarketStatus {
    OPEN,
    REVEALED,
    TRACKED,
    REFUNDED
}

struct MarketConfig {
    address creator;
    string tweetId;
    MarketStatus status;
    uint256 deadline;
    uint256 minValue;
    int256 wadFeeFraction;
    address feeRecipient;
    uint256 tweetTimestamp;
}

struct Prediction {
    uint256 value;
    address predictor;
    bool isAgree; // Keep this since we need to track agree/disagree
    uint256 timestamp;
    bool claimed;
}

struct PredictionTracker {
    uint256 nextPredictionId;
    uint256 totalAgreeValue; // Total ETH staked on "agree"
    uint256 totalDisagreeValue; // Total ETH staked on "disagree"
    uint256 totalValueClaimed;
    uint256 numPredictions;
}

struct Outcome {
    bool hasNote;
    string noteText;
    bytes noteEmbedding;
    uint256 revealTimestamp;
}

struct ResolverPrediction {
    bool tracked;
    bytes reasonEmbedding;
    string reasonText;
    uint256 timestamp;
    int256 wadWeightedSimilarity;
}
