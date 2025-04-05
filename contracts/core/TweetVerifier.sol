// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {ITweetVerifier} from "../interfaces/ITweetVerifier.sol";
import {Reclaim} from "@reclaimprotocol/verifier-solidity-sdk/contracts/Reclaim.sol";
import {JSONParserLib} from "solady/src/utils/JSONParserLib.sol";

/**
 * @title TweetVerifier
 * @dev Contract for verifying tweet data
 */
contract TweetVerifier is ITweetVerifier {
    address reclaimAddress;

    error InvalidParams();

    constructor(address _reclaim) {
        reclaimAddress = _reclaim;
    }

    function verify(
        Reclaim.Proof memory reclaimProof
    )
        external
        view
        override
        returns (
            string memory noteText,
            string memory noteId,
            string memory url
        )
    {
        // Reclaim.Proof memory reclaimProof = abi.decode(proof, (Reclaim.Proof));
        Reclaim(reclaimAddress).verifyProof(reclaimProof);

        // // Extract context
        // JSONParserLib.Item memory parsedContext = JSONParserLib.parse(
        //     reclaimProof.claimInfo.context
        // );
        // JSONParserLib.Item memory extractedParams = JSONParserLib.at(
        //     parsedContext,
        //     '"extractedParameters"'
        // );

        // JSONParserLib.Item memory noteTextPtr = JSONParserLib.at(
        //     extractedParams,
        //     '"noteText"'
        // );
        // noteText = JSONParserLib.decodeString(JSONParserLib.value(noteTextPtr));

        // JSONParserLib.Item memory noteIdPtr = JSONParserLib.at(
        //     extractedParams,
        //     '"noteId"'
        // );
        // noteId = JSONParserLib.decodeString(JSONParserLib.value(noteIdPtr));

        // JSONParserLib.Item memory parsedParams = JSONParserLib.parse(
        //     reclaimProof.claimInfo.parameters
        // );

        // JSONParserLib.Item memory urlPtr = JSONParserLib.at(
        //     parsedParams,
        //     '"url"'
        // );
        // url = JSONParserLib.decodeString(JSONParserLib.value(urlPtr));

        // // return the noteText, noteId, and url
        // return (noteText, noteId, url);
        return ("", "", "");
    }
}
