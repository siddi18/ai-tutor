const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");

// Flask parser service URL (cloud-hosted)
const FLASK_PARSER_URL = process.env.FLASK_PARSER_URL || "https://tutor-flask-1.onrender.com";

async function parseSyllabus(filePath) {
  const formData = new FormData();
  formData.append("file", fs.createReadStream(filePath));

  const parseEndpoint = `${FLASK_PARSER_URL}/parse`;
  console.log(`📡 Sending PDF to Flask parser: ${parseEndpoint}`);
  console.log(`⏱️ This may take 2-5 minutes for large PDFs with many topics...`);

  try {
    const response = await axios.post(parseEndpoint, formData, {
      headers: formData.getHeaders(),
      timeout: 300000, // 5 minute timeout for large PDFs
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    
    console.log(`✅ Flask parser responded with ${response.data.items?.length || 0} items`);
    return response.data;
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      console.error('❌ Flask service timeout - PDF processing took too long');
      throw new Error('PDF processing timeout. Try uploading a smaller PDF (max 50 pages recommended).');
    }
    
    if (error.response?.status === 502) {
      console.error('❌ Flask service unavailable (502 Bad Gateway)');
      console.error('   This usually means:');
      console.error('   1. The service is cold-starting (first request after idle)');
      console.error('   2. The service crashed due to memory/timeout limits');
      console.error('   3. The PDF is too large to process on free tier');
      throw new Error('Parser service unavailable. Please wait 30 seconds and try again, or use a smaller PDF.');
    }
    
    if (error.response?.status === 503) {
      console.error('❌ Flask service temporarily unavailable (503)');
      throw new Error('Parser service is restarting. Please wait a minute and try again.');
    }
    
    console.error('❌ Flask parser error:', error.message);
    throw new Error(`Parser service error: ${error.message}`);
  }
}

module.exports = {
  parseSyllabus,
};

