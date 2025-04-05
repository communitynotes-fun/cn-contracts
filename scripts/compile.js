const fs = require("fs");
const path = require("path");
const solc = require("solc");
const compilerConfig = require("../compiler.config");

function findSolidityFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      findSolidityFiles(filePath, fileList);
    } else if (file.endsWith(".sol")) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

function getSources() {
  const contractsDir = path.resolve(__dirname, "../contracts");
  const solidityFiles = findSolidityFiles(contractsDir);

  const sources = {};
  solidityFiles.forEach((file) => {
    const relativePath = path.relative(contractsDir, file);
    sources[relativePath] = { content: fs.readFileSync(file, "utf8") };
  });

  return sources;
}

function compile() {
  const sources = getSources();

  const input = {
    language: "Solidity",
    sources,
    settings: {
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode"],
        },
      },
      ...compilerConfig.settings,
    },
  };

  console.log(`Compiling contracts with solc ${compilerConfig.solidity}...`);
  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    output.errors.forEach((error) => {
      console.error(error.formattedMessage);
    });

    if (output.errors.some((error) => error.severity === "error")) {
      throw new Error("Compilation failed");
    }
  }

  const buildDir = path.resolve(__dirname, "../build");
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir);
  }

  for (const contractFile in output.contracts) {
    for (const contractName in output.contracts[contractFile]) {
      const contract = output.contracts[contractFile][contractName];

      fs.writeFileSync(
        path.resolve(buildDir, `${contractName}.json`),
        JSON.stringify(
          {
            abi: contract.abi,
            bytecode: contract.evm.bytecode.object,
          },
          null,
          2
        )
      );

      console.log(`${contractName} compiled successfully`);
    }
  }
}

compile();
