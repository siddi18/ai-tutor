const axios = require('axios');

// Flask parser service URL
const FLASK_PARSER_URL = process.env.FLASK_PARSER_URL || "https://tutor-flask-1.onrender.com";

/**
 * Ping Flask service to keep it warm and prevent cold starts
 * Call this periodically (every 10 minutes) to keep service active
 */
async function pingFlaskService() {
  try {
    // Use root endpoint as fallback until /health is deployed
    const response = await axios.get(`${FLASK_PARSER_URL}/`, {
      timeout: 10000
    });
    console.log('✅ Flask service is warm (status:', response.status, ')');
    return true;
  } catch (error) {
    console.warn('⚠️ Flask service ping failed:', error.message);
    return false;
  }
}

/**
 * Keep Flask service warm by pinging every 10 minutes
 * This prevents Render free tier from spinning down after 15min idle
 */
function startFlaskKeepAlive() {
  // Ping immediately on startup
  pingFlaskService();
  
  // Then ping every 10 minutes
  setInterval(async () => {
    console.log('🔄 Pinging Flask service to keep warm...');
    await pingFlaskService();
  }, 10 * 60 * 1000); // 10 minutes
  
  console.log('🔥 Flask keep-alive started (ping every 10 minutes)');
}

module.exports = {
  pingFlaskService,
  startFlaskKeepAlive
};
