const { queryKnowledgeBase, getExistingEmbeddingForTopic } = require('./vectorDBService');
const Groq = require('groq-sdk');
const axios = require('axios');

// Flask parser service configuration
const FLASK_PARSER_URL = process.env.FLASK_PARSER_URL || "https://tutor-flask-1.onrender.com";
const EMBEDDING_DIM = 384; // MiniLM-L6-v2 dimension from Flask service

// Initialize Groq client for study plan generation
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/**
 * Generate embeddings using Flask service with local MiniLM-L6-v2 model
 * Model: sentence-transformers/all-MiniLM-L6-v2 (384 dimensions)
 * 
 * NOTE: The Flask service generates embeddings during PDF parsing via /parse endpoint.
 * For runtime queries, we rely on existing embeddings in Pinecone rather than generating new ones.
 * This function is kept for compatibility but will primarily use getExistingEmbeddingForTopic.
 * 
 * @param {string} text - Text to generate embedding for
 * @returns {Array<number>} - Embedding vector
 */
async function generateEmbedding(text) {
  console.warn('⚠️ generateEmbedding called - Flask service generates embeddings during PDF parsing only');
  console.warn('⚠️ For queries, use getExistingEmbeddingForTopic from vectorDBService instead');
  
  // The Flask service at /parse handles embedding generation during upload
  // For runtime query embeddings, we should reuse existing embeddings from Pinecone
  throw new Error('Embedding generation should use existing embeddings from Pinecone. Use getExistingEmbeddingForTopic instead.');
}


/**
 * @deprecated This function is no longer used. Batch embeddings are generated during PDF upload via Flask service.
 * Generate embeddings for multiple texts using Hugging Face
 * @param {Array<string>} texts - Array of texts to generate embeddings for
 * @returns {Array<Array<number>>} - Array of embedding vectors
 */
async function generateEmbeddingsBatch(texts) {
  console.warn('⚠️ generateEmbeddingsBatch is deprecated - embeddings should be generated during PDF upload via Flask');
  throw new Error('Batch embedding generation should use Flask /parse endpoint during PDF upload only');
}

/**
 * Query knowledge base for relevant content using RAG with chunked retrieval
 * @param {Array<string>} topics - List of topics from syllabus
 * @param {string} className - Class level (e.g., "11", "12")
 * @param {string} subject - Subject name
 * @returns {Array} - Retrieved knowledge base content with chunks
 */
async function retrieveKnowledgeForTopics(topics, className, subject) {
  console.log(`🔍 Retrieving knowledge for ${topics.length} topics...`);
  console.log(`♻️ Using existing embeddings from Pinecone (no new embedding generation)`);
  
  const allRetrievedContent = [];
  const seenVectorIds = new Set();
  const TOP_K = 10; // Retrieve more chunks per topic for better context

  for (const topic of topics) {
    try {
      // Filters for class and subject
      const filters = {
        class: className,
        subject: subject,
      };
      
      // ✅ STEP 1: Try to get existing embedding for this topic from Pinecone
      console.log(`  🔄 Fetching existing embedding for: ${topic}`);
      const embedding = await getExistingEmbeddingForTopic(topic, filters);
      
      // ❌ Skip if topic not found in Pinecone (no embedding generation at runtime)
      if (!embedding) {
        console.log(`  ⚠️ Topic not found in Pinecone, skipping: ${topic}`);
        console.log(`  💡 This topic was not in the uploaded syllabus materials`);
        continue; // Skip to next topic
      }
      
      // STEP 2: Query Pinecone using the embedding to find similar content
      const matches = await queryKnowledgeBase(embedding, filters, TOP_K);
      
      // Add unique chunks to our collection
      for (const match of matches) {
        if (!seenVectorIds.has(match.id)) {
          seenVectorIds.add(match.id);
          allRetrievedContent.push({
            topic: match.metadata?.topic || 'Unknown',
            content: match.metadata?.text || match.metadata?.topic || '',
            chunk_index: match.metadata?.chunk_index || 0,
            total_chunks: match.metadata?.total_chunks || 1,
            score: match.score,
            subject: match.metadata?.subject,
            class: match.metadata?.class,
            content_type: match.metadata?.content_type || 'unknown',
          });
        }
      }
      
      console.log(`  ✅ Retrieved ${matches.length} chunk matches for topic: ${topic}`);
    } catch (error) {
      console.warn(`  ⚠️ Failed to retrieve knowledge for topic "${topic}":`, error.message);
    }
  }
  
  // Sort by relevance score
  allRetrievedContent.sort((a, b) => b.score - a.score);
  
  console.log(`✅ Total unique chunks retrieved: ${allRetrievedContent.length}`);
  console.log(`📊 Top 5 chunks by relevance:`);
  allRetrievedContent.slice(0, 5).forEach((item, idx) => {
    console.log(`   ${idx + 1}. ${item.topic} (chunk ${item.chunk_index + 1}/${item.total_chunks}) - score: ${item.score.toFixed(3)}`);
  });
  
  return allRetrievedContent;
}

