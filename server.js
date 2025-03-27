// Express server setup for Raspberry Pi System Monitor with AI features
const express = require('express');
const path = require('path');
const http = require('http');
const multer = require('multer');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { getSystemDetails } = require('./utils/system.js');

const app = express();
const PORT = 3000;


// Create or open a database file
const db = new sqlite3.Database('logs.db');

// Create logs table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT,
    user_message TEXT,
    ai_reply TEXT
  )
`);

app.get('/logs', (req, res) => {
  res.sendFile(path.join(__dirname, 'logs.html'));
});


app.get('/api/logs', (req, res) => {
  db.all(`SELECT * FROM logs ORDER BY id DESC`, (err, rows) => {
    if (err) {
      console.error("📛 Failed to fetch logs:", err);
      return res.status(500).json({ error: 'Failed to retrieve logs' });
    }

    res.json(rows);
  });
});



app.use(express.static(path.join(__dirname)));

// Setup Multer for image upload (files temporarily saved in 'uploads/' directory)
const upload = multer({ dest: 'uploads/' });


// Middleware to serve static frontend files and parse JSON body
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// ✅ API Route: Fetch system details (CPU, memory, disk, etc.)
app.get('/api/system', async (req, res) => {
  try {
    const data = await getSystemDetails();
    res.json(data);
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ error: 'Failed to retrieve system info' });
  }
});

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'No message provided' });

  console.log("📥 Message from frontend:", message);

  const data = JSON.stringify({
    model: "gemma:2b",
    messages: [
      { role: 'system', content: 'You are a helpful STEM club assistant.' },
      { role: 'user', content: message }
    ],
    stream: false
  });

  const options = {
    hostname: 'localhost',
    port: 11434,
    path: '/api/chat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  const ollamaReq = http.request(options, ollamaRes => {
    let body = '';

    ollamaRes.on('data', chunk => {
      body += chunk.toString();
    });

    ollamaRes.on('end', () => {
      let parsed;
try {
  parsed = JSON.parse(body);
} catch (e) {
  console.error("❌ Failed to parse Ollama response:", body);
  return res.status(500).json({ error: 'Invalid response from AI' });
}

const reply = parsed.message?.content || 'No reply';
console.log("💬 AI reply:", reply);

// Log to DB
db.run(
  `INSERT INTO logs (timestamp, user_message, ai_reply) VALUES (?, ?, ?)`,
  [new Date().toISOString(), message, reply],
  err => {
    if (err) console.error("📝 Failed to insert log into DB:", err);
  }
);

res.json({ reply });
    });
  });

  ollamaReq.on('error', err => {
    console.error("❌ Ollama request error:", err.message);
    res.status(500).json({ error: 'Failed to connect to AI' });
  });

  ollamaReq.write(data);
  ollamaReq.end();
});


// ✅ API Route: Image captioning using a Python script
const { exec } = require('child_process');

app.post('/api/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });

    const imagePath = path.join(__dirname, req.file.path);
    console.log("📷 Image received:", imagePath);

    // Execute the caption.py script with uploaded image as argument
    exec(`python3 caption.py ${imagePath}`, (error, stdout, stderr) => {
      // Clean up uploaded image file regardless of success or failure
      fs.unlink(imagePath, unlinkErr => {
        if (unlinkErr) console.error("🧹 Failed to delete uploaded file:", unlinkErr);
      });

      if (error) {
        console.error(`❌ Caption error: ${error.message}`);
        return res.status(500).json({ error: 'Image analysis failed.' });
      }
      if (stderr) console.warn(`⚠️ Caption stderr: ${stderr}`);

      const caption = stdout.trim();
      console.log("🧠 AI Caption:", caption);
      res.json({ description: caption });
    });

  } catch (err) {
    console.error("❌ Image route error:", err);
    res.status(500).json({ error: 'Image processing failed.' });
  }
});

// ✅ Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
