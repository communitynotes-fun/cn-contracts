// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@reclaimprotocol/verifier-solidity-sdk/contracts/Reclaim.sol"; // Import Reclaim

/**
 * @title ITweetVerifier
 * @dev Interface for verifying tweet data
 */
interface ITweetVerifier {
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
        Reclaim.Proof memory noteProof // Changed type
    ) external view returns (bool);
}
