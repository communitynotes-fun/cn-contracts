// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@reclaimprotocol/verifier-solidity-sdk/contracts/Reclaim.sol";

interface IEmbeddingVerifier {
    /**
     * @notice Verifies Reclaim proof for embedding and decodes provided bytes.
     * @param text The original text input (used for validation).
     * @param encodedEmbedding The compact byte representation of the embedding.
     * @param embeddingProof The Reclaim proof struct.
     * @return embedding The decoded embedding as an int256 array (WAD format).
     */
    function verify(
        string memory text,
        bytes memory encodedEmbedding,
        Reclaim.Proof memory embeddingProof
    ) external view returns (int256[] memory embedding);

    function getEmbeddingDim() external view returns (uint256);
}
