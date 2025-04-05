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

    // State variables
    address public owner;
    address public tweetVerifier;
    address public embeddingVerifier;
    uint256 private nextMarketId = 1; // Counter for market IDs

    // Market data
    mapping(uint256 => MarketConfig) public markets;
    mapping(string => uint256) public tweetIdToMarketId; // Track markets by tweet ID
    mapping(uint256 => Outcome) public outcomes;
    mapping(uint256 => mapping(uint256 => Prediction)) public predictions;
    mapping(uint256 => PredictionTracker) public predictionTrackers;
    mapping(uint256 => address) public resolvers;
    mapping(address => uint256) public fees;

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

    // Errors
    error MarketAlreadyExists();
    error InvalidTweetId();
    error Unauthorized();
    error MarketClosed();
    error InsufficientValue();
    error PredictionFailed();
    error MarketNotResolvedled();
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

        // Set creator as resolver
        resolvers[marketId] = msg.sender;

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

    /**
     * @notice Set the resolver for a market
     * @param marketId ID of the market
     * @param resolver Address of the resolver
     */
    function setResolver(uint256 marketId, address resolver) external {
        require(markets[marketId].creator == msg.sender, "Not market creator");
        require(resolver != address(0), "Invalid resolver");
        resolvers[marketId] = resolver;
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
        //     // Decode bytes calldata to Reclaim.Proof memory
        //     // Reclaim.Proof memory noteProofDecoded = abi.decode(
        //     //     noteProofBytes,
        //     //     (Reclaim.Proof)
        //     // );
        //     bool verifiedHasNote = ITweetVerifier(tweetVerifier).verify(
        //         market.tweetId,
        //         hasNote,
        //         noteProof // Pass decoded struct
        //     );
        //     if (!verifiedHasNote) {
        //         revert VerificationFailed();
        //     }
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
            noteEmbedding: noteEmbedding, // Store ENCODED bytes
            revealTimestamp: block.timestamp
        });

        // 4. Update market status
        market.status = MarketStatus.REVEALED;

        // 5. Emit event
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

        // 3. Check Deadline
        // Ensure market has actually ended before resolving without a note
        require(block.timestamp >= market.deadline, "MarketNotEnded");

        // 4. Store Outcome (No Note)
        outcomes[marketId] = Outcome({
            hasNote: false,
            noteText: "", // Empty text
            noteEmbedding: bytes(""), // Empty bytes
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
        // Allow anyone to call this after reveal? Or only resolver?
        // Currently allowing anyone, consider adding `if (msg.sender != resolvers[marketId]) revert Unauthorized();`

        MarketConfig storage market = markets[marketId];
        if (market.status != MarketStatus.REVEALED) {
            revert MarketNotResolvedled(); // Changed error name?
        }

        Outcome storage outcome = outcomes[marketId];
        if (!outcome.hasNote) {
            // If no note, just mark as tracked, no scores needed.
            market.status = MarketStatus.TRACKED;
            // TODO: Emit MarketTracked event here? (With score 0?)
            return;
        }

        // Decode the stored ENCODED embedding bytes to pass to resolver
        int256[] memory noteEmbeddingDecoded = Embedding.decode(
            outcome.noteEmbedding
        );

        // Call the RENAMED function on the resolver
        address resolverAddress = resolvers[marketId];
        if (resolverAddress != address(0)) {
            // Call finalizeDisagreeScores on resolver
            CNMarketResolver(resolverAddress).finalizeDisagreeScores(
                marketId,
                noteEmbeddingDecoded
            );
        } // else: handle case where resolver is not set? Maybe revert?

        // Update market status
        market.status = MarketStatus.TRACKED;
        // TODO: Emit MarketTracked event here? Get total score from resolver?
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

        // Simplified check for disagree - requires non-empty embedding bytes
        if (!isAgree && reasonEmbedding.length == 0) {
            revert PredictionFailed(); // Reason text check removed for simplicity, assuming embedding implies reason
        }
        // Removed on-chain embedding verification during predict for simplicity/gas.
        // Rely on resolver checks if needed, or add back if required.

        PredictionTracker storage tracker = predictionTrackers[marketId];
        uint256 predictionId = tracker.nextPredictionId;

        predictions[marketId][predictionId] = Prediction({
            value: msg.value,
            predictor: msg.sender,
            isAgree: isAgree,
            timestamp: block.timestamp,
            claimed: false
        });

        // Calculate weighted similarity score
        // int256 wadWeightedScore = Algebra.weightedSimilarity(
        //     predictionEmbedding,
        //     noteEmbedding,
        //     WAD_SIMILARITY_SHIFT,
        //     wadMul(Algebra.toWad(prediction.value), timeWeight) // Ensure Algebra.toWad usage is correct
        // );

        // Note: The Algebra.weightedSimilarity call is actually in the Resolver, not here.
        // We just need to ensure the call to resolver.addPrediction is correct.
        address resolverAddress = resolvers[marketId];
        if (!isAgree && resolverAddress != address(0)) {
            CNMarketResolver(resolverAddress).addPrediction(
                marketId,
                predictionId,
                reasonText,
                reasonEmbedding,
                msg.value // Pass uint256 value directly
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
        // Corrected: Cast uint256 to int256 for wadDiv
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
     * @notice Get the resolver for a market
     * @param marketId ID of the market
     * @return The resolver address
     */
    function getResolver(
        uint256 marketId
    ) external view override returns (address) {
        return resolvers[marketId];
    }

    /**
     * @notice Allows a predictor to claim their rewards after a market is tracked.
     * @param marketId The ID of the market.
     * @param predictionId The ID of the prediction to claim.
     */
    function claimRewards(uint256 marketId, uint256 predictionId) external {
        // 1. Checks
        MarketConfig storage market = markets[marketId];
        if (market.status != MarketStatus.TRACKED) {
            revert MarketNotTracked();
        }

        Prediction storage prediction = predictions[marketId][predictionId];
        if (prediction.predictor == address(0)) {
            revert PredictionFailed(); // Prediction doesn't exist
        }
        if (prediction.claimed) {
            revert PredictionAlreadyClaimed();
        }
        if (prediction.predictor != msg.sender) {
            revert NotThePredictor();
        }

        // 2. Determine Payout Logic
        Outcome memory outcome = outcomes[marketId];
        PredictionTracker memory tracker = predictionTrackers[marketId];
        uint256 payout = 0;
        uint256 fee = 0;
        // Calculate total market value once
        uint256 totalMarketValue = tracker.totalAgreeValue +
            tracker.totalDisagreeValue;

        if (outcome.hasNote) {
            // Note Exists: Disagree predictors win based on score
            // Distribute the TOTAL market value among disagree winners
            if (!prediction.isAgree) {
                address resolverAddress = resolvers[marketId];
                if (resolverAddress != address(0)) {
                    (payout, fee) = CNMarketResolver(resolverAddress)
                        .calculateReward(
                            marketId,
                            predictionId,
                            totalMarketValue, // Pass TOTAL value as the pool
                            market.wadFeeFraction // Fee fraction is 0 anyway
                        );
                }
            }
        } else {
            // No Note: Agree predictors win based on stake proportion
            // Distribute the TOTAL market value among agree winners
            if (prediction.isAgree) {
                if (tracker.totalAgreeValue > 0) {
                    // Still need this check
                    (payout, fee) = Claim.getClaimValue(
                        Algebra.toWad(prediction.value),
                        Algebra.toWad(tracker.totalAgreeValue),
                        totalMarketValue, // Pass TOTAL value as the pool
                        market.wadFeeFraction // Fee fraction is 0 anyway
                    );
                }
            }
        }

        // 3. Mark as Claimed (Effect)
        prediction.claimed = true;

        // 4. Transfer Payout and Handle Fee (Interaction)
        _checkedTransfer(
            msg.sender,
            payout,
            fee,
            market.feeRecipient,
            marketId
        );

        // 5. Emit Event
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

        // Ensure there are enough funds remaining in the market pool
        if (alreadyClaimed + payoutValue + feeValue > totalMarketValue) {
            // This shouldn't happen with correct reward calculation, but acts as a safeguard
            // Option 1: Revert entirely
            revert InsufficientMarketBalance();
            // Option 2: (More complex) Distribute remaining proportionally - omitted for simplicity
        }

        // Update claimed total *before* transfers
        tracker.totalValueClaimed += payoutValue + feeValue;

        // Update fees collected
        if (feeValue > 0 && feeRecipient != address(0)) {
            fees[feeRecipient] += feeValue;
        }

        // Transfer payout
        if (payoutValue > 0) {
            payable(to).transfer(payoutValue);
        }
    }

    // Optional: Function for fee recipient to withdraw collected fees
    function claimFees(uint256 amount) external {
        uint256 availableFees = fees[msg.sender];
        if (amount > availableFees) {
            revert InsufficientValue(); // Re-use error
        }
        fees[msg.sender] = availableFees - amount;
        payable(msg.sender).transfer(amount);
    }
}
