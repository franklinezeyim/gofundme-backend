require("dotenv").config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_assignment';

app.use(cors({
  origin: "https://just-funder.vercel.app",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(bodyParser.json());

// MongoDB setup
mongoose.connect(process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/gofundme', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', async () => {
  console.log("✅ MongoDB connected");
  // Seed admin user if it doesn't exist
  const adminCount = await Admin.countDocuments();
  if (adminCount === 0) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const defaultAdmin = new Admin({
      username: 'admin',
      password: hashedPassword
    });
    await defaultAdmin.save();
    console.log('Default admin created: admin / admin123');
  }
});

// Mongoose schemas and models
const campaignSchema = new mongoose.Schema({
  title: String,
  description: String,
  goalAmount: Number,
  currentAmount: Number,
});
const Campaign = mongoose.model('Campaign', campaignSchema);

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const Admin = mongoose.model('Admin', adminSchema);

// Auth Middleware
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};

// Admin Login
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const admin = await Admin.findOne({ username });
    if (admin && await bcrypt.compare(password, admin.password)) {
      const token = jwt.sign({ username: admin.username, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ token });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (err) {
    res.status(500).json({ message: 'Error during login' });
  }
});

// Create a new campaign
app.post('/api/campaigns', async (req, res) => {
  const { title, description, goalAmount } = req.body;
  try {
    const newCampaign = new Campaign({
      title,
      description,
      goalAmount,
      currentAmount: 0, // Fixed initial amount to 0
    });
    await newCampaign.save();
    res.json(newCampaign);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error creating campaign' });
  }
});

// Get all campaigns
app.get('/api/campaigns', async (req, res) => {
  try {
    const campaigns = await Campaign.find();
    res.json(campaigns);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching campaigns' });
  }
});

// Delete a campaign (Protected)
app.delete('/api/campaigns/:id', authenticateJWT, async (req, res) => {
  try {
    const campaign = await Campaign.findByIdAndDelete(req.params.id);
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error deleting campaign' });
  }
});

// Handle donation
app.post('/api/increment/:id', async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;
  try {
    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    campaign.currentAmount += amount;
    await campaign.save();
    res.json({
      campaignId: campaign._id,
      amount: campaign.currentAmount,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error incrementing currentAmount' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
