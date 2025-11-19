// quiz.js - Updated version with topicName
const express = require("express");
const axios = require("axios");
const StudyPlan = require("../models/StudyPlan");
const QuizResult = require("../models/quizResult");
const Quiz = require("../models/Quiz");
const Topic = require("../models/Topic");
const router = express.Router();

// GET /quiz?userId=&subject=&topicId=&topicName=
router.get("/", async (req, res) => {
  try {
    const { userId, subject, topicId, topicName: topicNameFromClient } = req.query;

    if (!userId || !subject || !topicId) {
      return res.status(400).json({ error: "userId, subject, and topicId are required" });
    }

    // Check if user has completed this topic
    const plan = await StudyPlan.findOne({ userId, "topics.topicId": topicId });
    if (!plan) return res.status(404).json({ error: "Study plan not found" });

    const topicStatus = plan.topics.find(t => t.topicId.toString() === topicId);
    if (!topicStatus || topicStatus.status !== "completed") {
      return res.status(403).json({ error: "Complete this topic before taking the quiz" });
    }

    // Fetch topic name from DB as fallback
    const topicDoc = await Topic.findById(topicId);
    const dbTopicName = topicDoc ? topicDoc.topic : "Unknown";

    // ✅ Prefer the name coming from the UI, fall back to DB
    const topicName = (topicNameFromClient && topicNameFromClient.trim()) || dbTopicName;

    console.log(`🔍 Looking for quiz: topicId=${topicId}, subject=${subject}, topicName="${topicName}"`);
    console.log(`   Client sent: "${topicNameFromClient || 'none'}", DB has: "${dbTopicName}"`);

    // Check if quiz already exists in database
    let storedQuiz = await Quiz.findOne({ topicId, subject });
    
    if (storedQuiz) {
      console.log(`📚 Found existing quiz for topicId=${topicId}`);
      console.log(`   Stored topic name: "${storedQuiz.topicName || 'N/A'}"`);
      console.log(`   Expected topic name: "${topicName}"`);
      console.log(`   Questions: ${storedQuiz.questions?.length}`);
      
      // Validate that the stored quiz matches the requested topic
      const storedTopicName = storedQuiz.topicName?.toLowerCase() || "";
      const expectedTopicName = topicName.toLowerCase();
      
      // Check if topic names match
      if (storedTopicName && storedTopicName !== expectedTopicName) {
        console.warn(`⚠️ Topic name mismatch! Stored: "${storedQuiz.topicName}", Expected: "${topicName}"`);
        console.warn(`   Deleting old quiz and regenerating...`);
        await Quiz.deleteOne({ topicId, subject });
        storedQuiz = null;
      } else if (storedQuiz.questions && storedQuiz.questions[0]) {
        // If no topicName stored (old quiz), validate by checking question content
        if (!storedTopicName) {
          const firstQuestion = storedQuiz.questions[0].question?.toLowerCase() || "";
          const topicKeywords = topicName.toLowerCase().split(' ').filter(w => w.length > 3);
          
          console.log(`   First question: ${storedQuiz.questions[0].question?.substring(0, 80)}...`);
          
          const hasTopicKeyword = topicKeywords.some(keyword => 
            firstQuestion.includes(keyword) || 
            storedQuiz.questions.some(q => q.question?.toLowerCase().includes(keyword))
          );
          
          if (!hasTopicKeyword && topicName !== "Unknown") {
            console.warn(`⚠️ Quiz content doesn't match topic "${topicName}", regenerating...`);
            await Quiz.deleteOne({ topicId, subject });
            storedQuiz = null;
          }
        } else {
          console.log(`✅ Quiz matches topic "${topicName}", using cached version`);
        }
      }
    }
    
    if (!storedQuiz) {
      // Generate quiz using Groq LLM directly (no Pinecone to save quota)
      const Groq = require("groq-sdk");
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      
      console.log(`🤖 Generating quiz for topic: ${topicName} (${subject})`);
      
      const prompt = `You are an expert quiz generator for ${subject} exams (JEE/NEET level).

Generate exactly 5 multiple-choice questions about "${topicName}" for ${subject}.

REQUIREMENTS:
1. Questions should be exam-level (JEE/NEET difficulty)
2. Each question must have exactly 4 options (A, B, C, D)
3. Mark the correct answer
4. Questions should test conceptual understanding
5. Cover different aspects of the topic
6. Use proper scientific terminology

Return ONLY valid JSON in this exact format:
{
  "questions": [
    {
      "questionId": "q1",
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "Option A"
    }
  ]
}`;

      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: "You are an expert quiz generator for competitive exams. Return only valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: "json_object" }
      });

      let quizData;
      try {
        const responseText = completion.choices[0].message.content.trim();
        quizData = JSON.parse(responseText);
      } catch (parseError) {
        console.error("Failed to parse quiz JSON:", parseError);
        return res.status(500).json({ error: "Failed to generate valid quiz" });
      }

      if (!quizData.questions || !Array.isArray(quizData.questions)) {
        return res.status(500).json({ error: "Invalid quiz format" });
      }

      // Store the quiz in database
      storedQuiz = new Quiz({
        topicId,
        subject,
        topicName, // Store topic name for validation
        questions: quizData.questions,
        generatedAt: new Date()
      });
      await storedQuiz.save();
      console.log(`✅ Quiz generated and stored for "${topicName}" (${subject}) - ${quizData.questions.length} questions`);
    }

    // Validate that stored quiz has proper structure
    if (!storedQuiz.questions || storedQuiz.questions.length === 0) {
      console.error("❌ Stored quiz has no questions, deleting and regenerating...");
      await Quiz.deleteOne({ topicId, subject });
      return res.status(500).json({ error: "Invalid quiz data, please try again" });
    }

    // Check if first question has options
    const firstQuestion = storedQuiz.questions[0];
    if (!firstQuestion.options || firstQuestion.options.length === 0) {
      console.error("❌ Stored quiz has no options, deleting and regenerating...");
      console.error("First question:", JSON.stringify(firstQuestion, null, 2));
      await Quiz.deleteOne({ topicId, subject });
      return res.status(500).json({ error: "Invalid quiz structure, please try again" });
    }

    console.log(`📤 Returning ${storedQuiz.questions.length} questions for ${topicName}`);
    console.log(`First question sample:`, {
      questionId: firstQuestion.questionId,
      question: firstQuestion.question?.substring(0, 50),
      optionsCount: firstQuestion.options?.length
    });

    // Return questions without answers
    const questions = storedQuiz.questions.map(q => ({
      questionId: q.questionId,
      question: q.question,
      options: q.options
    }));

    res.json({
      topic: topicName,
      subject,
      questions
    });
  } catch (error) {
    console.error("Error fetching quiz:", error.message);
    res.status(500).json({ error: "Failed to fetch quiz" });
  }
});

