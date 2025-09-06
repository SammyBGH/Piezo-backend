const express = require('express');
const http = require('http');
const { readFileSync, writeFileSync } = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');

// allow CORS from frontend
app.use(cors());
app.use(bodyParser.json());

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const DATA_PATH = path.join(__dirname, 'data.json');

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

// ===== API: Get all history =====
app.get('/api/data', (req, res) => {
  const arr = loadDataArray();
  res.json({ success: true, data: arr });
});

// ===== API: Accept device POST =====
// Expected JSON: { steps, voltage, current, power }
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

  // Attach timestamp if not provided
  reading.timestamp = reading.timestamp || new Date().toISOString();

  try {
    const arr = loadDataArray();
    arr.push(reading); // append history
    writeFileSync(DATA_PATH, JSON.stringify(arr, null, 2), 'utf-8');

    // Emit new reading to all clients
    io.emit('new-reading', reading);

    return res.json({ success: true, data: reading });
  } catch (e) {
    console.error('Failed to append reading', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ===== Socket.io Connection =====
io.on('connection', (socket) => {
  console.log('Client connected', socket.id);

  // send current history to new client
  const arr = loadDataArray();
  socket.emit('initial-data', arr);

  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
  });
});

// ===== Simulator: loop entries from data.json every 3s =====
function startSimulator() {
  const arr = loadDataArray();
  if (!arr.length) return;

  let simulatedIndex = 0;
  setInterval(() => {
    const data = loadDataArray();
    if (!data.length) return;

    const reading = { ...data[simulatedIndex] };
    reading.timestamp = new Date().toISOString(); // simulate live timestamp

    io.emit('new-reading', reading);

    simulatedIndex = (simulatedIndex + 1) % data.length;
  }, 3000);
}

startSimulator();

// ===== Start server =====
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
