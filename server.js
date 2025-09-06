const express = require('express');
const http = require('http');
const { readFileSync, writeFileSync } = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');

// Allow CORS from frontend
app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const DATA_PATH = path.join(__dirname, 'data.json');
const MAX_HISTORY = 1000; // keep last 1000 readings

// ===== Helper to load stored data =====
function loadDataArray() {
  try {
    const raw = readFileSync(DATA_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to read data.json', e);
    return [];
  }
}

// ===== Safe number parser =====
function toNumberOrNull(val) {
  const num = Number(val);
  return isFinite(num) ? num : null;
}

// ===== Normalize keys for frontend =====
function normalizeReading(reading) {
  return {
    steps: toNumberOrNull(reading.steps),
    power_mW: toNumberOrNull(reading.power),
    voltage_V: toNumberOrNull(reading.voltage),
    current_mA: toNumberOrNull(reading.current),
    timestamp: reading.timestamp || new Date().toISOString()
  };
}

// ===== API: Get all history =====
app.get('/api/data', (req, res) => {
  const arr = loadDataArray().map(normalizeReading);
  res.json({ success: true, data: arr });
});

// ===== API: Accept device POST =====
app.post('/api/data', (req, res) => {
  const reading = req.body;

  if (
    !reading ||
    typeof reading.steps === 'undefined' ||
    typeof reading.voltage === 'undefined' ||
    typeof reading.current === 'undefined' ||
    typeof reading.power === 'undefined'
  ) {
    return res.status(400).json({ success: false, message: 'Invalid reading format' });
  }

  // Normalize and save
  const normalized = normalizeReading(reading);

  try {
    const arr = loadDataArray();
    arr.push(normalized);

    // keep last MAX_HISTORY entries
    const trimmed = arr.slice(-MAX_HISTORY);
    writeFileSync(DATA_PATH, JSON.stringify(trimmed, null, 2), 'utf-8');

    // Emit to all connected clients
    io.emit('new-reading', normalized);

    res.json({ success: true, data: normalized });
  } catch (e) {
    console.error('Failed to append reading', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ===== Socket.io Connection =====
io.on('connection', (socket) => {
  console.log('Client connected', socket.id);

  // Send saved history on connect
  const arr = loadDataArray().map(normalizeReading);
  socket.emit('initial-data', arr);

  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
  });
});

// ===== Start server =====
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
