const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Deploying contracts...");

  // Load the compiled artifacts
  const IdGeneratorArtifact = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../build/IdGenerator.json"), "utf8"));

  const CNMarketArtifact = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../build/CNMarket.json"), "utf8"));

  // Deploy IdGenerator
  const IdGeneratorFactory = await hre.ethers.getContractFactory("IdGenerator", {
    abi: IdGeneratorArtifact.abi,
    bytecode: IdGeneratorArtifact.bytecode,
  });

  const idGenerator = await IdGeneratorFactory.deploy();
  await idGenerator.waitForDeployment();
  console.log(`IdGenerator deployed to: ${await idGenerator.getAddress()}`);

  // Deploy CNMarket
  const CNMarketFactory = await hre.ethers.getContractFactory("CNMarket", {
    abi: CNMarketArtifact.abi,
    bytecode: CNMarketArtifact.bytecode,
  });

  const cnMarket = await CNMarketFactory.deploy();
  await cnMarket.waitForDeployment();
  console.log(`CNMarket deployed to: ${await cnMarket.getAddress()}`);

  // Test market creation
  const tweetId = "1234567890";
  const tweetText = "This is a test tweet";
  const minValue = hre.ethers.parseEther("0.01");
  const wadFeeFraction = hre.ethers.parseUnits("0.05", 18); // 5% fee

  console.log("Creating market...");
  const tx = await cnMarket.createMarket(
    tweetId,
    tweetText,
    minValue,
    wadFeeFraction,
    (
      await hre.ethers.getSigners()
    )[0].address // fee recipient
  );

  const receipt = await tx.wait();
  console.log("Market created!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
