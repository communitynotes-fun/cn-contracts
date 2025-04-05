const hre = require("hardhat");
const helpers = require("./helpers.js"); // Assuming helpers.js is in the same directory or accessible path

async function main() {
  const { ethers } = hre; // Use ethers from Hardhat Runtime Environment

  console.log("\n--- Testing Embedding Generation and Encoding (Using WAD Method) ---");

  // --- Test Case: Input Text ---
  const testText1 = "H1B visa maga";
  console.log(`\n[Test Case] Input text: "${testText1}"`);
  try {
    // Call the ORIGINAL function with WAD scaling
    const result1 = await helpers.generateAndEncodeEmbedding(testText1);

    console.log("  ✅ Success!");

    // Log the final encoded bytes as the hex string:
    const hexEncodedString = ethers.hexlify(result1.encoded);
    console.log(`>>> Encoded Hex String: ${hexEncodedString}`);
    console.log(`    Encoded Bytes Length: ${result1.encoded.length} (Expected: ${helpers.EMBEDDING_DIMENSION * 2})`);

    // Log other details (optional)
    console.log(`    Raw Embedding (float, first 5): [${result1.embedding.slice(0, 5).join(", ")}...] Length: ${result1.embedding.length}`);
    console.log(
      `    WAD Embedding (BigInt, first 5): [${result1.wadEmbedding
        .slice(0, 5)
        .map((v) => v.toString())
        .join(", ")}...] Length: ${result1.wadEmbedding.length}`
    );
  } catch (error) {
    console.error("  ❌ Error generating embedding:", error);
  }

  // --- Test Case 2: Example Note Text (Uncomment if needed) ---
  /*
  const testText2 = "Digitally altered post. This was not posted by Pete Hegseth. It is parody, but not apparent.";
  console.log(`\n[Test Case 2] Input text: "${testText2}"`);
  try {
    console.log("Calling generateAndEncodeEmbedding...");
    const result2 = await helpers.generateAndEncodeEmbedding(testText2);

    console.log("  ✅ Success!");
    const hexEncodedString2 = ethers.hexlify(result2.encoded);
    console.log(`>>> Encoded Hex String: ${hexEncodedString2}`);
    console.log(`    Encoded Bytes Length: ${result2.encoded.length} (Expected: ${helpers.EMBEDDING_DIMENSION * 2})`);
    console.log(`    Raw Embedding (float, first 5): [${result2.embedding.slice(0, 5).join(", ")}...] Length: ${result2.embedding.length}`);
    console.log(
      `    WAD Embedding (BigInt, first 5): [${result2.wadEmbedding
        .slice(0, 5)
        .map((v) => v.toString())
        .join(", ")}...] Length: ${result2.wadEmbedding.length}`
    );

  } catch (error) {
    console.error("  ❌ Error generating embedding for Test Case 2:", error);
  }
  */

  console.log("\n--- Embedding Test Complete ---");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
