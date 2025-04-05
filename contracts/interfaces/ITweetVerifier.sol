// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {Reclaim} from "@reclaimprotocol/verifier-solidity-sdk/contracts/Reclaim.sol";

/**
 * @title ITweetVerifier
 * @dev Interface for verifying tweet data
 */
interface ITweetVerifier {
    /**
     * @notice Verify if a tweet has a community note using Reclaim proof.
     * @param reclaimProof The raw proof bytes.
     * @return noteText The extracted note text.
     * @return noteId The extracted note ID.
     * @return url The extracted URL.
     */
    function verify(
        Reclaim.Proof memory reclaimProof // Takes raw proof bytes // Returns multiple strings
    )
        external
        view
        returns (
            string memory noteText,
            string memory noteId,
            string memory url
        );
}
