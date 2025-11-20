const express = require("express");
const upload = require("../middleware/upload");
const Syllabus = require("../models/Syllabus");
const Topic = require("../models/Topic");
const StudyPlan = require("../models/StudyPlan");
const { parseSyllabus } = require("../services/parserService");
const { upsertSyllabusItems } = require("../services/vectorDBService");
const { generateRAGStudyPlan, formatStudyPlanForStorage } = require("../services/studyPlanService");

const router = express.Router();

// Helper function to format time
function formatTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${mins}m`;
}

// Helper function to distribute topics across days with time allocation
function createStudySchedule(topics, studyHoursPerDay = 2, totalDays = 30) {
  const dailySchedule = {};
  const minutesPerDay = studyHoursPerDay * 60;
  
  // Calculate time allocation based on difficulty
  const difficultyWeights = {
    'easy': 0.8,
    'medium': 1.0,
    'hard': 1.5
  };

  let totalWeight = 0;
  const topicsWithTime = topics.map(topic => {
    const weight = difficultyWeights[topic.difficulty] || 1.0;
    totalWeight += weight;
    return { ...topic, weight };
  });

  // Allocate time to each topic
  topicsWithTime.forEach(topic => {
    topic.allocatedMinutes = Math.round((topic.weight / totalWeight) * (minutesPerDay * totalDays));
    topic.allocatedTimeFormatted = formatTime(topic.allocatedMinutes);
  });

  // Distribute topics across days
  let currentDay = 1;
  let currentDayMinutes = 0;
  let currentDayTopics = [];

  topicsWithTime.forEach((topic, index) => {
    // If adding this topic would exceed daily limit, move to next day
    if (currentDayMinutes + topic.allocatedMinutes > minutesPerDay && currentDayTopics.length > 0) {
      dailySchedule[`day${currentDay}`] = currentDayTopics;
      currentDay++;
      currentDayMinutes = 0;
      currentDayTopics = [];
      
      // Stop if we exceed total days
      if (currentDay > totalDays) return;
    }

    const scheduledTopic = {
      subject: topic.subject,
      topic: topic.topic,
      time: topic.allocatedTimeFormatted,
      difficulty: topic.difficulty,
      topicId: topic._id
    };
    
    currentDayTopics.push(scheduledTopic);
    currentDayMinutes += topic.allocatedMinutes;
    
    // Update the topic with day allocation
    topic.scheduledDay = currentDay;
  });

  // Add remaining topics to the last day
  if (currentDayTopics.length > 0 && currentDay <= totalDays) {
    dailySchedule[`day${currentDay}`] = currentDayTopics;
  }

  return {
    dailySchedule,
    topicsWithTime,
    totalDays: Math.min(currentDay, totalDays),
    studyHoursPerDay
  };
}

router.post("/upload-syllabus/:userId", upload.single("file"), async (req, res) => {
  try {
    console.log('📤 File upload received:', req.file?.originalname);
    
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Extract userId from URL parameter
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: "userId is required in URL" });
    }

    const parsedData = await parseSyllabus(req.file.path);
    console.log('✅ Python parsing completed');
    // console.log('Parsed data:', parsedData);

    // Validate parsed data
    if (!parsedData) {
      return res.status(500).json({ error: "Parser returned empty data" });
    }

    const className = parsedData.class || "Unknown";
    const subject = parsedData.subject || "Unknown";
    const topics = Array.isArray(parsedData.topics) ? parsedData.topics : [];
    
    // Proper validation for items
    let items = [];
    if (parsedData.items && Array.isArray(parsedData.items)) {
      items = parsedData.items;
    } else {
      console.warn('⚠️ No items array found in parsed data, using empty array');
    }

    console.log(`📊 Parsed data: Class ${className}, Subject ${subject}, ${items.length} items`);

    // 1. FIRST create the Syllabus document to get a real ObjectId
    const syllabusRecord = new Syllabus({
      filename: req.file.originalname,
      class: className,
      subjects: { [subject]: topics },
      vectorIds: [], // Start with empty array
      uploadedAt: new Date(),
    });
    
    await syllabusRecord.save();
    console.log('✅ Syllabus saved with ID:', syllabusRecord._id);

    // 2. NOW upsert vectors with the REAL syllabusId
    const vectorIds = await upsertSyllabusItems(
      req.file.filename, 
      className, 
      syllabusRecord._id,
      items
    );

    // 3. Update the syllabus record with the vector IDs
    syllabusRecord.vectorIds = vectorIds;
    await syllabusRecord.save();
    console.log('✅ Syllabus updated with vector IDs');

    // 4. Create Topic documents for each topic
    const topicDocuments = [];
    for (const topicName of topics) {
      const topicDoc = new Topic({
        syllabusId: syllabusRecord._id,
        subject: subject,
        topic: topicName,
        difficulty: "medium",
        vectorId: vectorIds.length > 0 ? vectorIds[0] : null
      });
      await topicDoc.save();
      topicDocuments.push(topicDoc);
      console.log(`✅ Topic created: ${topicName}`);
    }

    // 5. GENERATE RAG-BASED STUDY PLAN using knowledge base
    console.log('🤖 Generating RAG-based study plan...');
    
    const ragStudyPlan = await generateRAGStudyPlan(
      topics, // Array of topic names from syllabus
      className,
      subject,
      {
        studyHoursPerDay: 2,
        totalDays: 30,
        difficulty: "medium"
      }
    );

    // Format the RAG study plan for MongoDB storage
    const formattedPlan = formatStudyPlanForStorage(ragStudyPlan, topicDocuments);

    console.log(`📊 Formatted plan has ${formattedPlan.topics.length} topics from RAG`);
    console.log(`📚 Total topic documents created: ${topicDocuments.length}`);

    console.log(`📊 RAG formatted plan has ${formattedPlan.topics.length} topics`);
    console.log(`📚 Total topic documents created: ${topicDocuments.length}`);

    // IMPORTANT: Ignore RAG schedule completely and just add ALL topics
    // This ensures every topic created gets included in the study plan
    formattedPlan.topics = topicDocuments.map((doc, index) => ({
      topicId: doc._id,
      status: "pending",
      allocatedTime: {
        minutes: 60,
        formatted: "1h"
      },
      scheduledDay: Math.floor(index / 2) + 1, // 2 topics per day
      difficulty: doc.difficulty || "medium",
      learningObjectives: [],
      resources: []
    }));

    console.log(`✅ Study plan rebuilt with ALL ${formattedPlan.topics.length} topics (ignoring RAG filtering)`);

    const studyPlan = new StudyPlan({
      userId: userId,
      syllabusId: syllabusRecord._id,
      topics: formattedPlan.topics,
      schedule: formattedPlan.schedule,
      studyTips: formattedPlan.studyTips,
      revisionSchedule: formattedPlan.revisionSchedule,
      metadata: {
        ...formattedPlan.metadata,
        totalTopics: formattedPlan.topics.length
      },
    });

    await studyPlan.save();
    console.log('✅ RAG-based study plan created for user:', userId);
    console.log(`✅ Study plan contains ${studyPlan.topics.length} topics`);

    return res.json({
      status: "success",
      message: "Parsed, embedded, indexed, saved, and RAG-based study plan created",
      class: className,
      subject: subject,
      topics: topics,
      count: items.length,
      vectorCount: vectorIds.length,
      syllabusId: syllabusRecord._id,
      studyPlanId: studyPlan._id,
      schedule: ragStudyPlan.dailySchedule,
      studyTips: ragStudyPlan.studyTips,
      knowledgeBaseReferences: ragStudyPlan.metadata?.knowledgeBaseReferences || 0
    });

  } catch (err) {
    console.error("❌ Error in /upload-syllabus:", err.message);
    console.error("Full error:", err);
    return res.status(500).json({ 
      error: err.message || "Failed to process syllabus",
      details: "Check server logs for more information"
    });
  }
});

// Upload general study materials (Class 11/12, any subject) without creating study plan
router.post("/upload-material/:userId", upload.single("file"), async (req, res) => {
  try {
    console.log('📤 Material upload received:', req.file?.originalname);

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: "userId is required in URL" });
    }

    // Optional overrides via query/body
    const overrideClass = (req.query.class || req.body?.class || '').toString().trim();
    const overrideSubject = (req.query.subject || req.body?.subject || '').toString().trim();

    const parsedData = await parseSyllabus(req.file.path);
    console.log('✅ Python parsing completed');

    if (!parsedData) {
      return res.status(500).json({ error: "Parser returned empty data" });
    }

    let className = parsedData.class || "Unknown";
    let subject = parsedData.subject || "General";
    let items = Array.isArray(parsedData.items) ? parsedData.items : [];

    if (overrideClass) className = overrideClass;
    if (overrideSubject) subject = overrideSubject;
    // Ensure all items carry the chosen subject
    items = items.map(it => ({ ...it, subject }));

    console.log(`📊 Material parsed: Class ${className}, Subject ${subject}, ${items.length} items`);

    const vectorIds = await upsertSyllabusItems(
      req.file.originalname,
      className,
      null, // no syllabusId for general materials
      items,
      { material: true, userId }
    );

    // Optionally create Topic docs referencing user without syllabus
    const topicNames = Array.isArray(parsedData.topics) ? parsedData.topics : [];
    const topicDocuments = [];
    for (const topicName of topicNames) {
      const topicDoc = new Topic({
        syllabusId: undefined,
        subject: subject,
        topic: topicName,
        difficulty: "medium",
        vectorId: vectorIds.length > 0 ? vectorIds[0] : null
      });
      await topicDoc.save();
      topicDocuments.push(topicDoc);
    }

    return res.json({
      status: "success",
      message: "Material parsed and indexed into Pinecone",
      class: className,
      subject: subject,
      topics: topicNames,
      count: items.length,
      vectorCount: vectorIds.length
    });
  } catch (err) {
    console.error("❌ Error in /upload-material:", err.message);
    console.error("Full error:", err);
    return res.status(500).json({ error: err.message || "Failed to process material" });
  }
});

// NOTE: All study-plan routes have been moved to routes/studyPlan.js
// to avoid conflicts and better organization

module.exports = router;