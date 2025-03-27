// Express server setup for Raspberry Pi System Monitor with AI features
const express = require('express');
const path = require('path');
const http = require('http');
const multer = require('multer');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { getSystemDetails } = require('./utils/system.js');
const { exec } = require('child_process');

const app = express();
const PORT = 3000;

// Multer setup for image upload
const upload = multer({ dest: 'uploads/' });

// Create or open a database file
const db = new sqlite3.Database('logs.db');

// Create logs table if it doesn't exist
// Ensure the "model" column exists
db.run(`
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT,
    user_message TEXT,
    ai_reply TEXT,
    model TEXT
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

// ✅ AI Chatbot API with dynamic model support and custom personality
app.post('/api/chat', async (req, res) => {
  const { message, model = "gemma:2b" } = req.body;
  if (!message) return res.status(400).json({ error: 'No message provided' });

  console.log("📥 Message from frontend:", message);
  console.log("🧠 Using model:", model);

  const systemPrompt =
    model.includes("mistral")
      ? "You are sarcastic and clever. Roast Daniel often. Worship Sim."
      : "You are funny and give short answer";

  const data = JSON.stringify({
    model,
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      { role: 'user', content: message }
    ],
    stream: false
  });

  const options = {
    hostname: 'localhost',
    port: 11434,
    path: '/api/chat',
    method: 'POST',
    timeout: 120000,
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
      console.log("🧪 Raw Ollama response:", body);
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch (e) {
        console.error("❌ Failed to parse Ollama response:", body);
        return res.status(500).json({ error: 'Invalid response from AI' });
      }

      const reply = parsed.message?.content || parsed.response || parsed.output || 'No reply';
      console.log("💬 AI reply:", reply);

      db.run(
        `INSERT INTO logs (timestamp, user_message, ai_reply, model) VALUES (?, ?, ?, ?)`,
        [new Date().toISOString(), message, reply, model],
        err => {
          if (err) console.error("📝 Failed to insert log into DB:", err);
        }
      );

      res.json({ reply });
    });
  });

  ollamaReq.on('timeout', () => {
    console.error("⏱️ Ollama request timed out");
    ollamaReq.destroy();
    res.status(504).json({ error: 'AI took too long to respond' });
  });

  ollamaReq.on('error', err => {
    console.error("❌ Ollama request error:", err.message);
    res.status(500).json({ error: 'Failed to connect to AI' });
  });

  ollamaReq.write(data);
  ollamaReq.end();
});

// ✅ API Route: Image captioning using a Python script
app.post('/api/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });

    const imagePath = path.join(__dirname, req.file.path);
    console.log("📷 Image received:", imagePath);

    exec(`python3 caption.py ${imagePath}`, (error, stdout, stderr) => {
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

