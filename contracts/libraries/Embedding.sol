// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

library Embedding {
    // Encode embedding as compact bytes to save gas
    function encode(
        int256[] memory wadEmbedding
    ) internal pure returns (bytes memory) {
        uint256 dim = wadEmbedding.length;
        bytes memory encoded = new bytes(dim * 2);
        int256 scaleFactor = 3e13;
        uint256 k = 0;
        for (uint256 i = 0; i < dim; i++) {
            int256 wadValue = wadEmbedding[i];
            int16 int16Value = int16(int256(wadValue / scaleFactor));
            if (wadValue / scaleFactor > 32767) int16Value = 32767;
            if (wadValue / scaleFactor < -32768) int16Value = -32768;

            encoded[k++] = bytes1(uint8(uint16(int16Value) >> 8));
            encoded[k++] = bytes1(uint8(uint16(int16Value)));
        }
        return encoded;
    }

    // Decode embedding from compact bytes format
    function decode(
        bytes memory data
    ) internal pure returns (int256[] memory embedding) {
        require(data.length % 2 == 0, "Invalid encoding length");
        uint256 dim = data.length / 2;
        embedding = new int256[](dim);
        int256 scaleFactor = 3e13;

        for (uint256 i = 0; i < dim; i++) {
            uint256 offset = i * 2;
            bytes2 b2 = (bytes2(data[offset]) << 8) | bytes2(data[offset + 1]);
            int16 int16Value = int16(uint16(b2));
            embedding[i] = int16Value * scaleFactor;
        }
        return embedding;
    }

    // Bytes slicing utility
    function slice(
        bytes memory _bytes,
        uint256 _start,
        uint256 _length
    ) internal pure returns (bytes memory) {
        require(_length + 31 >= _length, "slice_overflow");
        require(_bytes.length >= _start + _length, "slice_outOfBounds");

        bytes memory tempBytes;

        assembly {
            switch iszero(_length)
            case 0 {
                tempBytes := mload(0x40)
                let lengthmod := and(_length, 31)
                let mc := add(
                    add(tempBytes, lengthmod),
                    mul(0x20, iszero(lengthmod))
                )
                let end := add(mc, _length)

                for {
                    let cc := add(
                        add(
                            add(_bytes, lengthmod),
                            mul(0x20, iszero(lengthmod))
                        ),
                        _start
                    )
                } lt(mc, end) {
                    mc := add(mc, 0x20)
                    cc := add(cc, 0x20)
                } {
                    mstore(mc, mload(cc))
                }

                mstore(tempBytes, _length)
                mstore(0x40, and(add(mc, 31), not(31)))
            }
            default {
                tempBytes := mload(0x40)
                mstore(tempBytes, 0)
                mstore(0x40, add(tempBytes, 0x20))
            }
        }

        return tempBytes;
    }
}
