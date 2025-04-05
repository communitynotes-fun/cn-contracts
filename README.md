# communitynotes.fun

A prediction market layer for X’s Community Notes—designed to incentivize faster and more accurate fact-checking through crypto-native incentives.

**communitynotes.fun** allows users to stake **POL** and predict whether a tweet will receive a Community Note and what that note will say. Accurate predictions earn rewards,
creating a financial incentive to surface truthful, high-quality fact-checks quickly—rather than waiting hours for the official note to appear.

Community Notes today often take too long to show up—on average, about seven hours—by which time misleading content may have already gone viral. Our system turns fact-checking into
a market-based game, where users are rewarded for quickly identifying problematic tweets and crafting accurate fact-checks before consensus is reached.

By combining prediction markets, verifiable web2 data, and onchain logic, we aim to accelerate the speed and reliability of decentralized fact-checking—complementing X’s native
system rather than replacing it.

---

## How It’s Made

### Verifiable Web2 Data via zkTLS

The core technical innovation behind this project is the use of **zkTLS**, a novel zero-knowledge primitive that allows us to fetch data from traditional web2 endpoints while
proving its authenticity. In our case, we fetch tweet metadata—specifically, whether a tweet has received a Community Note—directly from **Twitter’s CDN**. The zkTLS proofs verify
that the data was fetched from the correct URL and hasn’t been tampered with. This allows us to treat web2 data like an oracle that can be safely used by smart contracts.

---

### Prediction Market Flow

The smart contracts deployed on **Polygon PoS** manage the full lifecycle of each prediction market:

1. **createMarket(tweetId)**

   - Any user can create a market by submitting a Tweet ID.
   - A 24-hour countdown begins from the time of creation.

2. **predict(direction, stake, [noteGuess])**

   - Users stake **POL** and submit a prediction:
     - **Yes**: The tweet is factual and will not receive a Community Note.
     - **No**: The tweet will receive a Community Note.
   - For “No” predictions, users must also submit a fact-check draft. This is embedded offchain using **OpenAI’s text embedding API**, converted into a 768-dimensional vector, and
     stored onchain as a hex string.

3. **resolve()**

   - If a Community Note appears before the deadline, zk-proofs generated via **Reclaim Protocol** are submitted to verify:
     - The Community Note was fetched from Twitter’s official CDN.
     - The embedding was generated using OpenAI’s real API.
   - These proofs are verified onchain. “No” predictions are scored by comparing their embeddings to the official one using an onchain cosine similarity check.
   - The total reward pool is distributed among accurate predictors, factoring in stake size, timing, and similarity score.

4. **resolveWithoutNote()**

   - If no Community Note appears after 24 hours, the market can be resolved manually.
   - In this case, the “Yes” side wins and receives rewards proportional to stake and prediction time.

5. **finalizeScores()**

   - Called post-resolution to calculate final rewards and unlock payouts.

6. **claim()**
   - Users can connect their wallet, view their prediction history, and claim their rewards.

---

### Frontend and Infrastructure

- **Frontend**: Built with **Next.js** and styled with **TailwindCSS** for a clean, responsive UI.
- **Event Indexing**: Powered by **Curvegrid’s MultiBaas**, which listens to contract events and provides an easy API layer for querying market data.
- **Blockchain**: Deployed on **Polygon PoS**, selected for its low fees and fast finality—ideal for fast-moving prediction markets.
- **Token**: The system uses **POL** for staking and rewards.
- **ENS**: Integrated for better UX and readable wallet identities.
