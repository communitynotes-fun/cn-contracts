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

  const TweetVerifier = await ethers.getContractFactory("TweetVerifier");
  const tweetVerifier = await TweetVerifier.deploy();
  await tweetVerifier.waitForDeployment();
  console.log("TweetVerifier deployed to:", await tweetVerifier.getAddress());

  const EmbeddingVerifier = await ethers.getContractFactory("EmbeddingVerifier");
  const embeddingVerifier = await EmbeddingVerifier.deploy(768);
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

  // Set the resolver for the market
  console.log("\nSetting resolver for the market...");
  await market.setResolver(marketId, await resolver.getAddress());
  console.log("Resolver set to:", await resolver.getAddress());

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
    "This tweet makes claims about election results that are not supported by official data. According to the State Election Commission's final tally released on their website (https://election.gov/results/2024), the actual margin was 52% to 48%, not 70% to 30% as claimed. The tweet appears to be citing unofficial exit polls rather than verified results.";

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
  const marketResolver = await ethers.getContractAt("CNMarketResolver", await market.resolvers(marketId));
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
  const reasonText2 =
    "The tweet contains misleading information about the economic growth rate. According to the latest GDP report from the Bureau of Economic Analysis (https://www.bea.gov/news/2024/q1-gdp), the actual growth rate was 2.1%, not the 5% claimed in the tweet. The tweet appears to be using outdated or incorrect data sources.";

  // Generate embedding for the second fact-check
  console.log("\nGenerating embedding for second fact-check comment...");

  // Encode the embedding for contract use
  console.log("Encoding embedding for contract...");
  const { encoded: encoded2 } = await helpers.generateAndEncodeEmbedding(reasonText2);

  // Make second DISAGREE prediction (User4)
  console.log("\nMaking DISAGREE prediction (User4)...");
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
  console.log("\nDISAGREE Prediction made:");
  console.log("Prediction ID:", disagreePredictionEvent2.args[1]);
  console.log("Predictor:", disagreePredictionEvent2.args[2]);
  console.log("Value:", ethers.formatEther(disagreePredictionEvent2.args[4]), "ETH");

  // Verify second DISAGREE prediction details
  const disagreePrediction2 = await market.getPrediction(marketId, disagreePredictionEvent2.args[1]);
  console.log("\nDISAGREE Prediction details from contract:");
  console.log("Predictor:", disagreePrediction2.predictor);
  console.log("Value:", ethers.formatEther(disagreePrediction2.value), "ETH");
  console.log("Is Agree:", disagreePrediction2.isAgree);
  console.log("Claimed:", disagreePrediction2.claimed);
  console.log("Timestamp:", new Date(Number(disagreePrediction2.timestamp) * 1000).toLocaleString());

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

  // Set the resolver for the second market
  console.log("\nSetting resolver for the second market...");
  await market.setResolver(marketId2, await resolver.getAddress());
  console.log("Resolver set to:", await resolver.getAddress());

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

  // Verify prediction tracker totals for second market
  const tracker2 = await market.getPredictionTracker(marketId2);
  console.log("\nFinal Prediction Tracker Status for Market 2:");
  console.log("Total Predictions:", tracker2.numPredictions);
  console.log("Total AGREE Value:", ethers.formatEther(tracker2.totalAgreeValue), "ETH");
  console.log("Total DISAGREE Value:", ethers.formatEther(tracker2.totalDisagreeValue), "ETH");

  // Verify that markets are stored independently
  console.log("\n--- Verifying Independent Market Storage ---");
  console.log("Market 1 Tweet ID:", await market.markets(marketId).then((m) => m.tweetId));
  console.log("Market 2 Tweet ID:", await market.markets(marketId2).then((m) => m.tweetId));
  console.log("Market 1 Total Predictions:", tracker.numPredictions);
  console.log("Market 2 Total Predictions:", tracker2.numPredictions);
  console.log("Market 1 Total AGREE Value:", ethers.formatEther(tracker.totalAgreeValue), "ETH");
  console.log("Market 2 Total AGREE Value:", ethers.formatEther(tracker2.totalAgreeValue), "ETH");
  console.log("Market 1 Total DISAGREE Value:", ethers.formatEther(tracker.totalDisagreeValue), "ETH");
  console.log("Market 2 Total DISAGREE Value:", ethers.formatEther(tracker2.totalDisagreeValue), "ETH");

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

  // ===== MARKET RESOLUTION FLOWS =====
  console.log("\n\n=== TESTING MARKET RESOLUTION FLOWS ===");

  // ===== FLOW 1: MARKET WITH COMMUNITY NOTE =====
  console.log("\n--- Testing Market Resolution Flow 1: With Community Note ---");

  // TODO: In a real implementation, you would:
  // 1. Use Reclaim Protocol to fetch the tweet data and generate a ZK proof
  // 2. Generate an embedding for the community note
  // 3. Generate a proof for the embedding

  // For testing purposes, we'll simulate these with mock data
  console.log("\nSimulating tweet verification with community note...");

  // Generate a mock embedding for the note
  const noteText =
    "This tweet contains misleading information about economic growth rates. According to official government data, the actual growth rate was 2.1%, not 5% as claimed.";
  console.log("Generating mock embedding for the community note...");
  const { encoded: noteEmbedding } = await helpers.generateAndEncodeEmbedding(noteText);

  // Create mock proofs (in a real implementation, these would be ZK proofs from Reclaim)
  const mockTweetProof = "0x" + "1".repeat(64); // Mock tweet proof
  const mockEmbeddingProof = "0x" + "2".repeat(64); // Mock embedding proof

  // Reveal the outcome with verification
  console.log("\nRevealing market outcome with verification...");
  await resolver.reveal(
    marketId,
    true, // hasNote
    noteText,
    noteEmbedding,
    mockTweetProof,
    mockEmbeddingProof
  );

  // Verify market status is now REVEALED
  const marketStatusAfterReveal = await market.getMarket(marketId);
  console.log("Market status after reveal:", marketStatusAfterReveal.status);

  // Track predictions to calculate similarity scores
  console.log("\nTracking predictions to calculate similarity scores...");
  await resolver.trackPredictions(marketId);

  // Verify market status is now TRACKED
  const marketStatusAfterTrack = await market.getMarket(marketId);
  console.log("Market status after tracking:", marketStatusAfterTrack.status);

  // Get the outcome
  const outcome = await market.getOutcome(marketId);
  console.log("\nMarket outcome:");
  console.log("Has note:", outcome.hasNote);
  console.log("Note text:", outcome.noteText);
  console.log("Reveal timestamp:", new Date(Number(outcome.revealTimestamp) * 1000).toLocaleString());

  // TODO: Implement claim function to allow users to claim their rewards
  // This would involve:
  // 1. Calculating rewards based on prediction accuracy
  // 2. Allowing users to claim their rewards

  // ===== FLOW 2: MARKET WITHOUT COMMUNITY NOTE =====
  console.log("\n--- Testing Market Resolution Flow 2: Without Community Note ---");

  // Create mock proof (in a real implementation, this would be a ZK proof from Reclaim)
  const mockTweetProof2 = "0x" + "3".repeat(64); // Mock tweet proof

  // Reveal the outcome with verification
  console.log("\nRevealing market outcome with verification...");
  await resolver.reveal(
    marketId2,
    false, // hasNote
    "", // no note text
    "0x", // no note embedding
    mockTweetProof2,
    "0x" // no embedding proof needed
  );

  // Verify market status is now REVEALED
  const marketStatusAfterReveal2 = await market.getMarket(marketId2);
  console.log("Market status after reveal:", marketStatusAfterReveal2.status);

  // Track predictions (should be quick since there's no note)
  console.log("\nTracking predictions...");
  await resolver.trackPredictions(marketId2);

  // Verify market status is now TRACKED
  const marketStatusAfterTrack2 = await market.getMarket(marketId2);
  console.log("Market status after tracking:", marketStatusAfterTrack2.status);

  // Get the outcome
  const outcome2 = await market.getOutcome(marketId2);
  console.log("\nMarket outcome:");
  console.log("Has note:", outcome2.hasNote);
  console.log("Reveal timestamp:", new Date(Number(outcome2.revealTimestamp) * 1000).toLocaleString());

  // TODO: Implement claim function to allow users to claim their rewards
  // This would involve:
  // 1. Calculating rewards based on prediction accuracy
  // 2. Allowing users to claim their rewards

  console.log("\n--- E2E Test Complete ---");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
