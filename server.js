const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// ====== Socket.io ======
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// ====== Middleware ======
app.use(cors());
app.use(express.json());

// ====== MongoDB ======
const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI, { 
  useNewUrlParser: true, 
  useUnifiedTopology: true 
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// ====== Schema & Model ======
const ReadingSchema = new mongoose.Schema({
  steps: Number,
  power_mW: Number,
  voltage_V: Number,
  current_mA: Number,
  timestamp: { type: Date, default: Date.now }
});
const Reading = mongoose.model('Reading', ReadingSchema);

// ====== API: Get all readings ======
app.get('/api/data', async (req, res) => {
  try {
    const readings = await Reading.find()
      .sort({ timestamp: 1 }); // oldest -> newest
    res.json({ success: true, data: readings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ====== API: Post new reading ======
app.post('/api/data', async (req, res) => {
  const { steps, power, voltage, current, timestamp } = req.body;

  if (
    steps === undefined || 
    power === undefined || 
    voltage === undefined || 
    current === undefined
  ) {
    return res.status(400).json({ success: false, message: 'Invalid reading format' });
  }

  const reading = new Reading({
    steps: Number(steps),
    power_mW: Number(power),
    voltage_V: Number(voltage),
    current_mA: Number(current),
    timestamp: timestamp ? new Date(timestamp) : undefined
  });

  try {
    const saved = await reading.save();

    // Emit to connected clients
    io.emit('new-reading', saved);

    res.json({ success: true, data: saved });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ====== Socket.io connection ======
io.on('connection', async (socket) => {
  console.log('Client connected', socket.id);

  // Send persisted history on connect
  try {
    const readings = await Reading.find().sort({ timestamp: 1 });
    socket.emit('initial-data', readings);
  } catch (err) {
    console.error('Failed to fetch initial data for socket:', err);
  }

  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
  });
});

// ====== Start server ======
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
