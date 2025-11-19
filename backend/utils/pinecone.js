const { Pinecone } = require("@pinecone-database/pinecone");

if (!process.env.PINECONE_API_KEY) {
  console.error("❌ Missing PINECONE_API_KEY env variable");
}
if (!process.env.PINECONE_INDEX) {
  console.error("❌ Missing PINECONE_INDEX env variable");
}

// Flask service uses sentence-transformers/all-MiniLM-L6-v2 (384 dimensions)
const EXPECTED_DIM = parseInt(process.env.PINECONE_DIMENSION || "384", 10);

const client = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const indexName = process.env.PINECONE_INDEX;
const index = client.Index(indexName);

// Lightweight sanity test function (not exported by default)
async function _ping() {
  if (process.env.PINECONE_SKIP_PING === '1') return;
  try {
    // Upsert & delete a tiny test vector to confirm connectivity & dimension
    const testId = `ping-${Date.now()}`;
    const fake = new Array(EXPECTED_DIM).fill(0);
    await index.upsert([{ id: testId, values: fake, metadata: { type: 'ping' } }]);
    await index.deleteOne(testId);
    console.log(`✅ Pinecone connectivity OK (index=${indexName}, expectedDim=${EXPECTED_DIM})`);
  } catch (e) {
    console.error("❌ Pinecone connectivity / dimension check failed:", e.message);
    console.error("   ➜ If dimension mismatch: recreate index with dimension", EXPECTED_DIM);
  }
}

_ping();

module.exports = { index, EXPECTED_DIM };