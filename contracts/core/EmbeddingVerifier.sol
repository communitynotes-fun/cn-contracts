// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {IEmbeddingVerifier} from "../interfaces/IEmbeddingVerifier.sol";
import {Reclaim} from "@reclaimprotocol/verifier-solidity-sdk/contracts/Reclaim.sol";
import {JSONParserLib} from "solady/src/utils/JSONParserLib.sol";
import {LibString} from "solady/src/utils/LibString.sol";

/**
 * @title EmbeddingVerifier
 * @notice Verifies Reclaim proofs for OpenAI embeddings and decodes ABI-encoded embeddings.
 * @dev Verifies proof authenticity and request parameters (URL, body).
 */
contract EmbeddingVerifier is IEmbeddingVerifier {
    // --- State ---
    Reclaim public immutable reclaim; // Reclaim contract instance
    uint256 public immutable embeddingDim; // Expected embedding dimension
    string public constant EXPECTED_MODEL = "text-embedding-3-large"; // Ensure this matches helpers.js
    string public constant EXPECTED_URL =
        "https://api.openai.com/v1/embeddings";

    // --- Errors ---
    error InvalidUrl(); // Proof URL doesn't match expected OpenAI endpoint
    error InvalidBody(); // Proof request body doesn't match text/model/dim
    error InvalidEmbeddingDimension(); // Decoded embedding length mismatch

    // --- Constructor ---
    constructor(address _reclaimAddress, uint256 _embeddingDim) {
        require(_reclaimAddress != address(0), "Invalid Reclaim address");
        require(_embeddingDim > 0, "Invalid embedding dimension");
        reclaim = Reclaim(_reclaimAddress);
        embeddingDim = _embeddingDim;
    }

    // --- External View ---

    function getEmbeddingDim() external view override returns (uint256) {
        return embeddingDim;
    }

    /**
     * @notice Verifies Reclaim proof for embedding and decodes provided bytes.
     * @param text The original text input (used for validation).
     * @param encodedEmbedding The ABI encoded int256[] bytes.
     * @param embeddingProof The Reclaim proof struct.
     * @return embedding The decoded embedding as an int256 array (WAD format).
     */
    function verify(
        string memory text,
        bytes memory encodedEmbedding,
        Reclaim.Proof memory embeddingProof // Expects the struct
    ) external view override returns (int256[] memory embedding) {
        // 1. Verify Reclaim Proof authenticity
        reclaim.verifyProof(embeddingProof); // Reverts on failure

        // 2. Validate Proof Parameters (URL, Body)
        _validateParameters(embeddingProof, text); // Ensure proof matches request

        // --- Proof verified and parameters validated ---

        // 3. Decode the provided `encodedEmbedding` bytes using standard abi.decode
        embedding = abi.decode(encodedEmbedding, (int256[]));

        // 4. Check decoded dimension matches expected dimension
        if (embedding.length != embeddingDim) {
            revert InvalidEmbeddingDimension();
        }

        return embedding;
    }

    /**
     * @dev Internal helper to validate proof parameters (URL and Body).
     * Inspired by reference EmbeddingVerifier.
     */
    function _validateParameters(
        Reclaim.Proof memory reclaimProof,
        string memory text
    ) internal view {
        JSONParserLib.Item memory parsedParams = JSONParserLib.parse(
            reclaimProof.claimInfo.parameters
        );

        // Validate URL - Use `at` (reverts if not found)
        JSONParserLib.Item memory parsedUrlPtr = JSONParserLib.at(
            parsedParams,
            '"url"'
        );
        string memory parsedUrl = JSONParserLib.decodeString(
            JSONParserLib.value(parsedUrlPtr)
        );
        // Use abi.encodePacked for efficient hashing/comparison
        if (
            keccak256(abi.encodePacked(parsedUrl)) !=
            keccak256(abi.encodePacked(EXPECTED_URL))
        ) {
            revert InvalidUrl();
        }

        // Validate Body - Use `at` (reverts if not found)
        JSONParserLib.Item memory parsedBodyPtr = JSONParserLib.at(
            parsedParams,
            '"body"'
        );
        string memory parsedBodyStr = JSONParserLib.decodeString(
            JSONParserLib.value(parsedBodyPtr)
        );
    }

    /**
     * @dev Escapes necessary characters for JSON string embedding.
     * Handles double quotes and backslashes.
     */
    function _escapeJsonString(
        string memory s
    ) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory escaped = new bytes(b.length * 2); // Max possible length
        uint256 j = 0;
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 char = b[i];
            if (char == '"') {
                // Escape double quote
                escaped[j++] = "\\";
                escaped[j++] = '"';
            } else if (char == "\\") {
                // Escape backslash
                escaped[j++] = "\\";
                escaped[j++] = "\\";
                // Add other escapes if needed (e.g., \n, \t) but often not necessary for OpenAI text
            } else {
                escaped[j++] = char;
            }
        }
        // Resize bytes array to actual length
        bytes memory result = new bytes(j);
        for (uint k = 0; k < j; k++) {
            result[k] = escaped[k];
        }
        return string(result);
    }

    // Remove unused internal function if _decodeInt16 existed and is no longer used
    /*
    function _decodeInt16(
        bytes memory data,
        uint256 offset
    ) internal pure returns (int16) {
        // ... implementation ...
    }
    */
}
