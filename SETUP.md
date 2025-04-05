# communitynotes.fun - Getting Started

Follow these steps to set up and run the project locally.

## Prerequisites

- Node.js and npm installed. You can download them from [https://nodejs.org/](https://nodejs.org/). I use Node v18.17.0.

## Setup

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/communitynotes-fun/cn-contracts
    cd cn-contracts
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Install Reclaim Protocol SDK:**

    ```bash
    npm install @reclaimprotocol/js-sdk
    ```

4.  **Install zkFetch and download necessary files:**
    ```bash
    npm i @reclaimprotocol/zk-fetch
    node node_modules/@reclaimprotocol/zk-symmetric-crypto/lib/scripts/download-files
    ```

## Running the End-to-End Flow

1.  **Start a local Hardhat node (if needed):** _In a separate terminal:_

    ```bash
    npx hardhat node
    ```

2.  **Run the test script:** _In your original terminal:_

    ```bash
    npx hardhat run scripts/test/e2e.js --network localhost
    ```

    This should execute the end-to-end flow defined in the `e2e.js` script against your local Hardhat network.

## Deploying to Mainnet

1. **Polygon**
   ```bash
   npx hardhat run scripts/deployPolygon.js --network polygon
   ```
