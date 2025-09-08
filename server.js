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
  steps: { type: Number, required: true },
  power_mW: { type: Number, required: true },
  voltage_V: { type: Number, required: true },
  current_mA: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now }
});

const Reading = mongoose.model('Reading', ReadingSchema);

// ====== API: Get all readings ======
app.get('/api/data', async (req, res) => {
  try {
    const readings = await Reading.find().sort({ timestamp: 1 }); // oldest -> newest
    res.json({ success: true, data: readings });
  } catch (err) {
    console.error('❌ Failed to fetch readings:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ====== API: Post new reading ======
app.post('/api/data', async (req, res) => {
  try {
    const { steps, power, voltage, current, timestamp } = req.body;

    const reading = new Reading({
      steps: Number(steps),
      power_mW: Number(power),
      voltage_V: Number(voltage),
      current_mA: Number(current),
      timestamp: timestamp ? new Date(timestamp) : undefined
    });

    const saved = await reading.save();

    io.emit('new-reading', saved); // live update
    res.json({ success: true, data: saved });
  } catch (err) {
    console.error('❌ Error saving reading:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ====== API: Totals ======
app.get('/api/totals', async (req, res) => {
  try {
    const totals = await Reading.aggregate([
      {
        $group: {
          _id: null,
          totalSteps: { $sum: "$steps" },
          totalPower: { $sum: "$power_mW" },
          avgPower: { $avg: "$power_mW" },
          avgVoltage: { $avg: "$voltage_V" },
          avgCurrent: { $avg: "$current_mA" }
        }
      }
    ]);

    if (!totals.length) {
      return res.json({
        success: true,
        data: { totalSteps: 0, totalPower: 0, avgPower: 0, avgVoltage: 0, avgCurrent: 0 }
      });
    }

    res.json({ success: true, data: totals[0] });
  } catch (err) {
    console.error('❌ Failed to fetch totals:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ====== API: Daily Breakdown ======
app.get('/api/daily', async (req, res) => {
  try {
    const daily = await Reading.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
          totalSteps: { $sum: "$steps" },
          totalPower: { $sum: "$power_mW" },
          avgVoltage: { $avg: "$voltage_V" },
          avgCurrent: { $avg: "$current_mA" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({ success: true, data: daily });
  } catch (err) {
    console.error('❌ Failed to fetch daily breakdown:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ====== Socket.io connection ======
io.on('connection', async (socket) => {
  console.log('Client connected', socket.id);
  try {
    const readings = await Reading.find().sort({ timestamp: 1 });
    socket.emit('initial-data', readings);
  } catch (err) {
    console.error('❌ Failed to fetch initial data for socket:', err);
  }
  socket.on('disconnect', () => console.log('Client disconnected', socket.id));
});

// ====== Start server ======
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