// POST /quiz/submit
router.post("/submit", async (req, res) => {
  try {
    const { userId, subject, topicId, answers } = req.body;

    if (!userId || !topicId) {
      return res.status(400).json({ error: "userId and topicId are required" });
    }

    // Get the stored quiz from database (with answers)
    const storedQuiz = await Quiz.findOne({ topicId, subject });
    
    if (!storedQuiz) {
      return res.status(404).json({ error: "Quiz not found. Please generate the quiz first." });
    }

    let correctCount = 0;
    const details = [];

    for (const [questionId, selectedAnswer] of Object.entries(answers)) {
      const question = storedQuiz.questions.find(q => q.questionId === questionId);
      if (!question) continue;

      const isCorrect = selectedAnswer === question.answer;
      if (isCorrect) correctCount++;

      details.push({
        question: question.question,
        selected: selectedAnswer,
        correctAnswer: question.answer,
        isCorrect
      });
    }

    const totalQuestions = storedQuiz.questions.length;
    const score = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;

    // Save quiz result
    const quizResult = new QuizResult({
      userId,
      topicId,
      score,
      answers: details
    });
    await quizResult.save();

    res.json({
      totalQuestions,
      correct: correctCount,
      score,
      details
    });
  } catch (error) {
    console.error("Error submitting quiz:", error.message);
    res.status(500).json({ error: "Failed to evaluate quiz" });
  }
});

// Add to quiz.js for maintenance
router.delete("/cleanup", async (req, res) => {
  try {
    // MongoDB will auto-delete expired quizzes, but you can force cleanup
    const result = await Quiz.deleteMany({ 
      generatedAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
    });
    res.json({ message: `Cleaned up ${result.deletedCount} old quizzes` });
  } catch (error) {
    console.error("Cleanup error:", error);
    res.status(500).json({ error: "Cleanup failed" });
  }
});

// Delete specific quiz by topicId
router.delete("/:topicId", async (req, res) => {
  try {
    const { topicId } = req.params;
    const result = await Quiz.deleteOne({ topicId });
    if (result.deletedCount > 0) {
      console.log(`✅ Deleted quiz for topicId: ${topicId}`);
      res.json({ message: `Quiz deleted for topic ${topicId}` });
    } else {
      res.json({ message: "No quiz found to delete" });
    }
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: "Delete failed" });
  }
});

// Delete all quizzes (for testing)
router.delete("/", async (req, res) => {
  try {
    const result = await Quiz.deleteMany({});
    console.log(`🗑️ Deleted all ${result.deletedCount} quizzes`);
    res.json({ message: `Deleted ${result.deletedCount} quizzes` });
  } catch (error) {
    console.error("Delete all error:", error);
    res.status(500).json({ error: "Delete failed" });
  }
});

module.exports = router;