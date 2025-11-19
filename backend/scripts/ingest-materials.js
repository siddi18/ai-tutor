// Ingest study materials organized by class/subject folders, tagging metadata
// Directory layout example (default: backend/pdfs/study-materials):
//   study-materials/
//     class-11/
//       science/*.pdf
//       maths/*.pdf
//       english/*.pdf
//     class-12/
//       physics/*.pdf
//       chemistry/*.pdf
//       maths/*.pdf
//
// Usage:
//   node scripts/ingest-materials.js --user <mongoUserId>
//   node scripts/ingest-materials.js --root "C:\\materials" --user <id> --backend http://localhost:5000

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");

function parseArgs() {
  const a = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < a.length; i++) {
    const t = a[i];
    if (t.startsWith('--')) {
      const k = t.slice(2);
      const v = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
      out[k] = v;
    }
  }
  return out;
}

function toClassName(dirName) {
  const s = dirName.toLowerCase().replace(/\s+/g, '');
  if (s.includes('class12') || s.includes('class-xii') || s.includes('class-12') || s.includes('12')) return '12';
  if (s.includes('class11') || s.includes('class-xi') || s.includes('class-11') || s.includes('11')) return '11';
  return '11';
}

async function uploadWithOverrides(backend, userId, filePath, className, subject) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  const url = `${backend.replace(/\/$/, '')}/api/upload-material/${userId}?class=${encodeURIComponent(className)}&subject=${encodeURIComponent(subject)}`;
  const res = await axios.post(url, form, { headers: form.getHeaders(), maxBodyLength: Infinity });
  return res.data;
}

async function main() {
  const args = parseArgs();
  const backend = (args.backend || process.env.BACKEND_URL || 'http://localhost:5000').trim();
  const userId = (args.user || process.env.USER_ID || '').trim();
  const defaultRoot = path.resolve(__dirname, '..', 'pdfs');
  const root = args.root ? path.resolve(args.root) : defaultRoot;

  console.log('📁 Root:', root);
  console.log('🔗 Backend:', backend);
  console.log('👤 UserId:', userId || '<not set>');

  if (!userId) {
    console.error('❌ Provide --user <id> or set USER_ID');
    process.exit(1);
  }
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error('❌ Root directory not found:', root);
    process.exit(1);
  }

  // Check if root contains PDF files directly
  const directPdfs = fs.readdirSync(root).filter(f => f.toLowerCase().endsWith('.pdf'));
  
  const results = [];

  // Handle direct PDFs in root folder
  if (directPdfs.length > 0) {
    console.log(`\n📄 Found ${directPdfs.length} PDF(s) directly in root folder`);
    for (const fname of directPdfs) {
      const full = path.join(root, fname);
      // Try to extract class and subject from filename
      // Example: "class 12 english.pdf" or "12-english.pdf"
      const lowerName = fname.toLowerCase();
      let className = '11'; // default
      let subject = 'General'; // default
      
      if (lowerName.includes('12') || lowerName.includes('xii')) className = '12';
      if (lowerName.includes('11') || lowerName.includes('xi')) className = '11';
      
      if (lowerName.includes('english')) subject = 'English';
      else if (lowerName.includes('physics')) subject = 'Physics';
      else if (lowerName.includes('chemistry')) subject = 'Chemistry';
      else if (lowerName.includes('math')) subject = 'Mathematics';
      else if (lowerName.includes('biology')) subject = 'Biology';
      
      process.stdout.write(`\n[${className}/${subject}] 📤 ${fname} ... `);
      try {
        const data = await uploadWithOverrides(backend, userId, full, className, subject);
        console.log('done');
        results.push({ ok: true, file: full, data: { vectorCount: data.vectorCount, count: data.count } });
      } catch (e) {
        console.log('failed');
        results.push({ ok: false, file: full, error: e.response?.data || e.message });
      }
    }
  }

  // Handle nested folder structure (class-XX/subject/)
  const classDirs = fs.readdirSync(root).filter(d => {
    const fullPath = path.join(root, d);
    return fs.statSync(fullPath).isDirectory();
  });

  for (const classDir of classDirs) {
    const classPath = path.join(root, classDir);
    const className = toClassName(classDir);
    
    const items = fs.readdirSync(classPath);
    const subjectDirs = items.filter(d => fs.statSync(path.join(classPath, d)).isDirectory());

    for (const subjectDir of subjectDirs) {
      const subjectPath = path.join(classPath, subjectDir);
      const subject = subjectDir.replace(/[_-]+/g, ' ').trim();
      const pdfs = fs.readdirSync(subjectPath).filter(f => f.toLowerCase().endsWith('.pdf'));

      for (let i = 0; i < pdfs.length; i++) {
        const fname = pdfs[i];
        const full = path.join(subjectPath, fname);
        process.stdout.write(`\n[${className}/${subject}] 📤 ${fname} ... `);
        try {
          const data = await uploadWithOverrides(backend, userId, full, className, subject);
          console.log('done');
          results.push({ ok: true, file: full, data: { vectorCount: data.vectorCount, count: data.count } });
        } catch (e) {
          console.log('failed');
          results.push({ ok: false, file: full, error: e.response?.data || e.message });
        }
      }
    }
  }

  const ok = results.filter(r => r.ok).length;
  const fail = results.length - ok;
  console.log(`\n🎉 Materials ingestion complete. Success: ${ok}, Failed: ${fail}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
