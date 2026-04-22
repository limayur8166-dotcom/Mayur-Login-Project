// ============================================================
// 🚀 FINAL CLEAN SERVER (JWT + OAuth + Chat + Socket.io)
// ============================================================

require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const passport = require('passport');
const session = require('express-session');
const http = require('http');
const socketIO = require('socket.io');

// OAuth
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

app.use(session({
  secret: "secret123",
  resave: false,
  saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

// ================= DATABASE =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ DB Error:", err));

// ================= MODEL =================
const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// ================= JWT =================
const SECRET = process.env.JWT_SECRET;

const signToken = (user) =>
  jwt.sign({ id: user._id }, SECRET, { expiresIn: '7d' });

// ================= PASSPORT =================
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  const user = await User.findById(id);
  done(null, user);
});

// ================= GOOGLE =================
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "/auth/google/callback"
},
async (accessToken, refreshToken, profile, done) => {

  let user = await User.findOne({ email: profile.emails[0].value });

  if (!user) {
    user = await User.create({
      username: profile.displayName,
      email: profile.emails[0].value,
      password: "oauth"
    });
  }

  return done(null, user);
}));

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile','email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    const token = signToken(req.user);
    res.redirect(`/main.html?token=${token}`);
  }
);

// ================= GITHUB =================
passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL: "/auth/github/callback"
},
async (accessToken, refreshToken, profile, done) => {

  let user = await User.findOne({ username: profile.username });

  if (!user) {
    user = await User.create({
      username: profile.username,
      email: profile.username + "@github.com",
      password: "oauth"
    });
  }

  return done(null, user);
}));

app.get('/auth/github',
  passport.authenticate('github', { scope: ['user:email'] })
);

app.get('/auth/github/callback',
  passport.authenticate('github', { failureRedirect: '/' }),
  (req, res) => {
    const token = signToken(req.user);
    res.redirect(`/main.html?token=${token}`);
  }
);

// ================= AUTH ROUTES =================
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      email,
      password: hash
    });

    const token = signToken(user);

    res.json({ token, user });

  } catch (err) {
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });

    if (!user) return res.status(401).json({ error: "User not found" });

    const match = await bcrypt.compare(password, user.password);

    if (!match) return res.status(401).json({ error: "Wrong password" });

    const token = signToken(user);

    res.json({ token, user });

  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

// ================= CHAT API =================
app.post('/api/chat', (req, res) => {
  const msg = req.body.message.toLowerCase();

  let reply = "🤖 Samajh nahi aaya";

  if (msg.includes("hello") || msg.includes("hi")) {
    reply = "👋 Hello bhai! Kaise ho?";
  } 
  else if (msg.includes("deploy")) {
    reply = "🚀 AWS EC2 + Docker + CI/CD best hai!";
  }
  else if (msg.includes("docker")) {
    reply = "🐳 Docker containers use karta hai";
  }
  else if (msg.includes("aws")) {
    reply = "☁️ AWS cloud platform hai!";
  }

  res.json({ reply });
});

// ================= SOCKET =================
io.on('connection', (socket) => {
  console.log("👤 User connected");

  socket.on('message', (msg) => {
    socket.emit('reply', "🤖 DevOps Bot: " + msg);
  });
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});