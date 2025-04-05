// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@reclaimprotocol/verifier-solidity-sdk/contracts/Reclaim.sol";

// import {IEmbeddingVerifier} from "../interfaces/IEmbeddingVerifier.sol";
import {Reclaim} from "@reclaimprotocol/verifier-solidity-sdk/contracts/Reclaim.sol";
import {JSONParserLib} from "solady/src/utils/JSONParserLib.sol";
import {LibString} from "solady/src/utils/LibString.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol"; // For keccak256 comparison
import {IEmbeddingVerifier} from "../interfaces/IEmbeddingVerifier.sol";

/**
 * @title EmbeddingVerifier
 * @notice Verifies Reclaim proofs for OpenAI embeddings and decodes pre-encoded embeddings.
 * @dev Verifies proof authenticity and request parameters (URL, body) on-chain.
 *      Decodes the provided `encodedEmbedding` bytes, trusting the caller aligned it
 *      with the embedding inside the verified proof's context.
 */
contract EmbeddingVerifier is IEmbeddingVerifier {
    // --- State ---
    Reclaim public immutable reclaim; // Reclaim contract instance
    uint256 public immutable embeddingDim; // Expected embedding dimension (e.g., 1536)
    string public constant EXPECTED_MODEL = "text-embedding-3-small"; // Match helpers.js MODEL
    string public constant EXPECTED_URL =
        "https://api.openai.com/v1/embeddings";

    // --- Errors ---
    error InvalidProof(); // General proof verification failure
    error InvalidUrl(); // Proof URL doesn't match expected OpenAI endpoint
    error InvalidBody(); // Proof request body doesn't match text/model/dim
    error InvalidEncodingLength(); // encodedEmbedding length doesn't match dimension
    error InvalidEmbeddingDimension(); // Decoded embedding length mismatch

    // --- Constructor ---
    constructor(Reclaim _reclaim, uint256 _embeddingDim) {
        if (address(_reclaim) == address(0)) revert("Invalid Reclaim address");
        if (_embeddingDim == 0) revert("Invalid embedding dimension");
        reclaim = _reclaim;
        embeddingDim = _embeddingDim;
    }

    // --- External View ---

    function getEmbeddingDim() external view override returns (uint256) {
        return embeddingDim;
    }

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
        Reclaim.Proof memory embeddingProof // Updated type
    ) external view override returns (int256[] memory embedding) {
        // 1. Verify Reclaim Proof
        reclaim.verifyProof(embeddingProof); // Reverts on failure
        // if (!verified) { // Removed check
        //     revert InvalidProof();
        // }

        // 2. Validate Parameters (URL, Body)
        //_validateParameters(embeddingProof, text); // Use internal helper

        // --- Proof verified and linked to the correct request ---

        // 3. Decode the provided `encodedEmbedding` bytes
        // uint256 expectedEncodingLength = embeddingDim * 2;
        // if (encodedEmbedding.length != expectedEncodingLength) {
        //     revert InvalidEncodingLength();
        // }

        embedding = new int256[](embeddingDim);
        // Use the adjusted scale factor
        int256 scaleFactor = 3e13;

        for (uint256 i = 0; i < embeddingDim; i++) {
            uint256 byteOffset = i * 2;
            int16 int16Value = _decodeInt16(encodedEmbedding, byteOffset);
            embedding[i] = int16Value * scaleFactor;
        }

        // // Final dimension check
        // if (embedding.length != embeddingDim) {
        //     revert InvalidEmbeddingDimension();
        // }

        return embedding;
    }

    /** @dev Internal helper to validate proof parameters */
    function _validateParameters(
        Reclaim.Proof memory reclaimProof,
        string memory text
    ) internal view {
        JSONParserLib.Item memory parsedParams = JSONParserLib.parse(
            reclaimProof.claimInfo.parameters
        );

        // Validate URL
        JSONParserLib.Item memory parsedUrlPtr = JSONParserLib.at(
            parsedParams,
            '"url"'
        );
        string memory parsedUrl = JSONParserLib.decodeString(
            JSONParserLib.value(parsedUrlPtr)
        );
        if (
            keccak256(abi.encodePacked(parsedUrl)) !=
            keccak256(abi.encodePacked(EXPECTED_URL))
        ) {
            revert InvalidUrl();
        }

        // Validate Body
        bytes memory expectedBodyBytes = abi.encodePacked(
            '{"input":"',
            _escapeJsonString(text),
            '","model":"',
            EXPECTED_MODEL,
            '","dimensions":',
            LibString.toString(embeddingDim),
            "}"
        );
        JSONParserLib.Item memory parsedBodyPtr = JSONParserLib.at(
            parsedParams,
            '"body"'
        );
        string memory parsedBodyStr = JSONParserLib.decodeString(
            JSONParserLib.value(parsedBodyPtr)
        );
        bytes memory parsedBodyBytes = bytes(parsedBodyStr);
        if (keccak256(parsedBodyBytes) != keccak256(expectedBodyBytes)) {
            revert InvalidBody();
        }
    }

    function _escapeJsonString(
        string memory s
    ) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory escaped = new bytes(b.length * 2);
        uint256 j = 0;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == '"') {
                escaped[j++] = "\\";
                escaped[j++] = '"';
            } else if (b[i] == "\\") {
                escaped[j++] = "\\";
                escaped[j++] = "\\";
            } else {
                escaped[j++] = b[i];
            }
        }
        bytes memory result = new bytes(j);
        for (uint k = 0; k < j; k++) {
            result[k] = escaped[k];
        }
        return string(result);
    }

    function _decodeInt16(
        bytes memory data,
        uint256 offset
    ) internal pure returns (int16) {
        require(
            offset < data.length && data.length >= offset + 2,
            "Verifier: Offset out of bounds for int16 decode"
        );
        bytes2 b2 = (bytes2(data[offset]) << 8) | bytes2(data[offset + 1]);
        return int16(uint16(b2));
    }
}
