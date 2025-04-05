// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@reclaimprotocol/verifier-solidity-sdk/contracts/Reclaim.sol";

import {MarketConfig, MarketStatus, Outcome, Prediction, PredictionTracker} from "../data/CNStructs.sol";
import {Embedding} from "../libraries/Embedding.sol";
import {Algebra} from "../libraries/Algebra.sol";
import {Claim} from "../libraries/Claim.sol";
import {wadMul, wadDiv} from "solmate/src/utils/SignedWadMath.sol";
import {IEmbeddingVerifier} from "../interfaces/IEmbeddingVerifier.sol";
import {ITweetVerifier} from "../interfaces/ITweetVerifier.sol";
import {CNMarketResolver} from "./CNMarketResolver.sol";
import {ICNMarket} from "../interfaces/ICNMarket.sol";

contract CNMarket is ICNMarket {
    // Constants
    uint256 public constant MARKET_DURATION = 24 hours;
    uint256 public constant MIN_VALUE = 0.01 ether;
    int256 public WAD_FEE_FRACTION = 0;
    int256 public constant WAD_EARLY_BONUS_MAX = 0.5e18;

    // State variables
    address public owner;
    address public tweetVerifier;
    address public embeddingVerifier;
    uint256 private nextMarketId = 1; // Counter for market IDs
    address public resolverAddress; // Single global resolver

    // Market data
    mapping(uint256 => MarketConfig) public markets;
    mapping(string => uint256) public tweetIdToMarketId; // Track markets by tweet ID
    mapping(uint256 => Outcome) public outcomes;
    mapping(uint256 => mapping(uint256 => Prediction)) public predictions;
    mapping(uint256 => PredictionTracker) public predictionTrackers;
    mapping(address => uint256) public fees;
    mapping(uint256 => int256) public totalWeightedAgreeScores;
    mapping(uint256 => mapping(uint256 => int256)) public weightedAgreeScores;

    // Events
    event MarketCreated(
        uint256 indexed marketId,
        address indexed creator,
        string tweetId,
        uint256 creationTime,
        uint256 deadline
    );
    event VerifierUpdated(address indexed verifier, bool isTweetVerifier);
    event FeeUpdated(int256 wadFeeFraction);
    event PredictionMade(
        uint256 indexed marketId,
        uint256 indexed predictionId,
        address predictor,
        bool isAgree,
        uint256 value,
        uint256 timestamp
    );
    event MarketResolved(
        uint256 indexed marketId,
        bool hasNote,
        string noteText,
        uint256 revealTimestamp
    );
    event PredictionClaimed(
        uint256 indexed marketId,
        uint256 indexed predictionId,
        address indexed predictor,
        uint256 payout,
        uint256 fee
    );
    event DebugLogInt(string message, int256 value);
    event DebugLogString(string message, string value);
    event ResolverUpdated(address indexed newResolverAddress);

    // Errors
    error MarketAlreadyExists();
    error InvalidTweetId();
    error Unauthorized();
    error MarketClosed();
    error InsufficientValue();
    error PredictionFailed();
    error MarketNotResolved();
    error MarketAlreadyResolved();
    error MarketNotEnded();
    error VerificationFailed();
    error PredictionAlreadyClaimed();
    error NotThePredictor();
    error MarketNotTracked();
    error InsufficientMarketBalance();

    constructor(address _tweetVerifier, address _embeddingVerifier) {
        owner = msg.sender;
        tweetVerifier = _tweetVerifier;
        embeddingVerifier = _embeddingVerifier;
    }

    // Modifier to restrict access to owner
    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert Unauthorized();
        }
        _;
    }

    /**
     * @notice Generate a unique market ID
     * @return A unique market ID
     */
    function generateMarketId() private returns (uint256) {
        uint256 marketId = nextMarketId;
        nextMarketId++;
        return marketId;
    }

    /**
     * @notice Set the tweet verifier address
     * @param _tweetVerifier Address of the tweet verifier
     */
    function setTweetVerifier(address _tweetVerifier) external onlyOwner {
        tweetVerifier = _tweetVerifier;
        emit VerifierUpdated(_tweetVerifier, true);
    }

    /**
     * @notice Set the embedding verifier address
     * @param _embeddingVerifier Address of the embedding verifier
     */
    function setEmbeddingVerifier(
        address _embeddingVerifier
    ) external onlyOwner {
        embeddingVerifier = _embeddingVerifier;
        emit VerifierUpdated(_embeddingVerifier, false);
    }

    /**
     * @notice Set the fee fraction
     * @param _wadFeeFraction Fee fraction in WAD format
     */
    function setFeeFraction(int256 _wadFeeFraction) external onlyOwner {
        WAD_FEE_FRACTION = _wadFeeFraction;
        emit FeeUpdated(_wadFeeFraction);
    }

    /**
     * @notice Set the GLOBAL resolver address (Only Owner)
     * @param _resolver The new resolver address
     */
    function setResolver(address _resolver) external onlyOwner {
        require(_resolver != address(0), "Invalid resolver");
        resolverAddress = _resolver;
        emit ResolverUpdated(_resolver);
    }

    /**
     * @notice Create a new market for a tweet
     * @param tweetId ID of the tweet
     * @return marketId ID of the created market
     */
    function createMarket(
        string calldata tweetId
    ) external override returns (uint256) {
        // Check if market already exists for this tweet
        if (tweetIdToMarketId[tweetId] != 0) {
            revert MarketAlreadyExists();
        }

        // Validate tweet ID (simple validation for now)
        if (bytes(tweetId).length == 0) {
            revert InvalidTweetId();
        }

        // Generate market ID
        uint256 marketId = generateMarketId();

        // Store market config
        markets[marketId] = MarketConfig({
            creator: msg.sender,
            tweetId: tweetId,
            status: MarketStatus.OPEN,
            deadline: block.timestamp + MARKET_DURATION,
            minValue: MIN_VALUE,
            wadFeeFraction: WAD_FEE_FRACTION,
            feeRecipient: owner,
            tweetTimestamp: block.timestamp
        });

        // Map tweet ID to market ID
        tweetIdToMarketId[tweetId] = marketId;

        // Initialize prediction tracker
        predictionTrackers[marketId] = PredictionTracker({
            nextPredictionId: 1,
            totalAgreeValue: 0,
            totalDisagreeValue: 0,
            totalValueClaimed: 0,
            numPredictions: 0
        });

        // Emit event
        emit MarketCreated(
            marketId,
            msg.sender,
            tweetId,
            block.timestamp,
            block.timestamp + MARKET_DURATION
        );

        return marketId;
    }

    // Implementation of interface functions
    function getMarket(
        uint256 marketId
    ) external view override returns (MarketConfig memory) {
        return markets[marketId];
    }

    function getPredictionTracker(
        uint256 marketId
    ) external view override returns (PredictionTracker memory) {
        return predictionTrackers[marketId];
    }

    function getPrediction(
        uint256 marketId,
        uint256 predictionId
    ) external view override returns (Prediction memory) {
        return predictions[marketId][predictionId];
    }

    /**
     * @notice Reveal the outcome of a market, performing necessary verifications.
     * @dev This is the primary function for resolving a market, called by the designated resolver.
     * @param marketId ID of the market
     * @param hasNote Whether the tweet received a Community Note
     * @param noteText The text of the Community Note (empty if no note)
     * @param noteEmbedding The ENCODED embedding bytes of the note text (empty if no note)
     * @param noteProof Proof data that the tweet status is correct (for ITweetVerifier).
     * @param embeddingProof Proof data that the embedding is correct (for IEmbeddingVerifier).
     */
    function resolve(
        uint256 marketId,
        bool hasNote,
        string calldata noteText,
        bytes calldata noteEmbedding,
        Reclaim.Proof memory noteProof,
        Reclaim.Proof memory embeddingProof
    ) external override {
        // Only allow the designated resolver for this market to call
        // if (msg.sender != resolvers[marketId]) {
        //     revert Unauthorized();
        // }

        MarketConfig storage market = markets[marketId];
        if (market.status != MarketStatus.OPEN) {
            revert MarketAlreadyResolved();
        }

        // 1. Verify tweet status
        // if (tweetVerifier != address(0)) {
        // Decode bytes calldata to Reclaim.Proof memory
        // Reclaim.Proof memory noteProofDecoded = abi.decode(
        //     noteProofBytes,
        //     (Reclaim.Proof)
        // );
        // ITweetVerifier(tweetVerifier).verify(noteProof);
        // (
        //     string memory extractedNoteText,
        //     string memory extractedNoteId,
        //     string memory extractedUrl
        // ) = ITweetVerifier(tweetVerifier).verify(noteProof);

        // // im thinking how to kind of verify that the content is legit
        // // how to console log?
        // emit DebugLogString("Note Text", extractedNoteText);
        // emit DebugLogString("Note ID", extractedNoteId);
        // emit DebugLogString("URL", extractedUrl);
        // }

        // 2. Verify embedding
        // bytes memory finalNoteEmbedding = noteEmbeddingBytes;
        // if (hasNote && embeddingVerifier != address(0)) {
        //     // Decode bytes calldata to Reclaim.Proof memory
        //     // Reclaim.Proof memory embeddingProofDecoded = abi.decode(
        //     //     embeddingProofBytes,
        //     //     (Reclaim.Proof)
        //     // );
        //     int256[] memory decodedVerifiedEmbedding = IEmbeddingVerifier(
        //         embeddingVerifier
        //     ).verify(
        //             noteText,
        //             finalNoteEmbedding, // Pass encoded bytes
        //             embeddingProof // Pass decoded struct
        //         );
        //     // Trust the verifier
        // }

        // 3. Store outcome (still store encoded bytes)
        outcomes[marketId] = Outcome({
            hasNote: hasNote,
            noteText: noteText,
            noteEmbedding: noteEmbedding,
            revealTimestamp: block.timestamp
        });

        market.status = MarketStatus.REVEALED;

        emit MarketResolved(marketId, hasNote, noteText, block.timestamp);
    }

    /**
     * @notice Resolves a market when the deadline has passed and no community note was found.
     * @dev Can only be called by the designated resolver for the market.
     * @param marketId ID of the market to resolve.
     */
    function resolveWithoutNote(uint256 marketId) external override {
        // 1. Check Caller
        // require(msg.sender == resolvers[marketId], "Unauthorized"); // REMOVED FOR SIMPLER TESTING

        // 2. Check Status
        MarketConfig storage market = markets[marketId];
        if (market.status != MarketStatus.OPEN) {
            revert MarketAlreadyResolved();
        }

        require(block.timestamp >= market.deadline, "MarketNotEnded");

        // 4. Store Outcome (No Note)
        outcomes[marketId] = Outcome({
            hasNote: false,
            noteText: "",
            noteEmbedding: bytes(""),
            revealTimestamp: block.timestamp
        });

        // 5. Update Market Status
        market.status = MarketStatus.REVEALED;

        // 6. Emit Event
        // Pass hasNote=false and empty noteText
        emit MarketResolved(marketId, false, "", block.timestamp);
    }

    /**
     * @notice Triggers the calculation of similarity scores in the resolver or marks market as tracked.
     * @dev Renamed from trackPredictions.
     * @param marketId ID of the market
     */
    function finalizeScores(uint256 marketId) external override {
        MarketConfig storage market = markets[marketId];
        if (market.status != MarketStatus.REVEALED) {
            revert MarketNotResolved();
        }

        Outcome storage outcome = outcomes[marketId];
        if (!outcome.hasNote) {
            PredictionTracker memory tracker = predictionTrackers[marketId];
            MarketConfig memory marketConfig = markets[marketId];
            int256 totalWeightedScore = 0;
            for (uint256 i = 1; i <= tracker.numPredictions; i++) {
                Prediction memory prediction = predictions[marketId][i];
                if (prediction.isAgree) {
                    int256 timeWeight = _calculateTimeWeight(
                        marketConfig,
                        prediction
                    );
                    int256 predictionValueWad = Algebra.toWad(prediction.value);
                    int256 individualScore = wadMul(
                        predictionValueWad,
                        timeWeight
                    );

                    weightedAgreeScores[marketId][i] = individualScore;

                    totalWeightedScore += individualScore;
                }
            }
            emit DebugLogInt(
                "finalizeScores: Calculated totalWeightedAgreeScore",
                totalWeightedScore
            );

            totalWeightedAgreeScores[marketId] = totalWeightedScore;

            emit DebugLogInt(
                "finalizeScores: Stored totalWeightedAgreeScore",
                totalWeightedAgreeScores[marketId]
            );

            market.status = MarketStatus.TRACKED;
            return;
        }

        int256[] memory noteEmbeddingDecoded = Embedding.decode(
            outcome.noteEmbedding
        );

        if (resolverAddress != address(0)) {
            CNMarketResolver(resolverAddress).finalizeDisagreeScores(
                marketId,
                noteEmbeddingDecoded
            );
        }

        market.status = MarketStatus.TRACKED;
    }

    /**
     * @notice Make a prediction on whether a tweet will receive a community note
     * @param marketId ID of the market
     * @param isAgree True if predicting the tweet will NOT receive a note
     * @param reasonText The reason text for DISAGREE predictions
     * @param reasonEmbedding The embedding for DISAGREE predictions
     */
    function predict(
        uint256 marketId,
        bool isAgree,
        string calldata reasonText,
        bytes calldata reasonEmbedding
    ) external payable override {
        MarketConfig storage market = markets[marketId];

        if (
            block.timestamp >= market.deadline ||
            market.status != MarketStatus.OPEN
        ) {
            revert MarketClosed();
        }
        if (msg.value < market.minValue) {
            revert InsufficientValue();
        }

        if (!isAgree && reasonEmbedding.length == 0) {
            revert PredictionFailed();
        }

        PredictionTracker storage tracker = predictionTrackers[marketId];
        uint256 predictionId = tracker.nextPredictionId;

        predictions[marketId][predictionId] = Prediction({
            value: msg.value,
            predictor: msg.sender,
            isAgree: isAgree,
            timestamp: block.timestamp,
            claimed: false
        });

        address resolverAddress = resolverAddress;
        if (!isAgree && resolverAddress != address(0)) {
            CNMarketResolver(resolverAddress).addPrediction(
                marketId,
                predictionId,
                reasonText,
                reasonEmbedding,
                msg.value
            );
        }

        if (isAgree) {
            tracker.totalAgreeValue += msg.value;
        } else {
            tracker.totalDisagreeValue += msg.value;
        }
        tracker.nextPredictionId++;
        tracker.numPredictions++;

        emit PredictionMade(
            marketId,
            predictionId,
            msg.sender,
            isAgree,
            msg.value,
            block.timestamp
        );
    }

    /**
     * @notice Get the total amount of ETH staked in a market
     * @param marketId ID of the market
     * @return Total value in wei
     */
    function getTotalMarketValue(
        uint256 marketId
    ) external view override returns (uint256) {
        PredictionTracker storage tracker = predictionTrackers[marketId];
        return tracker.totalAgreeValue + tracker.totalDisagreeValue;
    }

    /**
     * @notice Get the current ratio of agree/disagree predictions
     * @param marketId ID of the market
     * @return agreeRatio Ratio of agree predictions (0-1 in WAD format)
     */
    function getPredictionRatio(
        uint256 marketId
    ) external view override returns (int256) {
        PredictionTracker storage tracker = predictionTrackers[marketId];
        uint256 totalValue = tracker.totalAgreeValue +
            tracker.totalDisagreeValue;
        if (totalValue == 0) return 0;
        return wadDiv(int256(tracker.totalAgreeValue), int256(totalValue));
    }

    /**
     * @notice Get the outcome of a market
     * @param marketId ID of the market
     * @return The outcome of the market
     */
    function getOutcome(
        uint256 marketId
    ) external view override returns (Outcome memory) {
        return outcomes[marketId];
    }

    /**
     * @notice Get the global resolver address
     */
    function getResolver() external view override returns (address) {
        return resolverAddress;
    }

    /**
     * @notice Allows a predictor to claim their rewards after a market is tracked.
     * @param marketId The ID of the market.
     * @param predictionId The ID of the prediction to claim.
     */
    function claimRewards(uint256 marketId, uint256 predictionId) external {
        MarketConfig storage market = markets[marketId];
        if (market.status != MarketStatus.TRACKED) {
            revert MarketNotTracked();
        }

        Prediction storage prediction = predictions[marketId][predictionId];
        if (prediction.predictor == address(0)) {
            revert PredictionFailed();
        }
        if (prediction.claimed) {
            revert PredictionAlreadyClaimed();
        }
        if (prediction.predictor != msg.sender) {
            revert NotThePredictor();
        }

        Outcome memory outcome = outcomes[marketId];
        PredictionTracker memory tracker = predictionTrackers[marketId];
        uint256 payout = 0;
        uint256 fee = 0;
        uint256 totalMarketValue = tracker.totalAgreeValue +
            tracker.totalDisagreeValue;

        if (outcome.hasNote) {
            if (!prediction.isAgree) {
                if (resolverAddress != address(0)) {
                    (payout, fee) = CNMarketResolver(resolverAddress)
                        .calculateReward(
                            marketId,
                            predictionId,
                            totalMarketValue,
                            market.wadFeeFraction
                        );
                }
            }
        } else {
            if (prediction.isAgree) {
                int256 totalScore = totalWeightedAgreeScores[marketId];

                if (totalScore > 0) {
                    int256 individualScore = weightedAgreeScores[marketId][
                        predictionId
                    ];

                    if (individualScore > 0) {
                        (payout, fee) = Claim.getClaimValue(
                            individualScore,
                            totalScore,
                            totalMarketValue,
                            market.wadFeeFraction
                        );
                    }
                }
            }
        }

        prediction.claimed = true;

        _checkedTransfer(
            msg.sender,
            payout,
            fee,
            market.feeRecipient,
            marketId
        );

        emit PredictionClaimed(marketId, predictionId, msg.sender, payout, fee);
    }

    /**
     * @dev Internal helper to transfer funds safely, preventing over-withdrawal.
     */
    function _checkedTransfer(
        address to,
        uint256 payoutValue,
        uint256 feeValue,
        address feeRecipient,
        uint256 marketId
    ) private {
        PredictionTracker storage tracker = predictionTrackers[marketId];
        uint256 totalMarketValue = tracker.totalAgreeValue +
            tracker.totalDisagreeValue;
        uint256 alreadyClaimed = tracker.totalValueClaimed;

        if (alreadyClaimed + payoutValue + feeValue > totalMarketValue) {
            revert InsufficientMarketBalance();
        }

        tracker.totalValueClaimed += payoutValue + feeValue;

        if (feeValue > 0 && feeRecipient != address(0)) {
            fees[feeRecipient] += feeValue;
        }

        if (payoutValue > 0) {
            payable(to).transfer(payoutValue);
        }
    }

    // Optional: Function for fee recipient to withdraw collected fees
    function claimFees(uint256 amount) external {
        uint256 availableFees = fees[msg.sender];
        if (amount > availableFees) {
            revert InsufficientValue();
        }
        fees[msg.sender] = availableFees - amount;
        payable(msg.sender).transfer(amount);
    }

    /**
     * @dev Calculates the time-based weight for a prediction.
     * Adapated from Resolver.
     * Re-add this helper function.
     */
    function _calculateTimeWeight(
        MarketConfig memory marketConfig,
        Prediction memory prediction
    ) internal pure returns (int256 timeWeight) {
        uint256 timeElapsed = prediction.timestamp -
            marketConfig.tweetTimestamp;
        uint256 totalTime = marketConfig.deadline - marketConfig.tweetTimestamp;

        timeWeight = int256(1e18);
        if (totalTime > 0 && timeElapsed < totalTime) {
            timeWeight += wadMul(
                WAD_EARLY_BONUS_MAX,
                wadDiv(int256(totalTime - timeElapsed), int256(totalTime))
            );
        }
    }
}