/**
 * Generate a comprehensive study plan using RAG + OpenAI
 * @param {Array<string>} topics - Topics from syllabus
 * @param {string} className - Class level
 * @param {string} subject - Subject name
 * @param {Object} options - Study plan options (studyHoursPerDay, totalDays, difficulty)
 * @returns {Object} - Generated study plan with schedule and recommendations
 */
async function generateRAGStudyPlan(topics, className, subject, options = {}) {
  const {
    studyHoursPerDay = 2,
    totalDays = 30,
    difficulty = 'medium',
  } = options;

  console.log(`📚 Generating RAG-based study plan for Class ${className} ${subject}`);
  console.log(`   Topics: ${topics.length}, Hours/day: ${studyHoursPerDay}, Days: ${totalDays}`);

  // Step 1: Retrieve relevant knowledge from Pinecone
  const retrievedKnowledge = await retrieveKnowledgeForTopics(topics, className, subject);

  // Step 2: Build context from retrieved knowledge chunks (or use fallback)
  let knowledgeContext = '';
  let contextNote = '';
  
  if (retrievedKnowledge.length > 0) {
    knowledgeContext = retrievedKnowledge
      .slice(0, 30) // Limit to top 30 most relevant chunks
      .map((item, idx) => {
        const chunkInfo = item.total_chunks > 1 ? ` [chunk ${item.chunk_index + 1}/${item.total_chunks}]` : '';
        const contentPreview = item.content.substring(0, 150) + (item.content.length > 150 ? '...' : '');
        return `${idx + 1}. ${item.topic}${chunkInfo} (score: ${item.score.toFixed(3)})\n   Preview: ${contentPreview}`;
      })
      .join('\n');
    contextNote = 'Use the knowledge base context below to inform your study plan.';
  } else {
    console.log('⚠️ No knowledge base context found. Generating study plan based on topics only.');
    knowledgeContext = 'No specific materials found in knowledge base. Generate a comprehensive study plan based on standard curriculum for the topics listed.';
    contextNote = 'No prior materials available. Create a well-structured study plan based on standard educational practices.';
  }

  // Step 3: Create prompt for Groq with RAG context (or without)
  const prompt = `You are an expert educational planner. ${contextNote}

**Student Information:**
- Class: ${className}
- Subject: ${subject}
- Study hours per day: ${studyHoursPerDay}
- Total days available: ${totalDays}
- Difficulty preference: ${difficulty}

**Syllabus Topics to Cover:**
${topics.map((t, i) => `${i + 1}. ${t}`).join('\n')}

**Knowledge Base Context:**
${knowledgeContext}

**Task:**
Generate a comprehensive day-by-day study plan that:
1. Distributes topics strategically across ${totalDays} days
2. Allocates appropriate time to each topic based on complexity
3. Groups related topics together when possible
4. Includes time for revision and practice
5. Considers the retrieved knowledge base content for better context
6. Assigns difficulty levels (easy/medium/hard) to each topic

Return a JSON object with this structure:
{
  "dailySchedule": {
    "day1": [
      {
        "topic": "topic name",
        "subject": "${subject}",
        "time": "Xh Ym",
        "difficulty": "easy|medium|hard",
        "learningObjectives": ["objective1", "objective2"],
        "resources": ["resource references from knowledge base if available"]
      }
    ],
    "day2": [...],
    ...
  },
  "studyTips": ["tip1", "tip2", ...],
  "revisionSchedule": {
    "description": "When and how to revise",
    "days": [day numbers for revision]
  }
}

🚨 CRITICAL INSTRUCTIONS:
- Return ONLY valid JSON
- No explanations, comments, or text outside the JSON object
- No trailing commas in arrays or objects
- Properly escape all special characters in strings
- Start with { and end with }
- Do not add markdown code blocks or formatting`;

  try {
    // Step 4: Call Groq with RAG context
    console.log('🤖 Calling Groq LLM (llama-3.3-70b-versatile) to generate study plan with RAG context...');
    
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You are an expert educational planner. You MUST respond with valid JSON only. No explanations, no markdown, no text outside JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 3000,
      response_format: { type: "json_object" }, // Force JSON mode in Groq
    });

    let responseText = completion.choices[0].message.content.trim();
    
    // Remove markdown code blocks if present
    responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    // Parse JSON response with improved error handling
    let studyPlanData;
    try {
      // Try direct parse first
      studyPlanData = JSON.parse(responseText);
    } catch (parseError) {
      console.warn('⚠️ Initial JSON parse failed, attempting fixes...');
      
      try {
        // Sanitize common JSON issues
        let cleaned = responseText
          .replace(/,\s*}/g, '}')  // Remove trailing commas in objects
          .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
          .replace(/\n/g, ' ')     // Remove newlines that might break parsing
          .trim();
        
        // Try to extract JSON object from response
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleaned = jsonMatch[0];
        }
        
        studyPlanData = JSON.parse(cleaned);
        console.log('✅ JSON parsed after sanitization');
      } catch (secondError) {
        console.error('❌ Failed to parse LLM response as JSON');
        console.error('Parse error:', parseError.message);
        console.error('Response text (first 500 chars):', responseText.substring(0, 500));
        
        // Return a fallback structure instead of throwing
        return {
          success: false,
          error: 'Failed to parse LLM response',
          rawResponse: responseText.substring(0, 1000),
          dailySchedule: {},
          studyTips: ['Please try uploading your syllabus again'],
          revisionSchedule: {},
          metadata: {
            totalDays: 0,
            studyHoursPerDay,
            totalTopics: topics.length,
            knowledgeBaseReferences: retrievedKnowledge.length,
            generatedAt: new Date().toISOString(),
            error: secondError.message,
          },
        };
      }
    }

    console.log('✅ Study plan generated successfully');

    return {
      success: true,
      dailySchedule: studyPlanData.dailySchedule || {},
      studyTips: studyPlanData.studyTips || [],
      revisionSchedule: studyPlanData.revisionSchedule || {},
      metadata: {
        totalDays: Object.keys(studyPlanData.dailySchedule || {}).length,
        studyHoursPerDay,
        totalTopics: topics.length,
        knowledgeBaseReferences: retrievedKnowledge.length,
        generatedAt: new Date().toISOString(),
      },
      retrievedKnowledge: retrievedKnowledge.slice(0, 10), // Include top 10 for reference
    };

  } catch (error) {
    console.error('❌ Failed to generate study plan:', error.message);
    throw error;
  }
}

