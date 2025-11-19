require('dotenv').config()

// Provide sensible fallbacks so the server still starts locally if .env is missing
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || '';
const FLASK_PARSER_URL = process.env.FLASK_PARSER_URL || "https://tutor-flask-1.onrender.com";

module.exports = { PORT, MONGODB_URI, FLASK_PARSER_URL };