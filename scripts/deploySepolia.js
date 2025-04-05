// scripts/deploySepolia.js

const hre = require("hardhat");
const { execSync } = require("child_process");

async function main() {
  const { ethers, network } = hre;
  const networkName = network.name;
  const [deployer] = await ethers.getSigners();

  console.log(`\nDeploying contracts to ${networkName} network using account: ${deployer.address}`);
  console.log(`Account balance: ${(await ethers.provider.getBalance(deployer.address)).toString()}`);

  const EMBEDDING_DIMENSION = 1536;
  let reclaimConstructorArgs = [];

  // --- 1. Set Reclaim ---
  const reclaimAddress = "0xF90085f5Fd1a3bEb8678623409b3811eCeC5f6A5";

  // --- 2. Deploy TweetVerifier ---
  console.log("\nDeploying TweetVerifier...");
  const TweetVerifierFactory = await ethers.getContractFactory("TweetVerifier");
  const tweetVerifier = await TweetVerifierFactory.deploy(reclaimAddress);
  await tweetVerifier.waitForDeployment();
  const tweetVerifierAddress = await tweetVerifier.getAddress();
  console.log(`-> TweetVerifier contract deployed to: ${tweetVerifierAddress}`);

  // --- 3. Deploy EmbeddingVerifier ---
  console.log("\nDeploying EmbeddingVerifier...");
  const EmbeddingVerifierFactory = await ethers.getContractFactory("EmbeddingVerifier");
  const embeddingVerifier = await EmbeddingVerifierFactory.deploy(reclaimAddress, EMBEDDING_DIMENSION);
  await embeddingVerifier.waitForDeployment();
  const embeddingVerifierAddress = await embeddingVerifier.getAddress();
  console.log(`-> EmbeddingVerifier contract deployed to: ${embeddingVerifierAddress}`);

  // --- 4. Deploy CNMarket ---
  console.log("\nDeploying CNMarket...");
  const CNMarketFactory = await ethers.getContractFactory("CNMarket");
  const market = await CNMarketFactory.deploy(tweetVerifierAddress, embeddingVerifierAddress);
  await market.waitForDeployment();
  const marketAddress = await market.getAddress();
  console.log(`-> CNMarket contract deployed to: ${marketAddress}`);

  // --- 5. Deploy CNMarketResolver ---
  console.log("\nDeploying CNMarketResolver...");
  const CNMarketResolverFactory = await ethers.getContractFactory("CNMarketResolver");
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

  // Optional: You might want to automatically set the resolver on the market here
  console.log("\nSetting resolver on CNMarket...");
  const tx = await market.setResolver(resolverAddress); // Assuming deployer is owner/creator initially
  await tx.wait();
  console.log("Resolver set on CNMarket.");

  // --- Automatic Verification ---
  console.log("\n--- Starting Contract Verification ---");

  console.log("Waiting 30 seconds before verification...");
  await new Promise((resolve) => setTimeout(resolve, 30000));

  const verifyContract = (address, args = []) => {
    const argsString = args.map((arg) => `${arg}`).join(" ");
    const command = `npx hardhat verify --network ${networkName} ${address} ${argsString}`;
    console.log(`\nRunning: ${command}`);
    try {
      const result = execSync(command, { stdio: "inherit" });
      console.log(`✅ Verification successful for ${address}`);
    } catch (error) {
      console.error(`❌ Verification failed for ${address}: ${error.message}`);
    }
  };

  verifyContract(tweetVerifierAddress, [reclaimAddress]);
  verifyContract(embeddingVerifierAddress, [reclaimAddress, EMBEDDING_DIMENSION]);
  verifyContract(marketAddress, [tweetVerifierAddress, embeddingVerifierAddress]);
  verifyContract(resolverAddress, [marketAddress]);
  console.log("\n--- Verification attempted! ---");

  // TweetVerifier
  // npx hardhat verify --network baseSepolia 0x817Ac62A3DD2cf2d9cfa39559F873a77Dda34544 "0xF90085f5Fd1a3bEb8678623409b3811eCeC5f6A5"
  // EmbeddingVerifier
  // npx hardhat verify --network baseSepolia 0xd5f8958e6DEDE4774d7682e07bf50Ed49EA6C49f "0xF90085f5Fd1a3bEb8678623409b3811eCeC5f6A5" 1536
  // CNMarket
  // npx hardhat verify --network baseSepolia 0x6647d16464337205936B55111452eae638DedFbc "0x817Ac62A3DD2cf2d9cfa39559F873a77Dda34544" "0xd5f8958e6DEDE4774d7682e07bf50Ed49EA6C49f"
  // CNMarketResolver
  // npx hardhat verify --network baseSepolia 0x8d76EF8869329F9f2FFDA79d16F4C36d59208b6c "0x6647d16464337205936B55111452eae638DedFbc"
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