/**
 * Helper function to format study plan for storage in MongoDB
 * @param {Object} ragStudyPlan - RAG-generated study plan
 * @param {Array} topicDocuments - MongoDB Topic documents
 * @returns {Object} - Formatted study plan for MongoDB
 */
function formatStudyPlanForStorage(ragStudyPlan, topicDocuments) {
  const topics = [];
  const dailySchedule = ragStudyPlan.dailySchedule || {};
  console.log("length",topicDocuments.length)
  // Create a map of topic names to topic IDs (normalize for matching)
  const topicNameToId = {};
  topicDocuments.forEach(doc => {
    const normalized = doc.topic.toLowerCase().trim();
    topicNameToId[normalized] = doc._id;
  });

  console.log('📋 Topic name to ID mapping:', topicNameToId);

  // Extract topics from daily schedule
  Object.entries(dailySchedule).forEach(([day, dayTopics]) => {
    dayTopics.forEach(item => {
      const topicName = item.topic.toLowerCase().trim();
      const topicId = topicNameToId[topicName];
      
      if (!topicId) {
        console.warn(`⚠️ Topic "${item.topic}" not found in topic documents, skipping...`);
        return; // Skip topics that don't match instead of using fallback
      }

      topics.push({
        topicId: topicId,
        status: "pending",
        allocatedTime: {
          minutes: parseTimeToMinutes(item.time),
          formatted: item.time,
        },
        scheduledDay: parseInt(day.replace('day', '')),
        difficulty: item.difficulty || "medium",
        learningObjectives: item.learningObjectives || [],
        resources: item.resources || [],
      });
    });
  });

  return {
    topics,
    schedule: {
      totalDays: ragStudyPlan.metadata?.totalDays || 30,
      studyHoursPerDay: ragStudyPlan.metadata?.studyHoursPerDay || 2,
      dailySchedule: dailySchedule,
    },
    studyTips: ragStudyPlan.studyTips || [],
    revisionSchedule: ragStudyPlan.revisionSchedule || {},
    metadata: ragStudyPlan.metadata || {},
  };
}

/**
 * Parse time string (e.g., "1h 30m", "45m", "2h") to minutes
 */
function parseTimeToMinutes(timeString) {
  if (!timeString) return 60; // Default 1 hour
  
  let totalMinutes = 0;
  const hourMatch = timeString.match(/(\d+)h/);
  const minMatch = timeString.match(/(\d+)m/);
  
  if (hourMatch) totalMinutes += parseInt(hourMatch[1]) * 60;
  if (minMatch) totalMinutes += parseInt(minMatch[1]);
  
  return totalMinutes || 60;
}

module.exports = {
  generateEmbedding,
  generateEmbeddingsBatch,
  retrieveKnowledgeForTopics,
  generateRAGStudyPlan,
  formatStudyPlanForStorage,
};
