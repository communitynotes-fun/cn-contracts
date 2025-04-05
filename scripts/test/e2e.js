// COMPREHENSIVE END-TO-END TEST SCRIPT
const { ethers } = require("hardhat");
const helpers = require("./helpers.js");

async function main() {
  console.log("\n--- Starting Community Notes Market E2E Test ---");

  // Get signers
  const [owner, user1, user2, user3, user4] = await ethers.getSigners();
  console.log("\nAccounts loaded:");
  console.log("Owner:", owner.address);
  console.log("User1:", user1.address);
  console.log("User2:", user2.address);
  console.log("User3:", user3.address);
  console.log("User4:", user4.address);

  // Deploy contracts
  console.log("\nDeploying contracts...");

  // Deploy Reclaim contract (needed by EmbeddingVerifier)
  // Note: You might need the actual ABI/artifact for the specific Reclaim version
  // Assuming a generic deployment for now. Replace with actual deployment if needed.
  const Reclaim = await ethers.getContractFactory("Reclaim"); // Ensure you have the Reclaim artifact
  // The Reclaim constructor might take arguments depending on the version
  // For example, it might need the address of the Reclaim Verifier Registry
  // Adjust the deployment args as necessary for your specific Reclaim contract
  const reclaim = await Reclaim.deploy(/* Add constructor args if any */);
  await reclaim.waitForDeployment();
  console.log("Reclaim contract deployed to:", await reclaim.getAddress());

  const TweetVerifier = await ethers.getContractFactory("TweetVerifier");
  // Pass the deployed Reclaim contract address to the TweetVerifier constructor
  const tweetVerifier = await TweetVerifier.deploy(await reclaim.getAddress());
  await tweetVerifier.waitForDeployment();
  console.log("TweetVerifier deployed to:", await tweetVerifier.getAddress());

  const EmbeddingVerifier = await ethers.getContractFactory("EmbeddingVerifier");
  // Pass the deployed Reclaim contract address and the dimension
  const embeddingVerifier = await EmbeddingVerifier.deploy(await reclaim.getAddress(), 768);
  await embeddingVerifier.waitForDeployment();
  console.log("EmbeddingVerifier deployed to:", await embeddingVerifier.getAddress());

  const CNMarket = await ethers.getContractFactory("CNMarket");
  const market = await CNMarket.deploy(await tweetVerifier.getAddress(), await embeddingVerifier.getAddress());
  await market.waitForDeployment();
  console.log("CNMarket deployed to:", await market.getAddress());

  const CNMarketResolver = await ethers.getContractFactory("CNMarketResolver");
  const resolver = await CNMarketResolver.deploy(await market.getAddress());
  await resolver.waitForDeployment();
  console.log("CNMarketResolver deployed to:", await resolver.getAddress());

  // --- Set Global Resolver (as Owner) ---
  const resolverAddress = await resolver.getAddress();
  console.log("\nSetting global resolver address...");
  const setResolverTx = await market.connect(owner).setResolver(resolverAddress); // Call as owner
  await setResolverTx.wait();
  const currentResolver = await market.getResolver(); // Call new getter
  console.log(`Global resolver set to: ${currentResolver}`);
  // --- End Set Global Resolver ---

  // ===== FIRST MARKET =====
  console.log("\n\n=== TESTING FIRST MARKET ===");

  // Create a market
  console.log("\n--- Testing Market Creation ---");
  const tweetId = "1234567890";
  const tx = await market.createMarket(tweetId);
  const receipt = await tx.wait();

  // Get marketId from MarketCreated event
  const marketCreatedEvent = receipt.logs[0]; // The first event should be MarketCreated
  const marketId = marketCreatedEvent.args[0]; // First argument is marketId
  console.log("\nMarket created with ID:", marketId);

  // Test AGREE prediction (User1)
  console.log("\n--- Testing AGREE Prediction (User1) ---");
  const agreePredictionTx = await market.connect(user1).predict(
    marketId, // marketId
    true, // isAgree
    "", // no reason needed
    "0x", // no embedding needed
    {
      value: ethers.parseEther("0.1"), // 0.1 ETH stake
    }
  );
  const agreePredictionReceipt = await agreePredictionTx.wait();
  const predictionEvent = agreePredictionReceipt.logs[0]; // First event should be PredictionMade
  console.log("\nAGREE Prediction made:");
  console.log("Prediction ID:", predictionEvent.args[1]); // Second argument is predictionId
  console.log("Predictor:", predictionEvent.args[2]); // Third argument is predictor
  console.log("Value:", ethers.formatEther(predictionEvent.args[4]), "ETH"); // Fifth argument is value

  // Verify prediction details
  const prediction = await market.getPrediction(marketId, predictionEvent.args[1]);
  console.log("\nPrediction details from contract:");
  console.log("Predictor:", prediction.predictor);
  console.log("Value:", ethers.formatEther(prediction.value), "ETH");
  console.log("Is Agree:", prediction.isAgree);
  console.log("Claimed:", prediction.claimed);
  console.log("Timestamp:", new Date(Number(prediction.timestamp) * 1000).toLocaleString());

  // Create a realistic fact-check comment for first DISAGREE
  const reasonText1 =
    "Digitally altered post. This tweet makes claims about election results that are not supported by official data. According to the State Election Commission's final tally released on their website (https://election.gov/results/2024), the actual margin was 52% to 48%, not 70% to 30% as claimed. The tweet appears to be citing unofficial exit polls rather than verified results.";

  // Generate embedding for the fact-check
  console.log("\nGenerating embedding for first fact-check comment...");

  // Encode the embedding for contract use
  console.log("Encoding embedding for contract...");
  const { encoded: encoded1 } = await helpers.generateAndEncodeEmbedding(reasonText1);

  // Make DISAGREE prediction (User2)
  console.log("\nMaking DISAGREE prediction (User2)...");
  const disagreePredictionTx = await market.connect(user2).predict(
    marketId,
    false, // isAgree = false for DISAGREE
    reasonText1,
    encoded1,
    {
      value: ethers.parseEther("0.2"), // 0.2 ETH stake
    }
  );

  const disagreePredictionReceipt = await disagreePredictionTx.wait();
  const disagreePredictionEvent = disagreePredictionReceipt.logs[0];
  console.log("\nDISAGREE Prediction made:");
  console.log("Prediction ID:", disagreePredictionEvent.args[1]);
  console.log("Predictor:", disagreePredictionEvent.args[2]);
  console.log("Value:", ethers.formatEther(disagreePredictionEvent.args[4]), "ETH");

  // Verify DISAGREE prediction details
  const disagreePrediction = await market.getPrediction(marketId, disagreePredictionEvent.args[1]);
  console.log("\nDISAGREE Prediction details from contract:");
  console.log("Predictor:", disagreePrediction.predictor);
  console.log("Value:", ethers.formatEther(disagreePrediction.value), "ETH");
  console.log("Is Agree:", disagreePrediction.isAgree);
  console.log("Claimed:", disagreePrediction.claimed);
  console.log("Timestamp:", new Date(Number(disagreePrediction.timestamp) * 1000).toLocaleString());

  // Get the prediction from the resolver to verify the reason text and embedding were stored
  const marketResolver = await ethers.getContractAt("CNMarketResolver", await resolver.getAddress());
  const resolverPrediction = await marketResolver.predictions(marketId, disagreePredictionEvent.args[1]);
  console.log("\nResolver Prediction details:");
  console.log("Reason Text:", resolverPrediction.reasonText);
  console.log("Tracked:", resolverPrediction.tracked);
  console.log("Weighted Similarity:", resolverPrediction.wadWeightedSimilarity);

  // Test AGREE prediction (User3)
  console.log("\n--- Testing AGREE Prediction (User3) ---");
  const agreePredictionTx2 = await market.connect(user3).predict(
    marketId, // marketId
    true, // isAgree
    "", // no reason needed
    "0x", // no embedding needed
    {
      value: ethers.parseEther("0.15"), // 0.15 ETH stake
    }
  );
  const agreePredictionReceipt2 = await agreePredictionTx2.wait();
  const predictionEvent2 = agreePredictionReceipt2.logs[0]; // First event should be PredictionMade
  console.log("\nAGREE Prediction made:");
  console.log("Prediction ID:", predictionEvent2.args[1]); // Second argument is predictionId
  console.log("Predictor:", predictionEvent2.args[2]); // Third argument is predictor
  console.log("Value:", ethers.formatEther(predictionEvent2.args[4]), "ETH"); // Fifth argument is value

  // Verify prediction details
  const prediction2 = await market.getPrediction(marketId, predictionEvent2.args[1]);
  console.log("\nPrediction details from contract:");
  console.log("Predictor:", prediction2.predictor);
  console.log("Value:", ethers.formatEther(prediction2.value), "ETH");
  console.log("Is Agree:", prediction2.isAgree);
  console.log("Claimed:", prediction2.claimed);
  console.log("Timestamp:", new Date(Number(prediction2.timestamp) * 1000).toLocaleString());

  // Create a second realistic fact-check comment for second DISAGREE
  // const reasonText2 = "Digitally testing. testing. his was not posted by Pete Hegseth. It is parody, but not apparent. Pete's X handle is @petehegseth not @pete hegseth.";
  const reasonText2 =
    "Digitally altered post.  This was not posted by Pete Hegseth. It is parody, but not apparent. Pete’s X handle is @petehegseth not @pete hegseth. \\n\\nx.com/PeteHegseth?re…";

  // Generate embedding for the second fact-check
  console.log("\nGenerating embedding for second fact-check comment...");

  // Encode the embedding for contract use
  console.log("Encoding embedding for contract...");
  const { encoded: encoded2 } = await helpers.generateAndEncodeEmbedding(reasonText2);

  // Make second DISAGREE prediction (User4)
  console.log("\nMaking DISAGREE prediction (User4)...");
  console.log({ reasonText2, encoded2 });
  const disagreePredictionTx2 = await market.connect(user4).predict(
    marketId,
    false, // isAgree = false for DISAGREE
    reasonText2,
    encoded2,
    {
      value: ethers.parseEther("0.25"), // 0.25 ETH stake
    }
  );

  const disagreePredictionReceipt2 = await disagreePredictionTx2.wait();
  const disagreePredictionEvent2 = disagreePredictionReceipt2.logs[0];
  console.log("\nSecond DISAGREE Prediction made:");
  console.log("Prediction ID:", disagreePredictionEvent2.args[1]);
  console.log("Predictor:", disagreePredictionEvent2.args[2]);
  console.log("Value:", ethers.formatEther(disagreePredictionEvent2.args[4]), "ETH");

  // Get the second prediction from the resolver to verify the reason text and embedding were stored
  const resolverPrediction2 = await marketResolver.predictions(marketId, disagreePredictionEvent2.args[1]);
  console.log("\nResolver Prediction details:");
  console.log("Reason Text:", resolverPrediction2.reasonText);
  console.log("Tracked:", resolverPrediction2.tracked);
  console.log("Weighted Similarity:", resolverPrediction2.wadWeightedSimilarity);

  // Verify prediction tracker totals for first market
  const tracker = await market.getPredictionTracker(marketId);
  console.log("\nFinal Prediction Tracker Status for Market 1:");
  console.log("Total Predictions:", tracker.numPredictions);
  console.log("Total AGREE Value:", ethers.formatEther(tracker.totalAgreeValue), "ETH");
  console.log("Total DISAGREE Value:", ethers.formatEther(tracker.totalDisagreeValue), "ETH");

  // ===== SECOND MARKET =====
  console.log("\n\n=== TESTING SECOND MARKET ===");

  // Create a second market
  console.log("\n--- Testing Second Market Creation ---");
  const tweetId2 = "9876543210";
  const tx2 = await market.createMarket(tweetId2);
  const receipt2 = await tx2.wait();

  // Get marketId from MarketCreated event
  const marketCreatedEvent2 = receipt2.logs[0]; // The first event should be MarketCreated
  const marketId2 = marketCreatedEvent2.args[0]; // First argument is marketId
  console.log("\nSecond market created with ID:", marketId2);

  // Test AGREE prediction (User2)
  console.log("\n--- Testing AGREE Prediction (User2) for Market 2 ---");
  const agreePredictionTx3 = await market.connect(user2).predict(
    marketId2, // marketId
    true, // isAgree
    "", // no reason needed
    "0x", // no embedding needed
    {
      value: ethers.parseEther("0.12"), // 0.12 ETH stake
    }
  );
  const agreePredictionReceipt3 = await agreePredictionTx3.wait();
  const predictionEvent3 = agreePredictionReceipt3.logs[0]; // First event should be PredictionMade
  console.log("\nAGREE Prediction made for Market 2:");
  console.log("Prediction ID:", predictionEvent3.args[1]); // Second argument is predictionId
  console.log("Predictor:", predictionEvent3.args[2]); // Third argument is predictor
  console.log("Value:", ethers.formatEther(predictionEvent3.args[4]), "ETH"); // Fifth argument is value

  // Create a realistic fact-check comment for first DISAGREE in Market 2
  const reasonText3 =
    "This tweet contains false information about climate change. According to the latest IPCC report (https://www.ipcc.ch/report/ar6/), global temperatures have risen by approximately 1.1°C since pre-industrial levels, not the 0.5°C claimed in the tweet. The tweet appears to be using outdated or incorrect data sources.";

  // Generate embedding for the fact-check
  console.log("\nGenerating embedding for first fact-check comment for Market 2...");

  // Encode the embedding for contract use
  console.log("Encoding embedding for contract...");
  const { encoded: encoded3 } = await helpers.generateAndEncodeEmbedding(reasonText3);

  // Make DISAGREE prediction (User3)
  console.log("\nMaking DISAGREE prediction (User3) for Market 2...");
  const disagreePredictionTx3 = await market.connect(user3).predict(
    marketId2,
    false, // isAgree = false for DISAGREE
    reasonText3,
    encoded3,
    {
      value: ethers.parseEther("0.18"), // 0.18 ETH stake
    }
  );

  const disagreePredictionReceipt3 = await disagreePredictionTx3.wait();
  const disagreePredictionEvent3 = disagreePredictionReceipt3.logs[0];
  console.log("\nDISAGREE Prediction made for Market 2:");
  console.log("Prediction ID:", disagreePredictionEvent3.args[1]);
  console.log("Predictor:", disagreePredictionEvent3.args[2]);
  console.log("Value:", ethers.formatEther(disagreePredictionEvent3.args[4]), "ETH");

  // Create a second realistic fact-check comment for second DISAGREE in Market 2
  const reasonText4 =
    "The tweet misrepresents the findings of the recent study on renewable energy. According to the International Renewable Energy Agency (https://www.irena.org/publications/2024/Jan/Renewable-Power-Generation-Costs-in-2022), solar and wind power are now the cheapest forms of electricity in most regions, not the most expensive as claimed in the tweet. The tweet appears to be citing outdated information from a decade ago.";

  // Generate embedding for the second fact-check
  console.log("\nGenerating embedding for second fact-check comment for Market 2...");

  // Encode the embedding for contract use
  console.log("Encoding embedding for contract...");
  const { encoded: encoded4 } = await helpers.generateAndEncodeEmbedding(reasonText4);

  // Make second DISAGREE prediction (User4)
  console.log("\nMaking second DISAGREE prediction (User4) for Market 2...");
  const disagreePredictionTx4 = await market.connect(user4).predict(
    marketId2,
    false, // isAgree = false for DISAGREE
    reasonText4,
    encoded4,
    {
      value: ethers.parseEther("0.22"), // 0.22 ETH stake
    }
  );

  const disagreePredictionReceipt4 = await disagreePredictionTx4.wait();
  const disagreePredictionEvent4 = disagreePredictionReceipt4.logs[0];
  console.log("\nSecond DISAGREE Prediction made for Market 2:");
  console.log("Prediction ID:", disagreePredictionEvent4.args[1]);
  console.log("Predictor:", disagreePredictionEvent4.args[2]);
  console.log("Value:", ethers.formatEther(disagreePredictionEvent4.args[4]), "ETH");

  // Add two more AGREE predictions with time delays
  console.log("\n--- Adding More AGREE Predictions (Market 2) ---");

  // Prediction by User1 (2 hours after User4's disagree)
  console.log("Advancing time by 2 hours...");
  await helpers.increaseTime(2 * 60 * 60);
  let predictionEvent5;
  try {
    const agreePredictionTx5 = await market.connect(user1).predict(
      marketId2,
      true, // isAgree
      "",
      "0x",
      { value: ethers.parseEther("0.1") } // 0.1 ETH
    );
    const receipt5 = await agreePredictionTx5.wait();
    predictionEvent5 = receipt5.logs.find((log) => log.fragment?.name === "PredictionMade"); // Safer log finding
    if (predictionEvent5) {
      console.log("AGREE Prediction 5 (User1) made for Market 2:");
      console.log("  Prediction ID:", predictionEvent5.args[1]);
      console.log("  Value:", ethers.formatEther(predictionEvent5.args[4]), "ETH");
    } else {
      console.error("❌ Could not find PredictionMade event for Prediction 5.");
    }
  } catch (predictError5) {
    console.error("❌ Error making Prediction 5 (User1):", predictError5.message);
    // Re-throw or exit if this failure is critical for subsequent steps
  }

  // Prediction by Owner (2 hours after User1's agree)
  console.log("Advancing time by another 2 hours...");
  await helpers.increaseTime(2 * 60 * 60);
  let predictionEvent6;
  try {
    const agreePredictionTx6 = await market.connect(owner).predict(
      marketId2,
      true, // isAgree
      "",
      "0x",
      { value: ethers.parseEther("0.1") } // 0.1 ETH
    );
    const receipt6 = await agreePredictionTx6.wait();
    predictionEvent6 = receipt6.logs.find((log) => log.fragment?.name === "PredictionMade"); // Safer log finding
    if (predictionEvent6) {
      console.log("AGREE Prediction 6 (Owner) made for Market 2:");
      console.log("  Prediction ID:", predictionEvent6.args[1]);
      console.log("  Value:", ethers.formatEther(predictionEvent6.args[4]), "ETH");
    } else {
      console.error("❌ Could not find PredictionMade event for Prediction 6.");
    }
  } catch (predictError6) {
    console.error("❌ Error making Prediction 6 (Owner):", predictError6.message);
  }

  // Verify prediction tracker totals for second market AFTER all predictions
  const tracker2_final = await market.getPredictionTracker(marketId2);
  console.log("\nFinal Prediction Tracker Status for Market 2 (After All Bets):");
  console.log("Total Predictions:", tracker2_final.numPredictions);
  console.log("Total AGREE Value:", ethers.formatEther(tracker2_final.totalAgreeValue), "ETH");
  console.log("Total DISAGREE Value:", ethers.formatEther(tracker2_final.totalDisagreeValue), "ETH");

  // Verify that markets are stored independently
  console.log("\n--- Verifying Independent Market Storage ---");
  console.log("Market 1 Tweet ID:", await market.markets(marketId).then((m) => m.tweetId));
  console.log("Market 1 Total Predictions:", tracker.numPredictions);
  console.log("Market 1 Total AGREE Value:", ethers.formatEther(tracker.totalAgreeValue), "ETH");
  console.log("Market 1 Total DISAGREE Value:", ethers.formatEther(tracker.totalDisagreeValue), "ETH");
  console.log("Market 2 Tweet ID:", await market.markets(marketId2).then((m) => m.tweetId));
  console.log("Market 2 Total Predictions:", tracker2_final.numPredictions);
  console.log("Market 2 Total AGREE Value:", ethers.formatEther(tracker2_final.totalAgreeValue), "ETH");
  console.log("Market 2 Total DISAGREE Value:", ethers.formatEther(tracker2_final.totalDisagreeValue), "ETH");

  // Test that an invalid DISAGREE prediction (no reason/embedding) fails
  console.log("\n--- Testing Invalid DISAGREE Prediction ---");
  try {
    await market.connect(user2).predict(
      marketId,
      false,
      "", // empty reason
      "0x", // empty embedding
      {
        value: ethers.parseEther("0.1"),
      }
    );
    console.log("❌ Test failed: Invalid DISAGREE prediction should have been rejected");
  } catch (error) {
    console.log("✅ Test passed: Invalid DISAGREE prediction was correctly rejected");
  }

  // Test the getZkNote function
  console.log("\n--- Testing getZkNote Function ---");
  let zkNoteResult;
  try {
    // Use a tweet ID that has a community note
    zkNoteResult = await helpers.getZkNote("1907800132906570148");
    console.log("Has note:", zkNoteResult.hasNote);
    console.log("Note text:", zkNoteResult.noteText);
    console.log("Note ID:", zkNoteResult.noteId);
    console.log("Proof verification:", zkNoteResult.isVerified ? "Successful" : "Failed");
  } catch (error) {
    console.error("Error testing getZkNote:", error);
  }

  // test getZkEmbedding function
  console.log("\n--- Testing getZkEmbedding Function ---");
  let zkEmbeddingResult;
  try {
    // await helpers.generateEmbedding(zkNoteResult.noteText);
    zkEmbeddingResult = await helpers.getZkEmbedding(zkNoteResult.noteText);
    console.log("Embedding:", zkEmbeddingResult.embedding);
  } catch (error) {
    console.error("Error testing getZkEmbedding:", error);
    // Provide default values if it fails
    zkEmbeddingResult = { encoded: "0x", proofData: "0x", embedding: [] }; // Added empty embedding array
  }

  // ===== TEST EARLY MARKET RESOLUTION (Before Deadline) =====
  console.log("\n\n=== TESTING EARLY RESOLUTION (BEFORE DEADLINE) ===");

  // NOTE: This test assumes the MarketNotEnded check in CNMarket.setOutcome is REMOVED or MODIFIED
  // to allow revealing before the market deadline if a note exists.

  // Ensure we have valid results from the ZK proof helper functions
  const noteTextEarly = zkNoteResult?.noteText || "";
  const noteEmbeddingBytesEarly = zkEmbeddingResult?.encoded || "0x";
  const tweetProofBytesEarly = zkNoteResult?.proofData || "0x";
  const embeddingProofBytesEarly = zkEmbeddingResult?.proofData || "0x";
  const hasNoteEarly = zkNoteResult?.hasNote ?? false;

  console.log({ noteEmbeddingBytesEarly });

  console.log({ zkNoteResult });

  // Only proceed if a note was actually found by getZkNote and embedding was processed
  if (hasNoteEarly && zkEmbeddingResult?.encoded && tweetProofBytesEarly !== "0x" && embeddingProofBytesEarly !== "0x") {
    console.log(`\nAttempting early resolution for Market ID: ${marketId} via market.resolve (hasNote: true)...`);
    console.log({ noteTextEarly, noteEmbeddingBytesEarly });
    try {
      // Call market.resolve BEFORE the deadline with CORRECT arguments
      const revealTx = await market.resolve(
        marketId, // 1: uint256
        true, // 2: bool (must be true for this scenario)
        noteTextEarly, // 3: string
        noteEmbeddingBytesEarly, // 4: bytes (encoded embedding bytes)
        tweetProofBytesEarly, // 5: bytes (note proof data)
        embeddingProofBytesEarly // 6: bytes (embedding proof data)
      );

      await revealTx.wait();
      console.log("✅ Early market reveal called successfully.");

      // --- Verification Checks After Reveal ---
      console.log("\nVerifying state after reveal...");

      // Check 1: Market Status should be REVEALED
      const marketDataAfterReveal = await market.getMarket(marketId);
      const marketStatusEarly = marketDataAfterReveal.status;
      // Assuming MarketStatus enum: OPEN=0, REVEALED=1, TRACKED=2, REFUNDED=3
      const expectedStatusRevealed = 1;
      if (Number(marketStatusEarly) === expectedStatusRevealed) {
        console.log(`✅ Market status is REVEALED (${marketStatusEarly}) as expected.`);
      } else {
        console.error(`❌ Market status is NOT REVEALED. Expected ${expectedStatusRevealed}, got ${marketStatusEarly}`);
      }
      // Also log outcome for confirmation
      const marketOutcomeEarly = await market.getOutcome(marketId);
      console.log(`Outcome stored: hasNote=${marketOutcomeEarly.hasNote}`);

      // Check 2: Predictions should now fail
      try {
        await market.connect(user1).predict(marketId, true, "", "0x", { value: ethers.parseEther("0.01") });
        console.error("❌ Test Failed: Prediction succeeded on a REVEALED market.");
      } catch (predictionError) {
        // We expect this call to revert. Check if the error is MarketClosed or similar.
        if (predictionError.message.includes("MarketClosed")) {
          console.log("✅ Prediction correctly failed on REVEALED market as expected.");
        } else {
          console.warn("⚠️ Prediction failed on REVEALED market, but for an unexpected reason:", predictionError.message);
        }
      }

      // Check 3: Log individual predictions for verification
      console.log("\n--- Checking Individual Predictions Before Tracking ---");
      const trackerAfterReveal = await market.getPredictionTracker(marketId);
      const numPredictionsToCheck = trackerAfterReveal.numPredictions;
      console.log(`Total predictions recorded: ${numPredictionsToCheck}`);
      for (let predId = 1; predId <= numPredictionsToCheck; predId++) {
        try {
          const predData = await market.getPrediction(marketId, predId);
          console.log(
            `  Prediction ${predId}: Predictor=${predData.predictor}, Value=${ethers.formatEther(predData.value)} ETH, IsAgree=${predData.isAgree}, Timestamp=${new Date(
              Number(predData.timestamp) * 1000
            ).toISOString()}`
          );
          // Optionally, if disagree, fetch reason from resolver
          if (!predData.isAgree) {
            const resolverPred = await resolver.predictions(marketId, predId);
            console.log(`    -> Disagree Reason: ${resolverPred.reasonText}`);
          }
        } catch (getPredError) {
          console.error(`   Error fetching prediction ${predId}:`, getPredError);
        }
      }
      // --- End Verification Checks ---

      // Now that it's revealed and checks passed, call finalizeScores
      console.log("\nFinalizing scores (Early)...");
      const finalizeTx = await market.finalizeScores(marketId);
      await finalizeTx.wait();
      const marketStatusAfterFinalizeEarly = (await market.getMarket(marketId)).status;
      console.log("✅ Scores finalized successfully.");
      console.log("Market status after finalizing (Early):", marketStatusAfterFinalizeEarly); // Should be TRACKED

      // --- Check Scores After Finalizing ---
      console.log("\n--- Checking Scores Stored in Resolver ---");
      try {
        const totalScore = await resolver.wadTotalWeightedScores(marketId);
        console.log(`Total Weighted Score (WAD): ${ethers.formatUnits(totalScore, 18)}`); // Format WAD

        for (let predId = 1; predId <= numPredictionsToCheck; predId++) {
          const predData = await market.getPrediction(marketId, predId);
          if (predData.isAgree) {
            console.log(`  Prediction ${predId} (AGREE): Score = 0 (as hasNote=true)`);
          } else {
            const score = await resolver.similarityScores(marketId, predId);
            console.log(`  Prediction ${predId} (DISAGREE): Score (WAD) = ${ethers.formatUnits(score, 18)}`); // Format WAD
          }
        }
      } catch (scoreError) {
        console.error("   Error fetching scores from resolver:", scoreError);
      }
      // --- End Score Check ---

      // --- Test Claiming Rewards ---
      console.log("\n--- Testing Claim Rewards --- ");

      // User1 (Prediction 1: AGREE) - Should get 0 because hasNote=true
      try {
        console.log(`Attempting claim for User1 (Prediction 1 - AGREE)...`);
        const claimTx1 = await market.connect(user1).claimRewards(marketId, 1);
        const claimReceipt1 = await claimTx1.wait();
        // Check logs for PredictionClaimed event if expecting payout=0, fee=0
        const claimedEvent1 = claimReceipt1.logs.find((log) => log.fragment?.name === "PredictionClaimed");
        if (claimedEvent1 && Number(claimedEvent1.args.payout) === 0 && Number(claimedEvent1.args.fee) === 0) {
          console.log(`✅ User1 claimed successfully (Payout=0, Fee=0 as expected).`);
        } else {
          console.error("❌ User1 claim event has unexpected payout/fee.", claimedEvent1?.args);
        }
      } catch (claimError1) {
        console.error("❌ Error claiming for User1:", claimError1.message);
      }

      // User2 (Prediction 2: DISAGREE) - Should get a payout based on score
      try {
        console.log(`Attempting claim for User2 (Prediction 2 - DISAGREE)...`);
        const balanceBefore2 = await ethers.provider.getBalance(user2.address);
        const claimTx2 = await market.connect(user2).claimRewards(marketId, 2);
        const claimReceipt2 = await claimTx2.wait();
        const gasUsed2 = claimReceipt2.gasUsed * claimReceipt2.gasPrice;
        const balanceAfter2 = await ethers.provider.getBalance(user2.address);
        const claimedEvent2 = claimReceipt2.logs.find((log) => log.fragment?.name === "PredictionClaimed");
        if (claimedEvent2) {
          const payout2 = claimedEvent2.args.payout;
          const fee2 = claimedEvent2.args.fee;
          console.log(`✅ User2 claimed successfully (Payout=${ethers.formatEther(payout2)} ETH, Fee=${ethers.formatEther(fee2)} ETH).`);
          // Check balance change approximates payout (minus gas)
          const expectedBalanceChange = payout2 - gasUsed2;
          const actualBalanceChange = balanceAfter2 - balanceBefore2;
          console.log(`   Balance change: Actual=${ethers.formatEther(actualBalanceChange)} ETH vs Expected(Payout-Gas)=${ethers.formatEther(expectedBalanceChange)} ETH`);
        } else {
          console.error("❌ User2 claim did not emit PredictionClaimed event.");
        }
      } catch (claimError2) {
        console.error("❌ Error claiming for User2:", claimError2.message);
      }

      // User3 (Prediction 3: AGREE) - Should get 0 because hasNote=true
      try {
        console.log(`Attempting claim for User3 (Prediction 3 - AGREE)...`);
        const claimTx3 = await market.connect(user3).claimRewards(marketId, 3);
        const claimReceipt3 = await claimTx3.wait();
        const claimedEvent3 = claimReceipt3.logs.find((log) => log.fragment?.name === "PredictionClaimed");
        if (claimedEvent3 && Number(claimedEvent3.args.payout) === 0 && Number(claimedEvent3.args.fee) === 0) {
          console.log(`✅ User3 claimed successfully (Payout=0, Fee=0 as expected).`);
        } else {
          console.error("❌ User3 claim event has unexpected payout/fee.", claimedEvent3?.args);
        }
      } catch (claimError3) {
        console.error("❌ Error claiming for User3:", claimError3.message);
      }

      // User4 (Prediction 4: DISAGREE) - Should get a payout based on score
      try {
        console.log(`Attempting claim for User4 (Prediction 4 - DISAGREE)...`);
        const balanceBefore4 = await ethers.provider.getBalance(user4.address);
        const claimTx4 = await market.connect(user4).claimRewards(marketId, 4);
        const claimReceipt4 = await claimTx4.wait();
        const gasUsed4 = claimReceipt4.gasUsed * claimReceipt4.gasPrice;
        const balanceAfter4 = await ethers.provider.getBalance(user4.address);
        const claimedEvent4 = claimReceipt4.logs.find((log) => log.fragment?.name === "PredictionClaimed");
        if (claimedEvent4) {
          const payout4 = claimedEvent4.args.payout;
          const fee4 = claimedEvent4.args.fee;
          console.log(`✅ User4 claimed successfully (Payout=${ethers.formatEther(payout4)} ETH, Fee=${ethers.formatEther(fee4)} ETH).`);
          const expectedBalanceChange4 = payout4 - gasUsed4;
          const actualBalanceChange4 = balanceAfter4 - balanceBefore4;
          console.log(`   Balance change: Actual=${ethers.formatEther(actualBalanceChange4)} ETH vs Expected(Payout-Gas)=${ethers.formatEther(expectedBalanceChange4)} ETH`);
        } else {
          console.error("❌ User4 claim did not emit PredictionClaimed event.");
        }
      } catch (claimError4) {
        console.error("❌ Error claiming for User4:", claimError4.message);
      }

      // Verify Total Claimed Value for Market 1
      const trackerAfterClaims = await market.getPredictionTracker(marketId);
      const totalStaked = trackerAfterClaims.totalAgreeValue + trackerAfterClaims.totalDisagreeValue;
      console.log(`\nTotal Staked in Market 1: ${ethers.formatEther(totalStaked)} ETH`);
      console.log(`Total Claimed (Market 1): ${ethers.formatEther(trackerAfterClaims.totalValueClaimed)} ETH`);
      if (trackerAfterClaims.totalValueClaimed <= totalStaked) {
        console.log("✅ Total claimed (Market 1) is <= total staked.");
      } else {
        console.error("❌ ERROR: Total claimed exceeds total staked (Market 1)!");
      }
      // --- End Claim Tests (Market 1) ---
    } catch (revealOrTrackError) {
      console.error("❌ Error calling market.resolve or trackPredictions early:", revealOrTrackError);
      // Note: The MarketNotEnded check was removed from reveal, so errors here are likely other issues.
    }
  } else {
    console.log("\nSkipping early resolution test: Necessary ZK proof results not available.");
    if (!hasNoteEarly) {
      console.log("(Reason: getZkNote did not find a community note)");
    } else if (!zkEmbeddingResult?.encoded) {
      console.log("(Reason: Failed to get encoded embedding bytes)");
    } else if (tweetProofBytesEarly === "0x") {
      console.log("(Reason: Missing tweet proof data)");
    } else if (embeddingProofBytesEarly === "0x") {
      console.log("(Reason: Missing embedding proof data)");
    }
  }

  return;

  // --- Test Resolution AFTER Deadline (No Community Note) for Market 2 ---
  console.log("\n\n=== TESTING RESOLUTION AFTER DEADLINE (NO NOTE) - Market 2 ===");

  // 1. Advance time past deadline for Market 2
  console.log("Advancing time past Market 2 deadline...");
  const market2Config = await market.getMarket(marketId2);
  const market2Deadline = Number(market2Config.deadline);
  const currentTime = (await ethers.provider.getBlock("latest")).timestamp;
  const timeToAdvance = market2Deadline - currentTime + 60;
  if (timeToAdvance > 0) {
    await helpers.increaseTime(timeToAdvance);
    console.log(`Advanced time by ${timeToAdvance} seconds.`);
  } else {
    console.log("Time is already past deadline.");
  }

  // 2. Call market.resolveWithoutNote (using default owner signer)
  console.log(`Attempting resolution for Market ID: ${marketId2} via market.resolveWithoutNote...`);
  try {
    console.log("Calling market.resolveWithoutNote (as owner) for Market 2...");
    // Call the function using the standard market instance (connected to owner)
    const resolveTxM2 = await market.resolveWithoutNote(marketId2);
    await resolveTxM2.wait();
    console.log("✅ Market 2 resolved successfully (hasNote=false).");

    // --- Verification Checks After Resolve (Market 2) ---
    console.log("\nVerifying state after resolve (Market 2)...");
    const marketDataM2 = await market.getMarket(marketId2);
    const marketStatusM2 = marketDataM2.status;
    const expectedStatusRevealedM2 = 1; // REVEALED
    if (Number(marketStatusM2) === expectedStatusRevealedM2) {
      console.log(`✅ Market 2 status is REVEALED (${marketStatusM2}) as expected.`);
    } else {
      console.error(`❌ Market 2 status is NOT REVEALED. Expected ${expectedStatusRevealedM2}, got ${marketStatusM2}`);
    }
    const marketOutcomeM2 = await market.getOutcome(marketId2);
    console.log(`Outcome stored (Market 2): hasNote=${marketOutcomeM2.hasNote}`); // Should be false

    // Check Predictions fail
    try {
      await market.connect(user2).predict(marketId2, true, "", "0x", { value: ethers.parseEther("0.01") });
      console.error("❌ Test Failed: Prediction succeeded on Market 2 (REVEALED).");
    } catch (predictionErrorM2) {
      if (predictionErrorM2.message.includes("MarketClosed")) {
        console.log("✅ Prediction correctly failed on Market 2 (REVEALED).");
      } else {
        console.warn("⚠️ Prediction failed on Market 2, unexpected reason:", predictionErrorM2.message);
      }
    }
    // --- End Verification Checks ---

    // 4. Call finalizeScores for Market 2
    console.log("\nFinalizing scores (Market 2)...");
    const finalizeTxM2 = await market.finalizeScores(marketId2);
    await finalizeTxM2.wait();
    const marketStatusAfterFinalizeM2 = (await market.getMarket(marketId2)).status;
    const expectedStatusTrackedM2 = 2; // TRACKED
    if (Number(marketStatusAfterFinalizeM2) === expectedStatusTrackedM2) {
      console.log(`✅ Market 2 status is TRACKED (${marketStatusAfterFinalizeM2}) as expected (since hasNote=false).`);
    } else {
      console.error(`❌ Market 2 status is NOT TRACKED. Expected ${expectedStatusTrackedM2}, got ${marketStatusAfterFinalizeM2}`);
    }

    // 5. Test Claims for Market 2 (AGREE winners)
    console.log("\n--- Testing Claim Rewards (Market 2 - AGREE Wins) --- ");
    const trackerM2 = await market.getPredictionTracker(marketId2);
    const numPredictionsM2 = trackerM2.numPredictions;

    // Log individual predictions before claims AND calculate expected payout
    console.log("\n--- Checking Individual Predictions for Market 2 Before Claims (with Expected Payout) ---");
    console.log(`Total predictions recorded: ${numPredictionsM2}`);
    try {
      // Fetch common data needed for calculations once
      const outcomeDataM2_Calc = await market.getOutcome(marketId2);
      const trackerDataM2_Calc = await market.getPredictionTracker(marketId2);
      const totalMarketValueWeiM2 = trackerDataM2_Calc.totalAgreeValue + trackerDataM2_Calc.totalDisagreeValue;
      // Use ethers.Zero
      let totalWinningScoreM2 = ethers.Zero;
      let isAgreeWinningSide = false;

      if (!outcomeDataM2_Calc.hasNote) {
        // Agree wins
        isAgreeWinningSide = true;
        totalWinningScoreM2 = await market.totalWeightedAgreeScores(marketId2);
        console.log(`  Market Outcome: No Note (Agree Wins). Total Weighted AGREE Score (WAD): ${ethers.formatUnits(totalWinningScoreM2, 18)}`);
      } else {
        // Disagree wins
        totalWinningScoreM2 = await resolver.wadTotalWeightedScores(marketId2);
        console.log(`  Market Outcome: Has Note (Disagree Wins). Total Weighted DISAGREE Score (WAD): ${ethers.formatUnits(totalWinningScoreM2, 18)}`);
      }
      console.log(`  Total Pool to Distribute: ${ethers.formatEther(totalMarketValueWeiM2)} ETH`);
      console.log("--- Predictions & Expected Payouts ---");

      let individualScore;
      for (let predId = 1; predId <= numPredictionsM2; predId++) {
        individualScore = await market.weightedAgreeScores(marketId2, predId);
        console.log(`  Prediction ${predId}: Individual AGREE Score (WAD): ${ethers.formatUnits(individualScore, 18)}`);
      }
    } catch (getPredError) {
      console.error(`   Error fetching/calculating prediction data for Market 2:`, getPredError);
    }
    console.log("--- End Prediction Check & Calculation ---");

    // Now proceed with actual claims
    for (let predId = 1; predId <= numPredictionsM2; predId++) {
      const predData = await market.getPrediction(marketId2, predId);
      const predictorSigner = await ethers.getSigner(predData.predictor); // Use ethers.getSigner
      try {
        console.log(`Attempting claim for Predictor ${predData.predictor.substring(0, 6)} (Prediction ${predId} - IsAgree=${predData.isAgree})...`);
        const balanceBefore = await ethers.provider.getBalance(predData.predictor); // Use ethers.provider
        const claimTx = await market.connect(predictorSigner).claimRewards(marketId2, predId);
        const claimReceipt = await claimTx.wait();
        const gasUsed = claimReceipt.gasUsed * claimReceipt.gasPrice;
        const balanceAfter = await ethers.provider.getBalance(predData.predictor); // Use ethers.provider
        const claimedEvent = claimReceipt.logs.find((log) => log.fragment?.name === "PredictionClaimed");

        if (claimedEvent) {
          const payout = claimedEvent.args.payout;
          console.log(`  ✅ Claimed successfully (Payout=${ethers.formatEther(payout)} ETH)`); // Use ethers.formatEther
          if (predData.isAgree) {
            // Rough balance check for winners
            const actualChange = balanceAfter - balanceBefore;
            console.log(`     Balance change: ~${ethers.formatEther(actualChange + gasUsed)} ETH (Payout - Gas)`); // Use ethers.formatEther
          } else {
            if (Number(payout) !== 0) console.error("   ❌ ERROR: Disagree predictor got non-zero payout!");
          }
        } else {
          console.error("   ❌ Claim did not emit PredictionClaimed event.");
        }
      } catch (claimError) {
        if (predData.isAgree) {
          console.error(`   ❌ Error claiming for AGREE predictor ${predData.predictor.substring(0, 6)}:`, claimError.message);
        } else {
          console.log(`   ✅ Claim correctly failed for DISAGREE predictor ${predData.predictor.substring(0, 6)} (as expected).`);
          // Optional: Check for specific revert reason if needed
        }
      }
    }
    // Verify Total Claimed Value for Market 2
    const trackerM2AfterClaims = await market.getPredictionTracker(marketId2);
    const totalStakedM2 = trackerM2AfterClaims.totalAgreeValue + trackerM2AfterClaims.totalDisagreeValue;
    console.log(`\nTotal Staked (Market 2): ${ethers.formatEther(totalStakedM2)} ETH`); // Use ethers.formatEther
    console.log(`Total Claimed (Market 2): ${ethers.formatEther(trackerM2AfterClaims.totalValueClaimed)} ETH`); // Use ethers.formatEther
    if (trackerM2AfterClaims.totalValueClaimed <= totalStakedM2) {
      console.log("✅ Total claimed (Market 2) is less than or equal to total staked.");
    } else {
      console.error("❌ ERROR: Total claimed exceeds total staked (Market 2)!");
    }
    // --- End Claim Tests (Market 2) ---

    // --- Test Re-Claim Failure (Market 2) ---
    console.log("\n--- Testing Re-Claim Failure (Market 2) ---");
    const predictionIdToReclaim = 1; // User 2 made prediction 1 in Market 2
    const userToReclaim = user2;
    try {
      console.log(`Attempting re-claim for User ${userToReclaim.address.substring(0, 6)} (Prediction ${predictionIdToReclaim})...`);
      const reclaimTx = await market.connect(userToReclaim).claimRewards(marketId2, predictionIdToReclaim);
      await reclaimTx.wait();
      console.error("❌ ERROR: Re-claim succeeded but should have failed!");
    } catch (reclaimError) {
      if (reclaimError.message.includes("PredictionAlreadyClaimed")) {
        // Check for specific revert
        console.log("✅ Re-claim correctly failed with PredictionAlreadyClaimed.");
      } else {
        console.warn("⚠️ Re-claim failed, but for an unexpected reason:", reclaimError.message);
      }
    }
    // --- End Re-Claim Test ---
  } catch (resolveErrorM2) {
    console.error("❌ Error during Market 2 resolution (resolveWithoutNote):", resolveErrorM2);
  }

  // TODO: Add test for resolution using second market for AFTER deadline (No Community Note)
  // 1. Advance time of hwole system by 24 hours
  // 2. Call market.resolve with hasNote = false and no need to attach proofs.
  // 3. in CNMarket.resolve, we simply check if market.end < block.timestamp and if so, we can reveal.
  // 4. Call finalizeScores

  console.log("\n--- E2E Test Potentially Incomplete (See TODOs) ---");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
