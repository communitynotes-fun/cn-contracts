// SPDX-License-Identifier: All Rights Reserved
pragma solidity ^0.8.4;

import {JSONParserLib} from "solady/src/utils/JSONParserLib.sol";
import {LibString} from "solady/src/utils/LibString.sol";

library LibCSV {
    error InvalidCharacter();

    function parseCSV(
        string memory inputString,
        uint256 embeddingDim
    ) internal pure returns (int256[] memory) {
        bytes memory input = bytes(inputString);

        uint256 embeddingIndex = 0;
        int256[] memory embedding = new int256[](embeddingDim);

        bool isNegative = false;
        for (uint256 i = 0; i < input.length; i++) {
            bytes1 character = input[i];
            if (_isSeparator(character)) {
                continue;
            }
            if (character == "-") {
                // Skip negative sign & 0, and parse int
                isNegative = true;
                i += 2;
                continue;
            }
            if (
                character == "0" &&
                (i + 1 < input.length) &&
                input[i + 1] == "."
            ) {
                isNegative = false;
                i += 1;
                continue;
            }
            if (character == ".") {
                isNegative = false;
                continue;
            }

            if (character < "0" || character > "9") {
                revert InvalidCharacter();
            }

            // Loop forward to find end of the number
            uint256 j = i;
            while (j < input.length && !_isSeparator(input[j])) {
                j++;
            }
            string memory numberString = LibString.slice(inputString, i, j);

            int256 number = int256(JSONParserLib.parseUint(numberString));
            if (isNegative) {
                number = -number;
            }
            uint256 shift = j - i;

            if (shift <= 18) {
                number *= int256(10 ** (18 - shift));
            } else {
                number /= int256(10 ** (shift - 18));
            }

            embedding[embeddingIndex] = number;
            embeddingIndex++;
            i = j;
        }

        return embedding;
    }

    function _isSeparator(bytes1 input) internal pure returns (bool) {
        return
            input == 0x20 ||
            input == 0x09 ||
            input == 0x0A ||
            input == 0x0D ||
            input == "," ||
            input == "\\" ||
            input == "n";
    }
}
