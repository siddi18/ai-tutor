import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import ApiService from "../services/api";

const getCurrentUserId = () => {
  const user = JSON.parse(localStorage.getItem("mongoUser"));
  return user?._id || null;
};

const StudyPlan = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dailySchedule, setDailySchedule] = useState([]);
  const [fixing, setFixing] = useState(false);

  const handleFixStudyPlan = async () => {
    try {
      setFixing(true);
      const userId = getCurrentUserId();
      if (!userId) throw new Error("No user logged in");

      await ApiService.fixStudyPlan(userId);
      alert("Study plan fixed! Reloading...");
      window.location.reload();
    } catch (e) {
      console.error("Failed to fix study plan:", e);
      alert("Failed to fix study plan. Check console for details.");
    } finally {
      setFixing(false);
    }
  };

  useEffect(() => {
    const fetchTopics = async () => {
      try {
        setLoading(true);
        setError("");
        const userId = getCurrentUserId();
        if (!userId) throw new Error("No user logged in");

        // Read selected syllabus/studyPlan from navigation state if present
        const selectedSyllabusId = location?.state?.syllabusId || null;
        const selectedStudyPlanId = location?.state?.studyPlanId || null;

        // Fetch the corresponding study plan (by studyPlanId, then by syllabus, else latest)
        const studyPlanData = await ApiService.getStudyPlan(userId, {
          syllabusId: selectedSyllabusId,
          studyPlanId: selectedStudyPlanId
        });

        const studyPlanTopics = studyPlanData?.studyPlan?.topics || [];
        
        // Build a mapping from raw Topic._id (populated) to study plan topicId
        // The study plan stores references; we need to match them
        const idMap = new Map();
        const completed = new Set();
        
        studyPlanTopics.forEach((t) => {
          const populatedTopicId = t?.topicId?._id?.toString() || t?.topicId?.toString();
          const studyPlanTopicId = populatedTopicId;
          if (populatedTopicId) idMap.set(populatedTopicId, studyPlanTopicId);
          if (t.status === "completed" && populatedTopicId) completed.add(populatedTopicId);
        });
        
        console.log("Completed topics (from plan):", Array.from(completed));

        // Build schedule from the study plan topics only
        const daysMap = new Map();
        const startDate = new Date();
        studyPlanTopics.forEach((t, idx) => {
          const populated = t?.topicId || {};
          const rawTopicId = populated?._id?.toString() || t?.topicId?.toString();
          if (!rawTopicId) return;
          const scheduledDay = t?.scheduledDay || Math.floor(idx / 2) + 1;
          const dayKey = `day${scheduledDay}`;
          const entry = {
            id: rawTopicId,
            studyPlanId: rawTopicId,
            name: populated?.topic || 'Topic',
            subject: populated?.subject || 'Subject',
            completed: t?.status === 'completed',
          };
          if (!daysMap.has(dayKey)) daysMap.set(dayKey, []);
          daysMap.get(dayKey).push(entry);
        });

        const days = [];
        const sortedKeys = Array.from(daysMap.keys()).sort((a,b) => parseInt(a.replace('day','')) - parseInt(b.replace('day','')));
        sortedKeys.forEach((key) => {
          const dayNumber = parseInt(key.replace('day',''));
          const date = new Date(startDate);
          date.setDate(startDate.getDate() + (dayNumber - 1));
          days.push({
            dayNumber,
            date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            topics: daysMap.get(key)
          });
        });

        console.log("Final daily schedule:", days);
        setDailySchedule(days);
      } catch (e) {
        console.error("Failed to load topics:", e);
        setError("Failed to load study plan. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchTopics();
  }, [location.state]);

  const handleMarkComplete = async (topicId, studyPlanTopicId) => {
    try {
      const userId = getCurrentUserId();
      if (!userId) throw new Error("No user logged in");
      
      // Use the study plan topic ID for the API call
      console.log(`Marking complete - rawId: ${topicId}, studyPlanId: ${studyPlanTopicId}`);
      await ApiService.markProgress(userId, studyPlanTopicId);
      
      // Update the daily schedule
      setDailySchedule((prev) =>
        prev.map((day) => ({
          ...day,
          topics: day.topics.map((t) =>
            t.id === topicId ? { ...t, completed: true } : t
          ),
        }))
      );
    } catch (e) {
      console.error("Failed to mark topic as complete:", e);
      alert("Failed to mark topic as complete. Please try again.");
    }
  };

  const handleTakeQuiz = (topic) => {
    if (!topic.completed) {
      alert("Please mark this topic as completed before taking the quiz.");
      return;
    }
    
    navigate("/quiz", {
      state: {
        selectedTopic: {
          subject: topic.subject,
          topic: topic.name,
          topicId: topic.id,
          completed: topic.completed,
        },
      },
    });
  };

  return (
    <div className="min-h-screen bg-cover bg-center bg-fixed" style={{ backgroundImage: "url('/images/backgroundimage1.png')" }}>
      {/* Header */}
      <div className="bg-transparent shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-r from-teal-500 to-teal-600 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">Study Plan</h1>
              <p className="text-sm text-gray-300">2 Topics Per Day • From Database</p>
            </div>
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {loading && (
          <div className="text-center text-white/90 py-8">Loading study plan...</div>
        )}
        
        {!loading && error && (
          <div className="space-y-3 mb-4">
            <div className="text-red-200 bg-red-600/20 border border-red-400/40 rounded-md px-4 py-3">{error}</div>
            <div className="text-center">
              <button
                onClick={handleFixStudyPlan}
                disabled={fixing}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md disabled:opacity-50"
              >
                {fixing ? "Fixing..." : "🔧 Fix Study Plan (Regenerate Topic IDs)"}
              </button>
            </div>
          </div>
        )}
        
        {!loading && !error && dailySchedule.length === 0 && (
          <div className="text-center text-white/90 py-8">No topics found. Upload a syllabus to generate topics.</div>
        )}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {dailySchedule.map((day) => (
            <div key={day.dayNumber} className="bg-white/10 backdrop-blur rounded-xl p-5 border border-white/20 flex flex-col">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-white">Day {day.dayNumber}</h2>
                <p className="text-xs text-gray-300">{day.date}</p>
              </div>
              <div className="space-y-3 flex-1">
                {day.topics.map((topic) => (
                  <div key={topic.id} className={`border rounded-lg p-3 transition ${
                    topic.completed 
                      ? "bg-teal-600/20 border-teal-400/40" 
                      : "bg-white/5 border-white/20 hover:bg-white/10"
                  }`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white mb-1">{topic.name}</p>
                        <p className="text-xs text-gray-300">{topic.subject}</p>
                      </div>
                      {topic.completed && (
                        <svg className="w-5 h-5 text-teal-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {!topic.completed && (
                        <button
                          onClick={() => handleMarkComplete(topic.id, topic.studyPlanId)}
                          className="flex-1 px-3 py-2 text-xs font-medium rounded-md bg-green-600 hover:bg-green-700 text-white transition"
                        >
                          Mark as Complete
                        </button>
                      )}
                      <button
                        onClick={() => handleTakeQuiz(topic)}
                        disabled={!topic.completed}
                        className={`flex-1 px-3 py-2 text-xs font-medium rounded-md transition ${
                          topic.completed
                            ? "bg-teal-500 hover:bg-teal-600 text-white"
                            : "bg-gray-500/50 text-gray-300 cursor-not-allowed"
                        }`}
                      >
                        Take Quiz
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StudyPlan;