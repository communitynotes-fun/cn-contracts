// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

library Embedding {
    // Encode embedding as compact bytes to save gas
    function encode(
        int256[] memory wadEmbedding
    ) internal pure returns (bytes memory) {
        bytes memory data = new bytes(0);
        for (uint256 i = 0; i < wadEmbedding.length; i++) {
            data = bytes.concat(
                data,
                abi.encodePacked(int16(wadEmbedding[i] / 1e14))
            );
        }
        return data;
    }

    // Decode embedding from standard ABI encoded bytes
    function decode(bytes memory data) internal pure returns (int256[] memory) {
        // Use standard abi.decode for int256[]
        return abi.decode(data, (int256[]));
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
