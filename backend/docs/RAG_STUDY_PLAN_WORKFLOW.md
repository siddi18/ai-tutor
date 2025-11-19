# RAG-Based Study Plan Generation Workflow

## Overview
This document explains the Retrieval-Augmented Generation (RAG) workflow for creating intelligent study plans using your Pinecone knowledge base.

## Workflow Steps

### 1. **Upload Syllabus PDF**
- User uploads Class 11/12 syllabus via frontend (`/upload`)
- File is sent to `POST /api/upload-syllabus/:userId`

### 2. **Parse & Extract Topics**
- Backend calls `parseSyllabus()` → sends PDF to cloud-hosted Flask service
  - Cloud URL: `https://tutor-flask-1.onrender.com/parse`
- Flask service:
  - Extracts text from PDF using PyMuPDF
  - Detects class level (11/12) and subject
  - Parses topics/chapters/units
  - **Generates local embeddings** using `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions)
  - Chunks text with 1500 char max and 200 char overlap
  - Returns: `{ class, subject, topics, items }` where `items` contains 384-dim embeddings

### 3. **Store in Vector Database**
- Backend calls `upsertSyllabusItems()`:
  - Creates `Syllabus` document in MongoDB
  - Uploads each topic's embedding (384 dimensions) to Pinecone with metadata:
    ```javascript
    {
      id: "filename-0-chunk0",
      values: [384-dimensional embedding vector],
      metadata: {
        class: "11",
        subject: "Physics",
        topic: "Kinematics",
        chunk_index: 0,
        total_chunks: 3,
        text: "actual chunk text...",
        filename: "syllabus.pdf",
        content_type: "syllabus"
      }
    }
    ```
  - Creates `Topic` documents in MongoDB

### 4. **RAG-Based Study Plan Generation** ⭐
This is where the magic happens!

#### Step 4.1: Retrieve Knowledge from Pinecone
- For each topic in syllabus, the system:
  1. **Retrieves existing embedding** from Pinecone for the topic (no new generation needed!)
  2. If not found, uses `getExistingEmbeddingForTopic()` to fetch similar embeddings
  3. Queries Pinecone with filters:
     ```javascript
     {
       vector: existingEmbedding,  // Reuses 384-dim embedding from upload
       topK: 10,  // Retrieve top 10 chunks
       filter: { class: "11", subject: "Physics" }
     }
     ```
  3. Retrieves **similar content** from your stored knowledge base (study materials, notes, etc.)
  4. Collects relevance scores and metadata

#### Step 4.2: Build Context for LLM
- Aggregates retrieved knowledge:
  ```
  1. Kinematics - Motion in 1D (relevance: 0.95)
  2. Equations of Motion (relevance: 0.92)
  3. Velocity and Acceleration (relevance: 0.89)
  ...
  ```

#### Step 4.3: Generate Study Plan with OpenAI
- Sends comprehensive prompt to Groq LLM (llama-3.3-70b-versatile):
  ```
  [System]: You are an expert educational planner
  
  [User prompt includes]:
  - Student info (class, subject, hours/day, total days)
  - Syllabus topics to cover
  - **Retrieved knowledge base context** (RAG)
  - Instructions to create day-by-day plan
  ```

- OpenAI generates JSON response:
  ```json
  {
    "dailySchedule": {
      "day1": [
        {
          "topic": "Kinematics",
          "time": "2h",
          "difficulty": "medium",
          "learningObjectives": ["Understand position-time graphs", ...],
          "resources": ["Chapter 3.1 from knowledge base"]
        }
      ]
    },
    "studyTips": ["Focus on problem-solving", ...],
    "revisionSchedule": {...}
  }
  ```

### 5. **Store & Return Study Plan**
- Formats plan for MongoDB storage
- Creates `StudyPlan` document with:
  - Daily schedule
  - Study tips
  - Revision schedule
  - RAG metadata (knowledge base references count)
- Returns complete plan to frontend

## Key Components

### Files Involved
- **Frontend**: `frontend/src/pages/Upload.jsx`
- **Routes**: `backend/routes/routes.js` (`POST /api/upload-syllabus/:userId`)
- **Services**:
  - `backend/services/parserService.js` - PDF parsing proxy
  - `backend/services/vectorDBService.js` - Pinecone operations
  - `backend/services/studyPlanService.js` - RAG study plan generation
- **Parser**: `parser-service/main.py` - Python Flask service
- **Models**: `backend/models/StudyPlan.js`, `backend/models/Topic.js`

### Environment Variables Required
```env
# OpenAI
OPENAI_API_KEY=sk-...

# Pinecone
PINECONE_API_KEY=...
PINECONE_INDEX=ai-tutor-index
PINECONE_DIMENSION=1536

# MongoDB
MONGO_URI=mongodb://...

# Parser Service
PORT=5001
```

## RAG Benefits

1. **Context-Aware**: Study plans are generated using actual content from your knowledge base
2. **Personalized**: Retrieved materials are specific to the class and subject
3. **Intelligent Scheduling**: LLM considers topic complexity and relationships
4. **Resource References**: Links back to stored study materials
5. **Learning Objectives**: Generated based on actual content, not generic templates

## Example Flow

```
User uploads "Class 11 Physics Syllabus.pdf"
    ↓
Parser extracts topics: ["Kinematics", "Laws of Motion", ...]
    ↓
System generates embeddings for each topic
    ↓
Embeddings stored in Pinecone with metadata
    ↓
For each topic, query Pinecone:
  - Find similar content from knowledge base
  - Retrieve top 5 matches with scores
    ↓
Build context prompt with retrieved knowledge
    ↓
OpenAI generates day-by-day study plan
    ↓
Plan saved to MongoDB and returned to user
```

## Testing the Workflow

1. **Upload some study materials first** (to populate knowledge base):
   ```bash
   $env:USER_ID="<your-user-id>"
   npm run ingest:materials
   ```

2. **Upload syllabus PDF** via frontend `/upload` page

3. **Check logs** for RAG process:
   ```
   🔍 Retrieving knowledge for 10 topics...
   ✅ Retrieved 5 matches for topic: Kinematics
   🤖 Calling OpenAI to generate study plan with RAG context...
   ✅ Study plan generated successfully
   ```

4. **Verify in response**:
   - `knowledgeBaseReferences` should be > 0
   - `studyTips` should be populated
   - `schedule.dailySchedule` should have day-by-day breakdown

## Troubleshooting

- **No knowledge retrieved**: Ensure you've uploaded study materials first and they match the class/subject
- **OpenAI errors**: Check `OPENAI_API_KEY` is valid and has credits
- **Pinecone errors**: Verify index exists and dimension is 1536
- **Empty study plan**: Check OpenAI response parsing in logs
