// TEST HELPER FUNCTIONS
const { ethers } = require("hardhat");
const { AbiCoder } = require("ethers");
const OpenAI = require("openai");
const { ReclaimClient } = require("@reclaimprotocol/zk-fetch");
const Reclaim = require("@reclaimprotocol/js-sdk");

// Initialize the OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Constants matching our EmbeddingVerifier contract
const EMBEDDING_DIMENSION = 768;
const MODEL = "text-embedding-3-large";

// Reclaim Protocol credentials
const APPLICATION_ID = process.env.RECLAIM_APP_ID;
const APPLICATION_SECRET = process.env.RECLAIM_APP_SECRET;

/**
 * Fetches tweet data and generates a ZK proof for a community note using Reclaim Protocol
 * @param {string} tweetId - The ID of the tweet to fetch
 * @returns {Promise<Object>} - Object containing the proof, verification status, and extracted note data
 */
async function getZkNote(tweetId) {
  try {
    console.log(`Fetching ZK proof for tweet ${tweetId}...`);

    // Initialize the Reclaim client with application credentials
    const client = new ReclaimClient(APPLICATION_ID, APPLICATION_SECRET);

    // URL to fetch the tweet data
    const url = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=!`;

    // Generate a proof for the tweet data
    const proof = await client.zkFetch(
      url,
      {
        method: "GET",
      },
      {
        responseMatches: [
          {
            type: "regex",
            value: '"birdwatch_pivot":\\{.*?"subtitle":\\{.*?"text":"(?<noteText>[^"]*)"',
          },
          {
            type: "regex",
            value: '"birdwatch_pivot":\\{.*?"noteId":"(?<noteId>[^"]*)"',
          },
        ],
      }
    );

    console.log({ proof });

    console.log("Proof generated successfully!");
    console.log({ proof });

    // Verify the proof
    const isVerified = await Reclaim.verifyProof(proof);
    console.log("Proof verification:", isVerified ? "Successful" : "Failed");

    // Transform the proof data for on-chain use
    const proofData = Reclaim.transformForOnchain(proof);
    console.log({ proofData });

    // Extract the note text and ID from the proof
    const noteText = proof.extractedParameterValues?.noteText || "";
    const noteId = proof.extractedParameterValues?.noteId || "";

    // Check if the tweet has a community note
    const hasNote = noteText.length > 0 && noteId.length > 0;

    return {
      hasNote,
      noteText,
      noteId,
      proof,
      isVerified,
      proofData,
    };
  } catch (error) {
    console.error("Error generating ZK proof:", error);
    throw error;
  }
}

/**
 * Generates a ZK proof for an embedding of a note, extracts the embedding,
 * encodes it, and prepares proof data for on-chain verification.
 * @param {string} noteText - The text of the note to generate an embedding for
 * @returns {Promise<Object>} - Object containing encoded embedding, proof, verification status, and proofData bytes.
 */
async function getZkEmbedding(noteText) {
  try {
    console.log(`Generating ZK proof for note embedding...`);

    // Initialize the Reclaim client with application credentials
    const client = new ReclaimClient(APPLICATION_ID, APPLICATION_SECRET);

    // URL to fetch the embedding from OpenAI
    const url = "https://api.openai.com/v1/embeddings";

    // Generate a proof for the embedding (NO responseMatches)
    const proof = await client.zkFetch(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          input: noteText,
          model: MODEL,
          dimensions: EMBEDDING_DIMENSION,
          encoding_format: "float",
        }),
        responseMatches: [
          {
            type: "regex",
            value: '"data":\\[\\{.*?"embedding":\\[\\d+\\.\\d+(?:,\\d+\\.\\d+)*\\],.*?\\}\\]',
          },
        ],
      }
      // No responseMatches block - capture the whole response in context
    );

    console.log("Raw ZK proof generated successfully!");

    // Verify the proof off-chain
    const isVerified = await Reclaim.verifyProof(proof);
    console.log("Off-chain proof verification:", isVerified ? "Successful" : "Failed");

    // Extract the embedding from the proof data string by parsing it as JSON
    const responseDataStr = proof.extractedParameterValues?.data || "{}";
    let embeddingValues = [];
    try {
      const parsedData = JSON.parse(responseDataStr);
      if (parsedData.data && parsedData.data[0] && parsedData.data[0].embedding) {
        embeddingValues = parsedData.data[0].embedding;
        console.log(`Embedding extracted via JSON parse successfully (${embeddingValues.length} dimensions)`);
      } else {
        console.error("Could not find embedding in parsed proof data:", parsedData);
        // If embedding isn't found in proof, maybe fallback or throw?
        // For now, we continue, generateAndEncodeEmbedding might fail if embeddingValues is empty
      }
    } catch (parseError) {
      console.error("Error parsing proof data JSON:", parseError);
      console.error("Proof data string was:", responseDataStr);
      // Decide how to handle parse errors - maybe throw?
    }

    // Generate the encoded embedding for on-chain use using the extracted values
    const { encoded, wadEmbedding } = await generateAndEncodeEmbedding(noteText, embeddingValues);
    console.log("Encoded embedding generated for on-chain use");

    // Transform the proof data for on-chain verification
    const proofData = Reclaim.transformForOnchain(proof);
    console.log("Proof data prepared for on-chain verification.");

    // Return the necessary data
    return {
      embedding: embeddingValues, // Raw float values (for potential off-chain use)
      wadEmbedding, // WAD fixed-point values (for potential off-chain use)
      encoded, // Encoded bytes to send to the contract
      proof, // Raw proof object
      isVerified, // Off-chain verification status
      proofData, // Bytes for on-chain proof verification
    };
  } catch (error) {
    console.error("Error in getZkEmbedding process:", error);
    throw error;
  }
}

/**
 * Increases the blockchain time by the specified number of seconds
 * @param {number} seconds - Number of seconds to increase time by
 */
async function increaseTime(seconds) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine");
}

/**
 * Generates a random normalized embedding vector
 * @param {number} dimension - Dimension of the embedding vector (default: 1536)
 * @returns {Array} - Array of BigNumber values representing the embedding
 */
function generateRandomEmbedding(dimension = 1536) {
  const embedding = [];
  let sumSquares = 0;

  // Generate random values
  for (let i = 0; i < dimension; i++) {
    const value = Math.random() * 2 - 1; // Random value between -1 and 1
    embedding.push(value);
    sumSquares += value * value;
  }

  // Normalize the vector
  const magnitude = Math.sqrt(sumSquares);
  const normalizedEmbedding = embedding.map((val) => {
    // Convert to WAD format (18 decimals) and normalize
    return ethers.utils.parseUnits((val / magnitude).toFixed(18), 18);
  });

  return normalizedEmbedding;
}

async function generateEmbedding(text) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: text,
        model: "text-embedding-3-large",
        dimensions: 1536,
        encoding_format: "float",
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    console.dir(data, { depth: null });

    return {
      data, // original float values from OpenAI
    };
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw error;
  }
}

/**
 * Generate and encode an embedding for use in our smart contracts
 * @param {string} text The text to generate an embedding for
 * @param {number[]} [embedding] Optional pre-generated embedding array
 * @returns {Promise<{embedding: number[], wadEmbedding: BigInt[], encoded: Uint8Array}>} The raw embedding and encoded version for the contract
 */
async function generateAndEncodeEmbedding(text, embedding = null) {
  try {
    // If embedding is not provided, generate it from OpenAI
    if (!embedding) {
      console.log("generateAndEncodeEmbedding: Generating new embedding from OpenAI...");
      // Use the constants defined at the top of the file
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: text,
          model: MODEL, // Use constant
          dimensions: EMBEDDING_DIMENSION, // Use constant
        }),
      });
      // Check response ok before parsing
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API error: ${JSON.stringify(errorData)}`);
      }
      const res = await response.json();
      // console.dir(res, { depth: null }); // Optional debug log
      embedding = res.data[0].embedding;
      console.log("generateAndEncodeEmbedding: New embedding generated.");
    } else {
      console.log("generateAndEncodeEmbedding: Using provided embedding.");
    }

    // Verify dimension - this should now pass
    if (embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(`Expected ${EMBEDDING_DIMENSION} dimensions but got ${embedding.length}`);
    }

    // --- STANDARD WAD ABI ENCODING ---

    // Convert the floating point values to our contract's fixed-point format (WAD)
    const wadEmbedding = embedding.map((value) => {
      // Ensure the float is treated as a string for parseUnits if needed, or handle precision carefully
      // Using Math.floor might lose precision, consider a fixed-point math library if needed
      return BigInt(Math.floor(value * 1e18));
    });

    // Encode the int256[] array using standard ABI encoding
    // Instantiate AbiCoder directly
    const defaultAbiCoder = new AbiCoder();
    const encoded = defaultAbiCoder.encode(["int256[]"], [wadEmbedding]);

    // Log the WAD values and the final ABI encoded hex string
    console.log("generateAndEncodeEmbedding DEBUG: First 5 WAD values:");
    for (let i = 0; i < 5 && i < wadEmbedding.length; i++) {
      console.log(`  [${i}]: ${wadEmbedding[i]?.toString()}`);
    }
    console.log("generateAndEncodeEmbedding DEBUG: Final ABI encoded hex string:");
    // console.log(encoded);

    return {
      embedding, // original embedding from OpenAI or provided
      wadEmbedding, // WAD version for potential off-chain use
      encoded, // ABI encoded bytes version for contract
    };
    // --- END STANDARD WAD ABI ENCODING ---

    /* // Simplified float->int16 encoding commented out
    // --- SIMPLIFIED HACKATHON ENCODING --- 
    // Directly scale float [-1, 1] to int16 [-32767, 32767] range

    // Encode each value as a 2-byte int16
    const encoded = ethers.concat(
      embedding.map((floatValue, index) => { // Use original float value
        // Scale float to int16 range
        const scaledValue = floatValue * 32767.0;
        // Round to nearest integer
        const int16Value = Math.round(scaledValue);
        // Clamp to be safe (though scaling should keep it in range)
        const clampedValue = Math.max(-32768, Math.min(32767, int16Value));

        // -- DEBUG LOGGING START --
        if (index < 5) { // Log first 5
          // Log original float and the final clamped int16
          console.log(`[${index}]: float=${floatValue}, scaled=${scaledValue}, clampedInt16=${clampedValue}`);
        }
        // -- DEBUG LOGGING END --

        // Convert clamped int16 to 2 bytes (big-endian)
        const buffer = new ArrayBuffer(2);
        const view = new DataView(buffer);
        view.setInt16(0, clampedValue, false); // false for big-endian
        return new Uint8Array(buffer);
      })
    );

    // Remove WAD specific debug logs and return values
    console.log("generateAndEncodeEmbedding DEBUG: Final SIMPLIFIED encoded hex string:");
    console.log(ethers.hexlify(encoded)); // Log the final hex bytes

    return {
      embedding, // original embedding from OpenAI or provided
      // wadEmbedding: null, // No longer calculating WAD here
      encoded, // bytes version for contract
    };
    // --- END SIMPLIFIED HACKATHON ENCODING ---
    */
    /* // Original encoding logic commented out
    // ... (rest of commented out code)
    */
  } catch (error) {
    console.error("Error in generateAndEncodeEmbedding:", error);
    throw error;
  }
}

