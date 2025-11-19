// Ingest all PDFs in backend/pdfs into Pinecone via backend route
// Uses the existing parser-service + /api/upload-syllabus/:userId flow
//
// Usage examples (Windows PowerShell):
//   node scripts/ingest-pdfs.js --user <mongoUserId>
//   node scripts/ingest-pdfs.js --dir "C:\\path\\to\\pdfs" --user <mongoUserId> --backend http://localhost:5000
//   $env:USER_ID="<mongoUserId>"; node scripts/ingest-pdfs.js
//   node scripts/ingest-pdfs.js --dry-run

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");

function parseArgs() {
  const raw = process.argv.slice(2);
  const params = {};

  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (t.startsWith("--")) {
      const key = t.slice(2);
      const val = raw[i + 1] && !raw[i + 1].startsWith("--") ? raw[i + 1] : true;
      params[key] = val;
      if (val !== true) i++;
    }
  }

  return params;
}

async function uploadFile(backendBase, userId, filePath) {
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath));

  const url = `${backendBase.replace(/\/$/, "")}/api/upload-syllabus/${userId}`;
  const res = await axios.post(url, form, { headers: form.getHeaders(), maxBodyLength: Infinity });
  return res.data;
}

async function main() {
  const args = parseArgs();

  const defaultDir = path.resolve(__dirname, "..", "pdfs");
  const dir = args.dir ? path.resolve(args.dir) : defaultDir;
  const backend = (args.backend || process.env.BACKEND_URL || "http://localhost:5000").trim();
  const userId = (args.user || process.env.USER_ID || "").trim();
  const dryRun = !!args["dry-run"];

  console.log("📁 Directory:", dir);
  console.log("🔗 Backend:", backend);
  console.log("👤 UserId:", userId || "<not set>");

  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error("❌ Directory not found or not a folder:", dir);
    process.exit(1);
  }

  const pdfs = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith(".pdf"));
  if (pdfs.length === 0) {
    console.log("⚠️ No PDF files found in:", dir);
    return;
  }

  console.log(`🔎 Found ${pdfs.length} PDF(s).`);
  if (dryRun) {
    pdfs.forEach((f, i) => console.log(`${i + 1}. ${f}`));
    console.log("✅ Dry run complete. No uploads performed.");
    return;
  }

  if (!userId) {
    console.error("❌ Missing user id. Provide with --user <id> or set USER_ID env var.");
    process.exit(1);
  }

  const results = [];
  for (let i = 0; i < pdfs.length; i++) {
    const fname = pdfs[i];
    const full = path.join(dir, fname);
    process.stdout.write(`\n[${i + 1}/${pdfs.length}] 📤 Uploading ${fname} ... `);
    try {
      const data = await uploadFile(backend, userId, full);
      console.log('data-84 :', data);
      const summary = {
        syllabusId: data.syllabusId,
        vectorCount: data.vectorCount,
        topicCount: Array.isArray(data.topics) ? data.topics.length : 0,
      };
      console.log("done");
      console.log("   ➜", JSON.stringify(summary));
      results.push({ file: fname, ok: true, data: summary });
    } catch (err) {
      const msg = err.response?.data || err.message;
      console.log("failed");
      console.error("   ❌", msg);
      results.push({ file: fname, ok: false, error: msg });
    }
  }

  const ok = results.filter(r => r.ok).length;
  const fail = results.length - ok;
  console.log(`\n🎉 Ingestion complete. Success: ${ok}, Failed: ${fail}`);
  if (fail) {
    console.log("Review failures above. You can rerun only failed files by moving them to a temp folder.");
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
