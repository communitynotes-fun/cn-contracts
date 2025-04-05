// SIMPLIFIED VERIFIER TEST SCRIPT
const { ethers } = require("hardhat");
const { AbiCoder } = require("ethers");
const helpers = require("./helpers.js");

async function main() {
  console.log("\n--- Starting Simplified Verifier Test ---");

  // Get signers
  const [owner, user1, user2, user3, user4] = await ethers.getSigners();
  console.log("\nAccounts loaded:");
  console.log("Owner:", owner.address);
  console.log("User1:", user1.address);
  console.log("User2:", user2.address);
  // console.log("User3:", user3.address);
  // console.log("User4:", user4.address);

  // Deploy contracts
  console.log("\nDeploying contracts...");

  // Deploy Reclaim contract (replace with actual if needed)
  const Reclaim = await ethers.getContractFactory("Reclaim");
  const reclaim = await Reclaim.deploy(/* Constructor args if any */);
  await reclaim.waitForDeployment();
  const reclaimAddress = await reclaim.getAddress();
  console.log("Reclaim contract deployed to:", reclaimAddress);

  // Deploy TweetVerifier
  const TweetVerifier = await ethers.getContractFactory("TweetVerifier");
  const tweetVerifier = await TweetVerifier.deploy(reclaimAddress);
  await tweetVerifier.waitForDeployment();
  const tweetVerifierAddress = await tweetVerifier.getAddress();
  console.log("TweetVerifier deployed to:", tweetVerifierAddress);

  // Deploy EmbeddingVerifier
  const EmbeddingVerifier = await ethers.getContractFactory("EmbeddingVerifier");
  const embeddingVerifier = await EmbeddingVerifier.deploy(reclaimAddress, helpers.EMBEDDING_DIMENSION);
  await embeddingVerifier.waitForDeployment();
  const embeddingVerifierAddress = await embeddingVerifier.getAddress();
  console.log("EmbeddingVerifier deployed to:", embeddingVerifierAddress);

  // Deploy CNMarket
  const CNMarket = await ethers.getContractFactory("CNMarket");
  const market = await CNMarket.deploy(tweetVerifierAddress, embeddingVerifierAddress);
  await market.waitForDeployment();
  const marketAddress = await market.getAddress();
  console.log("CNMarket deployed to:", marketAddress);

  // Deploy CNMarketResolver
  const CNMarketResolver = await ethers.getContractFactory("CNMarketResolver");
  const resolver = await CNMarketResolver.deploy(marketAddress);
  await resolver.waitForDeployment();
  const resolverAddress = await resolver.getAddress();
  console.log("CNMarketResolver deployed to:", resolverAddress);

  // --- Set Global Resolver (as Owner) ---
  console.log("\nSetting global resolver address...");
  const setResolverTx = await market.connect(owner).setResolver(resolverAddress);
  await setResolverTx.wait();
  const currentResolver = await market.getResolver();
  console.log(`Global resolver set to: ${currentResolver}`);
  // --- End Set Global Resolver ---

  // ===== CREATE AND PREDICT ON MARKET =====
  console.log("\n\n=== TESTING MARKET CREATION & PREDICTION ===");

  // Create a market
  console.log("\n--- Testing Market Creation ---");
  const tweetId = "1234567890"; // Example Tweet ID
  const createTx = await market.createMarket(tweetId);
  const createReceipt = await createTx.wait();
  const marketCreatedEvent = createReceipt.logs.find((log) => market.interface.parseLog(log)?.name === "MarketCreated");
  const marketId = marketCreatedEvent.args.marketId;
  console.log(`\nMarket created with ID: ${marketId}`);

  // Test AGREE prediction (User1)
  console.log("\n--- Testing AGREE Prediction (User1) ---");
  const agreeValue = ethers.parseEther("0.1");
  const agreeTx = await market.connect(user1).predict(marketId, true, "", "0x", { value: agreeValue });
  await agreeTx.wait();
  console.log(`User1 predicted AGREE with ${ethers.formatEther(agreeValue)} ETH`);

  // Test DISAGREE prediction (User2)
  const reasonText1 = "Digitally banana post. This was not posted by Pete Hegseth.";
  console.log("\n--- Testing DISAGREE Prediction (User2) ---");
  console.log(`Reason: "${reasonText1}"`);
  console.log("Generating & Encoding Embedding...");
  const { encoded: encoded1 } = await helpers.generateAndEncodeEmbedding(reasonText1);
  const disagreeValue = ethers.parseEther("0.2");
  const disagreeTx = await market.connect(user2).predict(marketId, false, reasonText1, encoded1, { value: disagreeValue });
  await disagreeTx.wait();
  console.log(`User2 predicted DISAGREE with ${ethers.formatEther(disagreeValue)} ETH`);

  // ===== TEST VERIFICATION HELPERS & RESOLUTION =====
  console.log("\n\n=== TESTING ZK HELPERS & MARKET RESOLUTION ===");

  // Test the getZkNote function (Using a known tweet ID with a note)
  const testTweetIdWithNote = "1907800132906570148";
  console.log(`\n--- Testing getZkNote Function for Tweet ID: ${testTweetIdWithNote} ---`);
  let zkNoteResult;
  try {
    zkNoteResult = await helpers.getZkNote(testTweetIdWithNote);
    console.log("getZkNote Result:");
    console.log(`  Has note: ${zkNoteResult.hasNote}`);
    console.log(`  Note text: "${zkNoteResult.noteText}"`);
    console.log(`  Proof verification: ${zkNoteResult.isVerified ? "Successful" : "Failed"}`);
  } catch (error) {
    console.error("Error testing getZkNote:", error);
    zkNoteResult = { hasNote: false, noteText: "", proofData: "0x" }; // Default on error
  }

  // Test getZkEmbedding function using the note text found
  console.log("\n--- Testing getZkEmbedding Function ---");
  let zkEmbeddingResult;
  const noteTextToEmbed = zkNoteResult?.noteText || ""; // Use found note text or empty string
  if (noteTextToEmbed) {
    try {
      zkEmbeddingResult = await helpers.getZkEmbedding(noteTextToEmbed);
      console.log("getZkEmbedding Result:");
      console.log({ zkEmbeddingResult });
      // console.log(`  Encoded Bytes: ${zkEmbeddingResult.encoded.substring(0, 66)}...`);
      // console.log(`  Proof Data: ${zkEmbeddingResult.proofData.claimInfo.substring(0, 66)}...`);
      // console.log(`  Embedding Dimension: ${zkEmbeddingResult.embedding?.length}`);
    } catch (error) {
      console.error("Error testing getZkEmbedding:", error);
      zkEmbeddingResult = { encoded: "0x", proofData: "0x", embedding: [] }; // Default on error
    }
  } else {
    console.log("Skipping getZkEmbedding test as no note text was available.");
    zkEmbeddingResult = { encoded: "0x", proofData: "0x", embedding: [] }; // Default
  }

  // ===== TEST VERIFICATION HELPERS & RESOLUTION =====
  console.log("\n\n=== TESTING ZK HELPERS & MARKET RESOLUTION ===");

  // Prepare data for market.resolve call
  const hasNoteResolved = zkNoteResult?.hasNote ?? false;
  const noteTextResolved = zkNoteResult?.noteText || "";
  const noteEmbeddingBytesResolved = zkEmbeddingResult?.encoded || "0x";
  let tweetProofBytesResolved = zkNoteResult?.proofData || "0x";
  // *** IMPORTANT: Reclaim SDK generates ONE proof for BOTH context and response ***
  // *** We use the SAME proof data for both tweet status and embedding verification ***
  const embeddingProofBytesResolved = zkNoteResult?.proofData || "0x"; // Re-use tweet proof

  // --- DEBUG: Log the structure of the proof object before sending ---
  console.log("\n--- Inspecting zkNoteResult.proofData before sending to contract: ---");
  console.dir(tweetProofBytesResolved, { depth: null });
  console.log("--- End proof object inspection ---");
  // --- END DEBUG ---

  console.log(`\nAttempting resolution for Market ID: ${marketId} (hasNote: ${hasNoteResolved})...`);
  console.log(`  Note Text: "${noteTextResolved}"`);
  // console.log(`  Embedding Bytes: ${noteEmbeddingBytesResolved.substring(0, 66)}...`);
  // console.log(`  Tweet Proof Bytes: ${tweetProofBytesResolved.substring(0, 66)}...`);
  // console.log(`  Embedding Proof Bytes: ${embeddingProofBytesResolved.substring(0, 66)}...`);

  // Only proceed if we have necessary data (especially if a note was expected)
  if (hasNoteResolved && (!noteTextResolved || noteEmbeddingBytesResolved === "0x" || tweetProofBytesResolved === "0x")) {
    console.error("❌ Cannot resolve with hasNote=true because necessary data (text, embedding, proof) is missing!");
  } else {
    try {
      // Call market.resolve
      const resolveTx = await market.resolve(
        marketId, // Market ID to resolve
        hasNoteResolved, // Did the tweet have a note?
        noteTextResolved, // Text of the note (if any)
        noteEmbeddingBytesResolved, // ABI Encoded embedding bytes (if any)
        tweetProofBytesResolved, // Proof for tweet status
        embeddingProofBytesResolved // Proof for embedding (re-using tweet proof)
      );

      // Wait for transaction and log events
      const resolveReceipt = await resolveTx.wait();
      console.log("\n--- Events from market.resolve transaction: ---");
      for (const log of resolveReceipt.logs) {
        try {
          const parsedLog = market.interface.parseLog(log);
          if (parsedLog) {
            console.log(`  Event: ${parsedLog.name}`);
            // Log specific events we added
            if (parsedLog.name === "LogBytes") {
              console.log(`    Context: ${parsedLog.args.context}`);
              console.log(`    Data: ${parsedLog.args.data}`);
            } else if (parsedLog.name === "MarketResolved") {
              console.log(`    Args: marketId=${parsedLog.args.marketId}, hasNote=${parsedLog.args.hasNote}, noteText="${parsedLog.args.noteText}"`);
            }
          }
        } catch (e) {
          // Ignore logs not parseable by this interface
        }
      }
      console.log("--- End events from market.resolve ---");

      console.log("✅ Market resolve called successfully.");

      // --- Final State Check ---
      console.log("\nVerifying final market state after resolve...");
      const marketDataAfterResolve = await market.getMarket(marketId);
      const marketStatusAfterResolve = marketDataAfterResolve.status;
      // Assuming MarketStatus enum: OPEN=0, REVEALED=1, TRACKED=2, REFUNDED=3
      const expectedStatusRevealed = 1;
      if (Number(marketStatusAfterResolve) === expectedStatusRevealed) {
        console.log(`✅ Market status is REVEALED (${marketStatusAfterResolve}) as expected.`);
      } else {
        console.error(`❌ Market status is NOT REVEALED. Expected ${expectedStatusRevealed}, got ${marketStatusAfterResolve}`);
      }
      const marketOutcome = await market.getOutcome(marketId);
      console.log(`Outcome stored: hasNote=${marketOutcome.hasNote}, noteText="${marketOutcome.noteText}"`);
    } catch (resolveError) {
      console.error("❌ Error calling market.resolve:", resolveError);
      // Log the full error, including potential revert reason
      if (resolveError.data) {
        try {
          const decodedError = market.interface.parseError(resolveError.data);
          console.error(`   Revert Reason: ${decodedError.name}(${decodedError.args})`);
        } catch (decodeErr) {
          console.error("   Could not decode revert reason data.");
        }
      }
    }
  }

  console.log("\n--- Simplified Verifier Test Complete ---");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
