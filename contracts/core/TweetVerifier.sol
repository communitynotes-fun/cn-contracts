// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {ITweetVerifier} from "../interfaces/ITweetVerifier.sol";
import {JSONParserLib} from "solady/src/utils/JSONParserLib.sol";
import {LibString} from "solady/src/utils/LibString.sol";

import "@reclaimprotocol/verifier-solidity-sdk/contracts/Reclaim.sol";

/**
 * @title TweetVerifier
 * @dev Contract for verifying tweet data
 */
contract TweetVerifier is ITweetVerifier {
    // Constants
    bytes32 public constant TWITTER_API_KEY = keccak256("TWITTER_API_KEY");
    bytes32 public constant TWITTER_API_SECRET =
        keccak256("TWITTER_API_SECRET");
    bytes32 public constant TWITTER_ACCESS_TOKEN =
        keccak256("TWITTER_ACCESS_TOKEN");
    bytes32 public constant TWITTER_ACCESS_SECRET =
        keccak256("TWITTER_ACCESS_SECRET");

    // State variables
    address public owner;
    mapping(bytes32 => string) public apiKeys;
    mapping(string => bool) public verifiedTweets;
    mapping(string => bool) public verifiedNotes;

    // Events
    event TweetVerified(string tweetId, bool hasNote);
    event ApiKeyUpdated(bytes32 indexed keyType, string key);

    // Errors
    error Unauthorized();
    error InvalidTweetId();
    error VerificationFailed();
    error InvalidProof();

    Reclaim public immutable reclaim;

    constructor(Reclaim _reclaim) {
        owner = msg.sender;
        reclaim = _reclaim;
    }

    // Modifier to restrict access to owner
    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert Unauthorized();
        }
        _;
    }

    /**
     * @notice Verify if a tweet has a community note using Reclaim proof.
     * @param tweetId The ID of the tweet to verify.
     * @param hasNote Whether the tweet has a community note.
     * @param noteProof The Reclaim proof struct.
     * @return True if the verification passes.
     */
    function verify(
        string calldata tweetId,
        bool hasNote,
        Reclaim.Proof memory noteProof
    ) external view override returns (bool) {
        // 1. Verify the proof itself
        reclaim.verifyProof(noteProof);

        // 2. TODO: Implement logic to validate proof parameters specific to tweet notes
        //    - Check provider, parameters (tweetId), context (note presence)
        //    - Compare extracted note status with `hasNote`

        // Placeholder: return true if proof is valid
        return true;
    }

    /**
     * @notice Mark a tweet as verified
     * @param tweetId The ID of the tweet to mark as verified
     * @param hasNote Whether the tweet has a community note
     */
    function markTweetAsVerified(
        string calldata tweetId,
        bool hasNote
    ) external onlyOwner {
        verifiedTweets[tweetId] = true;
        if (hasNote) {
            verifiedNotes[tweetId] = true;
        }
        emit TweetVerified(tweetId, hasNote);
    }
}