async function newGenerateAndEncodeEmbedding(text) {
  try {
    console.log(`newGenerateAndEncodeEmbedding: Generating embedding for "${text}"...`);
    // Use constants for model and desired dimension

    // fecth normally using api call
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: text,
        model: "text-embedding-3-large",
        dimensions: 768,
        encoding_format: "float",
      }),
    });
    console.log("newGenerateAndEncodeEmbedding: OpenAI response received.");

    const res = await response.json();
    console.dir(res, { depth: null });

    const embedding = res.data[0].embedding;

    console.log("Length of embedding:", embedding.length);

    // Verify dimension
    // if (embedding.length !== EMBEDDING_DIMENSION) {
    //   throw new Error(`Expected ${EMBEDDING_DIMENSION} dimensions but got ${embedding.length}`);
    // }

    // --- Simplified Encoding ---
    // Directly scale float [-1, 1] to int16 [-32767, 32767]
    const encodedBytes = ethers.concat(
      embedding.map((value) => {
        // Scale float to int16 range
        const scaledValue = value * 32767.0;
        // Round to nearest integer
        const int16Value = Math.round(scaledValue);
        // Clamp to be safe
        const clampedValue = Math.max(-32768, Math.min(32767, int16Value));

        // Convert clamped int16 to 2 bytes (big-endian)
        const buffer = new ArrayBuffer(2);
        const view = new DataView(buffer);
        view.setInt16(0, clampedValue, false); // false for big-endian
        return new Uint8Array(buffer);
      })
    );
    console.log({ encodedBytes });
    console.log("newGenerateAndEncodeEmbedding: Simplified encoding complete.");
    // --- End Simplified Encoding ---

    // Convert final bytes to hex string
    const hexEncodedString = ethers.hexlify(encodedBytes);

    // We no longer calculate WAD embedding off-chain in this version
    return {
      embedding, // original float values from OpenAI
      // wadEmbedding: null, // WAD version not calculated here
      encoded: encodedBytes, // bytes version for contract
      hexEncoded: hexEncodedString, // hex string representation
    };
  } catch (error) {
    console.error("Error in newGenerateAndEncodeEmbedding:", error);
    throw error;
  }
}

module.exports = {
  increaseTime,
  generateRandomEmbedding,
  generateAndEncodeEmbedding,
  generateEmbedding,
  getZkNote,
  getZkEmbedding,
  newGenerateAndEncodeEmbedding,
  EMBEDDING_DIMENSION,
  MODEL,
};
