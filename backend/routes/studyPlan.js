const express = require("express");
const StudyPlan = require("../models/StudyPlan");
const Topic = require("../models/Topic");
const router = express.Router();

// Get all topics for a user (from their study plan)
// GET /studyplan/topics/:userId
router.get("/topics/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Get ALL topics from ALL syllabi (not filtered by syllabus)
    const totalTopics = await Topic.countDocuments({});
    console.log(`🔢 Total topics in database: ${totalTopics}`);

    const topics = await Topic.find({})
      .select('topic subject difficulty syllabusId')
      .limit(0)
      .lean();

    console.log(`✅ Found ${topics.length} topics for user ${userId} (from all syllabi)`);
    res.json({ topics });
  } catch (error) {
    console.error("Error fetching topics:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get study plan by its ID
// GET /studyplan/by-id/:studyPlanId
router.get("/by-id/:studyPlanId", async (req, res) => {
  try {
    const { studyPlanId } = req.params;
    if (!studyPlanId) {
      return res.status(400).json({ error: "studyPlanId is required" });
    }

    const studyPlan = await StudyPlan.findById(studyPlanId)
      .populate({ path: 'topics.topicId', select: 'topic subject difficulty' })
      .populate('syllabusId', 'class subjects filename');

    if (!studyPlan) {
      return res.status(404).json({ error: "Study plan not found" });
    }

    res.json({ studyPlan });
  } catch (error) {
    console.error("Error fetching study plan by id:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get study plan for a user (returns the latest study plan) and ensure it contains ALL topics from its syllabus
// GET /studyplan/latest/:userId
router.get("/latest/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Get the LATEST study plan (sorted by creation date descending)
    let studyPlan = await StudyPlan.findOne({ userId })
      .sort({ createdAt: -1 }) // Get most recent study plan
      .populate({
        path: 'topics.topicId',
        select: 'topic subject difficulty'
      })
      .populate('syllabusId', 'class subjects filename');

    if (!studyPlan) {
      return res.status(404).json({ error: "Study plan not found for this user" });
    }

    // Auto-sync: ensure all Topic docs for this syllabus are present in study plan
    if (studyPlan.syllabusId?._id) {
      const syllabusTopicDocs = await Topic.find({ syllabusId: studyPlan.syllabusId._id }).select('_id difficulty subject topic').lean();
      const existingIds = new Set(studyPlan.topics.map(t => (t.topicId?._id || t.topicId)?.toString()));
      const missing = syllabusTopicDocs.filter(doc => !existingIds.has(doc._id.toString()));

      if (missing.length > 0) {
        console.log(`🔄 Auto-sync: adding ${missing.length} missing topics to study plan ${studyPlan._id}`);
        const startIndex = studyPlan.topics.length;
        missing.forEach((doc, idx) => {
          studyPlan.topics.push({
            topicId: doc._id,
            status: 'pending',
            allocatedTime: { minutes: 60, formatted: '1h' },
            scheduledDay: Math.floor((startIndex + idx) / 2) + 1,
            difficulty: doc.difficulty || 'medium',
            learningObjectives: [],
            resources: []
          });
        });
        studyPlan.metadata = studyPlan.metadata || {};
        studyPlan.metadata.totalTopics = studyPlan.topics.length;
        await studyPlan.save();
        // Re-populate newly added topic references
        studyPlan = await StudyPlan.findById(studyPlan._id)
          .populate({ path: 'topics.topicId', select: 'topic subject difficulty' })
          .populate('syllabusId', 'class subjects filename');
      }
    }

    const uniqueTopicIds = [...new Set(studyPlan.topics.map(t => t.topicId?._id?.toString() || t.topicId?.toString()))];
    console.log(`✅ Returning latest study plan for user ${userId}: ${studyPlan._id}`);
    console.log(`📊 Study plan has ${studyPlan.topics.length} total topics, ${uniqueTopicIds.length} unique topic IDs`);

    res.json({ studyPlan, autoSynced: true });
  } catch (error) {
    console.error("Error fetching study plan:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get study plan by syllabus for a user
// GET /studyplan/:userId/:syllabusId
router.get("/:userId/:syllabusId", async (req, res) => {
  try {
    const { userId, syllabusId } = req.params;

    if (!userId || !syllabusId) {
      return res.status(400).json({ error: "userId and syllabusId are required" });
    }

    // Get study plan with populated topics
    const studyPlan = await StudyPlan.findOne({ userId, syllabusId })
      .populate({
        path: 'topics.topicId',
        select: 'topic subject difficulty vectorId'
      })
      .populate('syllabusId', 'class subjects filename');

    if (!studyPlan) {
      return res.status(404).json({ error: "Study plan not found" });
    }

    res.json({ studyPlan });
  } catch (error) {
    console.error("Error fetching study plan:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get all study plans for a user
// GET /studyplan/user/:userId
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Get all study plans for user with populated data
    const studyPlans = await StudyPlan.find({ userId })
      .populate({
        path: 'topics.topicId',
        select: 'topic subject'
      })
      .populate('syllabusId', 'class subjects filename')
      .sort({ createdAt: -1 });

    res.json({ studyPlans });
  } catch (error) {
    console.error("Error fetching user study plans:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get study plan progress for a user
// GET /studyplan/progress/:userId
router.get("/progress/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Get all study plans for user
    const studyPlans = await StudyPlan.find({ userId })
      .populate('syllabusId', 'class subjects');

    // Calculate progress
    const progress = studyPlans.map(plan => {
      const totalTopics = plan.topics.length;
      const completedTopics = plan.topics.filter(t => t.status === 'completed').length;
      const progressPercentage = totalTopics > 0 ? (completedTopics / totalTopics) * 100 : 0;

      return {
        studyPlanId: plan._id,
        syllabusId: plan.syllabusId,
        totalTopics,
        completedTopics,
        progressPercentage: Math.round(progressPercentage),
        createdAt: plan.createdAt
      };
    });

    res.json({ progress });
  } catch (error) {
    console.error("Error fetching study plan progress:", error);
    res.status(500).json({ error: error.message });
  }
});

// Mark topic as completed
// POST /studyplan/complete
router.post("/complete", async (req, res) => {
  try {
    const { userId, topicId } = req.body;

    console.log(`📝 Marking topic as completed: userId=${userId}, topicId=${topicId}`);
    console.log(`📝 topicId type: ${typeof topicId}, value: ${topicId}`);

    // First, find the LATEST study plan for this user
    const latestPlan = await StudyPlan.findOne({ userId })
      .sort({ createdAt: -1 });

    if (!latestPlan) {
      console.error(`❌ No study plan found for userId=${userId}`);
      return res.status(404).json({ error: "No study plan found for this user" });
    }

    console.log(`✅ Found latest study plan: ${latestPlan._id}`);
    console.log(`📊 Study plan has ${latestPlan.topics.length} topics`);
    console.log(`📋 Topic IDs in plan:`, latestPlan.topics.map(t => ({
      topicId: t.topicId?.toString(),
      status: t.status
    })));
    console.log(`🔎 Received topicId from frontend: ${topicId}`);

    // Check if this topic exists in the study plan
    const topicExists = latestPlan.topics.some(t =>
      t.topicId && t.topicId.toString() === topicId.toString()
    );
    console.log(`🔍 Topic exists check for topicId=${topicId}: ${topicExists}`);

    if (!topicExists) {
      console.error(`❌ Topic ${topicId} not found in study plan ${latestPlan._id}. Attempting auto-add if topic exists in syllabus.`);
      // Attempt auto-add: check if topic exists globally and (optionally) matches syllabus
      const missingTopicDoc = await Topic.findById(topicId);
      if (missingTopicDoc) {
        console.log(`🔄 Auto-adding missing topic ${topicId} to study plan ${latestPlan._id}`);
        const index = latestPlan.topics.length;
        latestPlan.topics.push({
          topicId: missingTopicDoc._id,
          status: 'pending',
          allocatedTime: { minutes: 60, formatted: '1h' },
          scheduledDay: Math.floor(index / 2) + 1,
          difficulty: missingTopicDoc.difficulty || 'medium',
          learningObjectives: [],
          resources: []
        });
        latestPlan.metadata = latestPlan.metadata || {};
        latestPlan.metadata.totalTopics = latestPlan.topics.length;
      } else {
        return res.status(404).json({
          error: "Topic not found in study plan or database",
          availableTopics: latestPlan.topics.map(t => t.topicId?.toString()).filter(Boolean)
        });
      }
    }

    console.log(`✅ Topic ${topicId} exists in study plan`);

    // Update status
    let updated = false;
    latestPlan.topics.forEach(t => {
      if (t.topicId && t.topicId.toString() === topicId.toString()) {
        t.status = "completed";
        t.completedAt = new Date();
        updated = true;
        console.log(`✅ Updated topic: ${t.topicId} to completed`);
      }
    });

    await latestPlan.save();
    console.log(`✅ Study plan saved successfully`);
    res.json({ message: "Topic marked as completed", plan: latestPlan });
  } catch (error) {
    console.error("❌ Error updating topic:", error);
    res.status(500).json({ error: error.message });
  }
});

// Sync study plan with ALL topics - SIMPLE VERSION
// POST /studyplan/sync/:userId
router.post("/sync/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Step 1: Get ALL topics from topics collection
    const allTopicsFromDB = await Topic.find({}).lean();
    console.log(`Step 1: Found ${allTopicsFromDB.length} topics in topics collection`);

    // Step 2: Find user's study plan
    const userStudyPlan = await StudyPlan.findOne({ userId }).sort({ createdAt: -1 });

    if (!userStudyPlan) {
      return res.status(404).json({ error: "No study plan found" });
    }

    console.log(`Step 2: Found study plan with ${userStudyPlan.topics.length} topics before sync`);

    // Step 3: Build new topics array with ALL topics
    const newTopicsArray = [];
    for (let i = 0; i < allTopicsFromDB.length; i++) {
      newTopicsArray.push({
        topicId: allTopicsFromDB[i]._id,
        status: "pending",
        allocatedTime: {
          minutes: 60,
          formatted: "1h"
        },
        scheduledDay: Math.floor(i / 2) + 1,
        difficulty: allTopicsFromDB[i].difficulty || "medium",
        learningObjectives: [],
        resources: []
      });
    }

    console.log(`Step 3: Built new array with ${newTopicsArray.length} topics`);

    // Step 4: Replace and save
    userStudyPlan.topics = newTopicsArray;
    userStudyPlan.markModified('topics');
    const saved = await userStudyPlan.save();

    console.log(`Step 4: Saved! Study plan now has ${saved.topics.length} topics`);

    // Step 5: Verify by re-fetching
    const verified = await StudyPlan.findById(userStudyPlan._id).lean();
    console.log(`Step 5: Verified - database shows ${verified.topics.length} topics`);

    res.json({
      success: true,
      topicsInCollection: allTopicsFromDB.length,
      topicsInStudyPlan: verified.topics.length,
      matched: allTopicsFromDB.length === verified.topics.length
    });

  } catch (error) {
    console.error("Sync error:", error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// Get topic count from database
// GET /studyplan/topic-count
router.get("/topic-count", async (req, res) => {
  try {
    const totalTopics = await Topic.countDocuments({});
    const allTopics = await Topic.find({})
      .select('_id topic subject syllabusId')
      .lean();

    const bySyllabus = {};
    allTopics.forEach(t => {
      const syllabusId = t.syllabusId?.toString() || 'none';
      bySyllabus[syllabusId] = (bySyllabus[syllabusId] || 0) + 1;
    });

    res.json({
      totalTopics,
      topicsBySyllabus: bySyllabus,
      sampleTopics: allTopics.slice(0, 5).map(t => ({
        id: t._id.toString(),
        name: t.topic,
        subject: t.subject
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fix corrupted study plan by creating a NEW study plan with all 145 topics
// POST /studyplan/fix/:userId
router.post("/fix/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`🔧 Creating NEW study plan with all topics for userId=${userId}`);

    // Get the old study plan to preserve syllabusId
    const oldStudyPlan = await StudyPlan.findOne({ userId })
      .sort({ createdAt: -1 })
      .populate('syllabusId');

    if (!oldStudyPlan) {
      return res.status(404).json({ error: "No existing study plan found" });
    }

    console.log(`📋 OLD study plan ${oldStudyPlan._id} has ${oldStudyPlan.topics.length} topics`);

    // Count total topics in database first
    const totalCount = await Topic.countDocuments({});
    console.log(`🔢 Total topics in database (countDocuments): ${totalCount}`);

    // Try multiple ways to get ALL topics - explicitly set no limit
    console.log(`🔍 Attempting to fetch ALL topics with Topic.find({}).limit(0)...`);

    const allTopics = await Topic.find({})
      .select('_id topic subject difficulty syllabusId')
      .limit(0) // 0 means no limit in Mongoose
      .lean();

    console.log(`📚 Query returned ${allTopics.length} topics (should match ${totalCount})`);

    if (allTopics.length < totalCount) {
      console.error(`⚠️ MISMATCH: Query returned ${allTopics.length} but database has ${totalCount} topics!`);
      console.log(`🔧 Trying without .lean() and .select()...`);

      const allTopicsRaw = await Topic.find({}).limit(0);
      console.log(`📚 Raw query returned ${allTopicsRaw.length} topics`);
    }

    if (allTopics.length === 0) {
      return res.status(404).json({ error: "No topics found in database" });
    }

    console.log(`📚 Retrieved ${allTopics.length} topics from database`);
    console.log(`📚 First 5 topics:`, allTopics.slice(0, 5).map(t => ({ id: t._id.toString(), name: t.topic })));
    console.log(`📚 Last 5 topics:`, allTopics.slice(-5).map(t => ({ id: t._id.toString(), name: t.topic })));

    // Group by syllabus to see distribution
    const bySyllabus = {};
    allTopics.forEach(t => {
      const sId = t.syllabusId?.toString() || 'none';
      bySyllabus[sId] = (bySyllabus[sId] || 0) + 1;
    });
    console.log(`📊 Topics by syllabus:`, bySyllabus);

    // Create NEW study plan with all topics
    const newTopicsArray = allTopics.map((topic, index) => ({
      topicId: topic._id,
      status: "pending",
      allocatedTime: {
        minutes: 60,
        formatted: "1h"
      },
      scheduledDay: Math.floor(index / 2) + 1, // 2 topics per day
      difficulty: topic.difficulty || "medium",
      learningObjectives: [],
      resources: []
    }));

    console.log(`📝 Creating NEW study plan with ${newTopicsArray.length} topics`);

    console.log(`📝 Topics array to save: ${newTopicsArray.length} items`);
    console.log(`📝 First topic structure:`, JSON.stringify(newTopicsArray[0], null, 2));

    // Create brand new study plan document
    const newStudyPlan = new StudyPlan({
      userId: userId,
      syllabusId: oldStudyPlan.syllabusId._id,
      topics: newTopicsArray,
      schedule: {
        totalDays: Math.ceil(allTopics.length / 2),
        studyHoursPerDay: 2,
        dailySchedule: {}
      },
      studyTips: oldStudyPlan.studyTips || [],
      revisionSchedule: oldStudyPlan.revisionSchedule || {},
      metadata: {
        knowledgeBaseReferences: 0,
        generatedAt: new Date(),
        totalTopics: allTopics.length
      },
      createdAt: new Date()
    });

    console.log(`📝 Study plan object before save - topics count: ${newStudyPlan.topics.length}`);

    // Mark topics array as modified to ensure Mongoose saves it
    newStudyPlan.markModified('topics');

    await newStudyPlan.save();
    console.log(`💾 NEW study plan saved: ${newStudyPlan._id}`);
    console.log(`💾 After save - topics count: ${newStudyPlan.topics.length}`);

    // Delete old corrupted study plan (only if new one has topics)
    if (newStudyPlan.topics.length > 0) {
      await StudyPlan.findByIdAndDelete(oldStudyPlan._id);
      console.log(`🗑️ Deleted old study plan: ${oldStudyPlan._id}`);
    } else {
      console.warn(`⚠️ NEW plan has 0 topics - NOT deleting old plan as backup`);
    }

    // Verify the new plan
    const verifyPlan = await StudyPlan.findById(newStudyPlan._id).lean();
    const uniqueNewIds = [...new Set(verifyPlan.topics.map(t => t.topicId.toString()))];
    console.log(`✅ NEW study plan verified: ${uniqueNewIds.length} unique topic IDs out of ${verifyPlan.topics.length} total`);

    res.json({
      message: "New study plan created successfully with all topics",
      oldStudyPlanId: oldStudyPlan._id.toString(),
      newStudyPlanId: newStudyPlan._id.toString(),
      topicsAdded: newStudyPlan.topics.length,
      uniqueTopicIds: uniqueNewIds.length,
      totalDays: Math.ceil(allTopics.length / 2)
    });
  } catch (error) {
    console.error("❌ Error creating new study plan:", error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// Mark topic as pending
// POST /studyplan/pending
router.post("/pending", async (req, res) => {
  try {
    const { userId, topicId } = req.body;

    console.log(`📝 Marking topic as pending: userId=${userId}, topicId=${topicId}`);
    console.log(`📝 topicId type: ${typeof topicId}, value: ${topicId}`);

    // First, find the LATEST study plan for this user
    const latestPlan = await StudyPlan.findOne({ userId })
      .sort({ createdAt: -1 });

    if (!latestPlan) {
      console.error(`❌ No study plan found for userId=${userId}`);
      return res.status(404).json({ error: "No study plan found for this user" });
    }

    console.log(`✅ Found latest study plan: ${latestPlan._id}`);
    console.log(`📊 Study plan has ${latestPlan.topics.length} topics`);

    // Check if this topic exists in the study plan
    const topicExists = latestPlan.topics.some(t =>
      t.topicId && t.topicId.toString() === topicId.toString()
    );

    if (!topicExists) {
      console.error(`❌ Topic ${topicId} not found in study plan ${latestPlan._id}`);
      return res.status(404).json({
        error: "Topic not found in study plan",
        availableTopics: latestPlan.topics.map(t => t.topicId?.toString()).filter(Boolean)
      });
    }

    console.log(`✅ Topic ${topicId} exists in study plan`);

    // Update status
    latestPlan.topics.forEach(t => {
      if (t.topicId && t.topicId.toString() === topicId.toString()) {
        t.status = "pending";
        t.completedAt = null;
        console.log(`✅ Updated topic: ${t.topicId} to pending`);
      }
    });

    await latestPlan.save();
    console.log(`✅ Study plan saved successfully`);
    res.json({ message: "Topic marked as pending", plan: latestPlan });
  } catch (error) {
    console.error("❌ Error updating topic:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;