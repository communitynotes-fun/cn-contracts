// scripts/deployPolygon.js

const hre = require("hardhat");
const { execSync } = require("child_process");

async function main() {
  const { ethers, network } = hre;
  const networkName = network.name; // This will be 'polygon' when you run --network polygon
  const [deployer] = await ethers.getSigners();

  console.log(`\nDeploying contracts to ${networkName} network using account: ${deployer.address}`);
  console.log(`Account balance: ${(await ethers.provider.getBalance(deployer.address)).toString()}`);

  const EMBEDDING_DIMENSION = 768;

  // --- 1. Set Reclaim ---
  // IMPORTANT: Verify if this Reclaim address is correct for Polygon Mainnet
  // You might need to deploy a new instance or find the official Polygon address.
  const reclaimAddress = "0xd6534f52CEB3d0139b915bc0C3278a94687fA5C7";
  console.log(`Using Reclaim address: ${reclaimAddress} for network ${networkName}`);

  // --- 2. Deploy TweetVerifier ---
  console.log("\nDeploying TweetVerifier...");
  const TweetVerifierFactory = await ethers.getContractFactory("TweetVerifier");
  // Pass reclaimAddress specific to the network
  const tweetVerifier = await TweetVerifierFactory.deploy(reclaimAddress);
  await tweetVerifier.waitForDeployment();
  const tweetVerifierAddress = await tweetVerifier.getAddress();
  console.log(`-> TweetVerifier contract deployed to: ${tweetVerifierAddress}`);

  // --- 3. Deploy EmbeddingVerifier ---
  console.log("\nDeploying EmbeddingVerifier...");
  const EmbeddingVerifierFactory = await ethers.getContractFactory("EmbeddingVerifier");
  // Pass reclaimAddress specific to the network and dimension
  const embeddingVerifier = await EmbeddingVerifierFactory.deploy(reclaimAddress, EMBEDDING_DIMENSION);
  await embeddingVerifier.waitForDeployment();
  const embeddingVerifierAddress = await embeddingVerifier.getAddress();
  console.log(`-> EmbeddingVerifier contract deployed to: ${embeddingVerifierAddress}`);

  // --- 4. Deploy CNMarket ---
  console.log("\nDeploying CNMarket...");
  const CNMarketFactory = await ethers.getContractFactory("CNMarket");
  // Pass the newly deployed verifier addresses
  const market = await CNMarketFactory.deploy(tweetVerifierAddress, embeddingVerifierAddress);
  await market.waitForDeployment();
  const marketAddress = await market.getAddress();
  console.log(`-> CNMarket contract deployed to: ${marketAddress}`);

  // --- 5. Deploy CNMarketResolver ---
  console.log("\nDeploying CNMarketResolver...");
  const CNMarketResolverFactory = await ethers.getContractFactory("CNMarketResolver");
  // Pass the newly deployed market address
  const resolver = await CNMarketResolverFactory.deploy(marketAddress);
  await resolver.waitForDeployment();
  const resolverAddress = await resolver.getAddress();
  console.log(`-> CNMarketResolver contract deployed to: ${resolverAddress}`);

  console.log("\n--- Deployment Summary ---");
  console.log(`Network:           ${networkName}`);
  console.log(`Reclaim:           ${reclaimAddress}`);
  console.log(`TweetVerifier:     ${tweetVerifierAddress}`);
  console.log(`EmbeddingVerifier: ${embeddingVerifierAddress}`);
  console.log(`CNMarket:          ${marketAddress}`);
  console.log(`CNMarketResolver:  ${resolverAddress}`);
  console.log("\nDeployment complete!");

  console.log("\nSetting resolver on CNMarket...");
  const tx = await market.setResolver(resolverAddress);
  await tx.wait();
  console.log("Resolver set on CNMarket.");

  // --- Automatic Verification ---
  // The verification logic uses networkName, so it should work for polygon
  console.log("\n--- Starting Contract Verification ---");

  console.log("Waiting 30 seconds before verification (allowing block explorer indexing)...");
  await new Promise((resolve) => setTimeout(resolve, 30000)); // Increased wait time for mainnet

  const verifyContract = (address, args = []) => {
    // Map all args to string for the command line
    const argsString = args.map((arg) => `"${String(arg)}"`).join(" "); // Ensure args are quoted
    const command = `npx hardhat verify --network ${networkName} ${address} ${argsString}`;
    console.log(`\nRunning: ${command}`);
    try {
      // Using inherit to see the output directly, useful for debugging verification
      execSync(command, { stdio: "inherit" });
      console.log(`✅ Verification attempt finished for ${address}. Check output above.`);
    } catch (error) {
      // Catch block might not be reached if execSync throws and exits the process depending on shell config
      console.error(`❌ Verification command failed for ${address}. Error: ${error.message}`);
      // Consider not throwing here to allow other verifications to proceed
    }
  };

  console.log("\nAttempting verification for TweetVerifier...");
  verifyContract(tweetVerifierAddress, [reclaimAddress]);

  console.log("\nAttempting verification for EmbeddingVerifier...");
  verifyContract(embeddingVerifierAddress, [reclaimAddress, EMBEDDING_DIMENSION]);

  console.log("\nAttempting verification for CNMarket...");
  verifyContract(marketAddress, [tweetVerifierAddress, embeddingVerifierAddress]);

  console.log("\nAttempting verification for CNMarketResolver...");
  verifyContract(resolverAddress, [marketAddress]);

  console.log("\n--- Verification process completed ---");

  // Removed the hardcoded verification commands as the script handles it now
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment script failed:", error); // Improved error logging
    process.exit(1);
  });
