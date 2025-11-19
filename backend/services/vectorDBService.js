const { index, EXPECTED_DIM } = require("../utils/pinecone");
const Topic = require("../models/Topic");

async function upsertSyllabusItems(filename, className, syllabusId, items, metadataExtra = {}) {
  console.log('📦 Starting upsertSyllabusItems with:', {
    filename,
    className,
    syllabusId,
    itemCount: items.length
  });

  if (!Array.isArray(items)) {
    console.error('❌ Items is not an array');
    return [];
  }

  const vectorIds = [];
  const BATCH_SIZE = 100; // Upsert 100 vectors at a time to Pinecone

  // Group items by topic for better organization
  const topicMap = new Map();
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { subject, topic, embedding, chunk_index = 0, total_chunks = 1, text } = item;

    if (!embedding || !Array.isArray(embedding)) {
      console.warn(`⚠️ Skipping item ${i} — no embedding found`);
      continue;
    }
    if (embedding.length !== EXPECTED_DIM) {
      console.error(`❌ Dimension mismatch for item ${i}. Got ${embedding.length}, expected ${EXPECTED_DIM}. Skipping.`);
      continue;
    }

    // Create unique vector ID with chunk information
    const vectorId = `${filename}-${i}-chunk${chunk_index}`;
    vectorIds.push(vectorId);

    // Prepare vector for batch upsert
    const vector = {
      id: vectorId,
      values: embedding,
      metadata: {
        class: className,
        subject,
        topic,
        filename,
        chunk_index: chunk_index,
        total_chunks: total_chunks,
        text: text || topic,
        content_type: metadataExtra.material ? "material" : "syllabus",
        ...metadataExtra,
      },
    };

    // Batch vectors for upload
    if (!topicMap.has(topic)) {
      topicMap.set(topic, []);
    }
    topicMap.get(topic).push(vector);
  }

  // Batch upsert to Pinecone
  const allVectors = [];
  for (const vectors of topicMap.values()) {
    allVectors.push(...vectors);
  }

  console.log(`📊 Upserting ${allVectors.length} vectors in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < allVectors.length; i += BATCH_SIZE) {
    const batch = allVectors.slice(i, Math.min(i + BATCH_SIZE, allVectors.length));
    
    try {
      console.log(`🚀 Upserting batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allVectors.length / BATCH_SIZE)} (${batch.length} vectors)`);
      
      await index.upsert(batch);
      console.log(`✅ Batch upserted successfully`);
    } catch (pineconeError) {
      console.error(`❌ Batch upsert failed for batch starting at index ${i}:`, pineconeError.message);
      console.error('Full error:', pineconeError);
    }
  }

  // Save unique topics to MongoDB (one document per topic, not per chunk)
  const uniqueTopics = Array.from(topicMap.keys());
  console.log(`💾 Saving ${uniqueTopics.length} unique topics to MongoDB...`);

  for (const topicName of uniqueTopics) {
    try {
      // Check if topic already exists
      const existingTopic = await Topic.findOne({
        syllabusId,
        subject: items.find(item => item.topic === topicName)?.subject,
        topic: topicName,
      });

      if (!existingTopic) {
        const newTopic = new Topic({
          syllabusId,
          subject: items.find(item => item.topic === topicName)?.subject,
          topic: topicName,
          vectorId: topicMap.get(topicName)[0]?.id, // Reference first chunk
        });
        await newTopic.save();
        console.log(`✅ Saved topic to MongoDB: ${topicName}`);
      } else {
        console.log(`⏭️ Topic already exists in MongoDB: ${topicName}`);
      }
    } catch (mongoError) {
      console.error(`❌ MongoDB save failed for ${topicName}:`, mongoError);
    }
  }

  console.log('🎉 Finished upsertSyllabusItems');
  console.log(`📊 Summary: ${vectorIds.length} vectors, ${uniqueTopics.length} unique topics`);
  return vectorIds;
}

/**
 * Fetch existing embedding from Pinecone by vector ID
 * @param {string} vectorId - The vector ID to fetch
 * @returns {Array<number>|null} - Embedding vector or null if not found
 */
async function fetchEmbeddingById(vectorId) {
  try {
    const fetchResponse = await index.fetch([vectorId]);
    const record = fetchResponse.records?.[vectorId];
    
    if (record && record.values) {
      console.log(`✅ Fetched embedding for vector ID: ${vectorId}`);
      return record.values;
    }
    
    console.warn(`⚠️ No embedding found for vector ID: ${vectorId}`);
    return null;
  } catch (error) {
    console.error(`❌ Failed to fetch embedding for ${vectorId}:`, error.message);
    return null;
  }
}

/**
 * Query Pinecone by topic name to get existing embeddings
 * @param {string} topic - Topic name to search for
 * @param {Object} filters - Metadata filters (e.g., { class: "11", subject: "Physics" })
 * @returns {Array<number>|null} - First matching embedding or null
 */
async function getExistingEmbeddingForTopic(topic, filters = {}) {
  try {
    console.log(`🔍 Searching for existing embedding for topic: ${topic}`);
    
    // Query by metadata to find the topic
    const queryRequest = {
      topK: 1,
      includeMetadata: true,
      includeValues: true, // Important: include the embedding values
      filter: {
        topic: topic,
        ...filters,
      },
    };

    const queryResponse = await index.query(queryRequest);
    
    // Check if matches exist and have values
    if (!queryResponse || !queryResponse.matches || queryResponse.matches.length === 0) {
      console.warn(`⚠️ No existing embedding found for topic: ${topic}`);
      return null;
    }
    
    const match = queryResponse.matches[0];
    
    // Verify the match has actual embedding values
    if (!match.values || match.values.length === 0) {
      console.warn(`⚠️ Topic found but no embedding values for: ${topic}`);
      return null;
    }
    
    console.log(`✅ Found existing embedding for topic: ${topic} (score: ${match.score?.toFixed(3) || 'N/A'})`);
    return match.values;
  } catch (error) {
    console.error(`❌ Failed to get existing embedding for ${topic}:`, error.message);
    return null;
  }
}

/**
 * Query Pinecone with embeddings to retrieve relevant knowledge base content
 * @param {Array<number>} embedding - Query embedding vector
 * @param {Object} filters - Metadata filters (e.g., { class: "11", subject: "Physics" })
 * @param {number} topK - Number of results to return
 * @returns {Array} - Array of matched results with metadata and scores
 */
async function queryKnowledgeBase(embedding, filters = {}, topK = 10) {
  console.log('🔍 Querying Pinecone knowledge base with filters:', filters);
  
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('Invalid embedding provided for query');
  }
  
  if (embedding.length !== EXPECTED_DIM) {
    throw new Error(`Embedding dimension mismatch. Expected ${EXPECTED_DIM}, got ${embedding.length}`);
  }

  try {
    const queryRequest = {
      vector: embedding,
      topK: topK,
      includeMetadata: true,
    };

    // Add filters if provided
    if (Object.keys(filters).length > 0) {
      queryRequest.filter = filters;
    }

    const queryResponse = await index.query(queryRequest);
    console.log(`✅ Retrieved ${queryResponse.matches?.length || 0} results from Pinecone`);
    
    return queryResponse.matches || [];
  } catch (error) {
    console.error('❌ Pinecone query failed:', error.message);
    throw error;
  }
}

module.exports = {
  upsertSyllabusItems,
  queryKnowledgeBase,
  fetchEmbeddingById,
  getExistingEmbeddingForTopic,
};