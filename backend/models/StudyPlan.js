const mongoose = require("mongoose");

const studyPlanSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  syllabusId: { type: mongoose.Schema.Types.ObjectId, ref: "Syllabus" },
  topics: [
    {
      topicId: { type: mongoose.Schema.Types.ObjectId, ref: "Topic" },
      status: {
        type: String,
        enum: ["pending", "completed"],
        default: "pending"
      },
      allocatedTime: { // Add time allocation fields
        minutes: Number,
        formatted: String
      },
      scheduledDay: Number, // Which day this topic is scheduled for
      difficulty: String,
      learningObjectives: [String], // RAG-generated learning objectives
      resources: [String] // RAG-retrieved resource references
    }
  ],
  schedule: { // Store the complete schedule
    totalDays: Number,
    studyHoursPerDay: Number,
    dailySchedule: Object
  },
  studyTips: [String], // RAG-generated study tips
  revisionSchedule: { // RAG-generated revision schedule
    description: String,
    days: [Number]
  },
  metadata: { // RAG metadata
    knowledgeBaseReferences: Number,
    generatedAt: Date,
    totalTopics: Number
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("StudyPlan", studyPlanSchema);