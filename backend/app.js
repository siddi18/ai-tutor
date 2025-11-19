const express = require('express')
const mongoose = require('mongoose')
const config = require('./utils/config')
const cors = require('cors') 
const path = require('path')
const routes = require("./routes/routes");
const studyPlanRoutes = require("./routes/studyPlan");
const quizRoutes = require("./routes/quiz");
const progressRoutes = require("./routes/progress");
const userRoutes = require("./routes/user");
const notificationRoutes = require('./routes/notifications');
const dashboardRoutes = require('./routes/dashboard');
const testRoutes = require('./routes/testRoutes');
const { startFlaskKeepAlive } = require('./services/flaskKeepAlive');

mongoose.connect(config.MONGODB_URI).then(() => {
    console.log(`MongoDB connected`);
    // Start Flask service keep-alive to prevent Render cold starts
    startFlaskKeepAlive();
})
.catch(error => console.log(`${error}`))

const app = express()
app.use(cors())
app.use(express.json())

// API routes - MUST come before static file serving
app.use('/api', routes);
app.use("/api/users", userRoutes);
app.use("/study-plan", studyPlanRoutes);
app.use("/quiz", quizRoutes);
app.use("/progress", progressRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use("/api", require("./routes/testRoutes"));
const { initializeMockTests } = require("./controllers/mockTestController");
initializeMockTests();

// Serve frontend build (in production)
const frontendDistPath = path.join(__dirname, "../frontend/dist");
app.use(express.static(frontendDistPath));

// Catch-all route to serve index.html for client-side routing
app.get("/*", (req, res) => {
  res.sendFile(path.join(frontendDistPath, "index.html"));
});

module.exports = app