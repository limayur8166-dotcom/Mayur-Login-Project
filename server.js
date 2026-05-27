// ============================================================
// 🚀 FINAL SERVER.JS (AWS + Docker + Load Balancer READY)
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
const path = require('path');

// OAuth
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;

const app = express();
const server = http.createServer(app);

// ================= SOCKET.IO =================
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ============================================================
// ✅ MIDDLEWARE
// ============================================================

app.use(express.json());

app.use(cors({
  origin: "*",
  credentials: true
}));

app.use(express.urlencoded({ extended: true }));

// Serve public folder
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || "mayur-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// ============================================================
// ✅ DATABASE
// ============================================================

mongoose.connect(process.env.MONGO_URI)
.then(() => {
  console.log("✅ MongoDB Connected");
})
.catch((err) => {
  console.log("❌ MongoDB Error:", err);
});

// ============================================================
// ✅ USER MODEL
// ============================================================

const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String
}, {
  timestamps: true
});

const User = mongoose.model("User", userSchema);

// ============================================================
// ✅ JWT
// ============================================================

const SECRET = process.env.JWT_SECRET || "jwt-secret-key";

function signToken(user) {
  return jwt.sign(
    {
      id: user._id,
      username: user.username
    },
    SECRET,
    {
      expiresIn: "7d"
    }
  );
}

// ============================================================
// ✅ PASSPORT
// ============================================================

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// ============================================================
// ✅ GOOGLE AUTH
// ============================================================

if (
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET
) {

  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,

    // IMPORTANT
    callbackURL: "/auth/google/callback"
  },

  async (accessToken, refreshToken, profile, done) => {

    try {

      let user = await User.findOne({
        email: profile.emails[0].value
      });

      if (!user) {

        user = await User.create({
          username: profile.displayName,
          email: profile.emails[0].value,
          password: "oauth-google"
        });

      }

      return done(null, user);

    } catch (err) {

      return done(err, null);

    }

  }));

}

// ============================================================
// ✅ GITHUB AUTH
// ============================================================

if (
  process.env.GITHUB_CLIENT_ID &&
  process.env.GITHUB_CLIENT_SECRET
) {

  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,

    // IMPORTANT
    callbackURL: "/auth/github/callback"
  },

  async (accessToken, refreshToken, profile, done) => {

    try {

      let user = await User.findOne({
        username: profile.username
      });

      if (!user) {

        user = await User.create({
          username: profile.username,
          email: `${profile.username}@github.com`,
          password: "oauth-github"
        });

      }

      return done(null, user);

    } catch (err) {

      return done(err, null);

    }

  }));

}

// ============================================================
// ✅ GOOGLE ROUTES
// ============================================================

app.get('/auth/google',
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })
);

app.get('/auth/google/callback',

  passport.authenticate('google', {
    failureRedirect: '/'
  }),

  (req, res) => {

    const token = signToken(req.user);

    res.redirect(`/main.html?token=${token}`);

  }

);

// ============================================================
// ✅ GITHUB ROUTES
// ============================================================

app.get('/auth/github',
  passport.authenticate('github', {
    scope: ['user:email']
  })
);

app.get('/auth/github/callback',

  passport.authenticate('github', {
    failureRedirect: '/'
  }),

  (req, res) => {

    const token = signToken(req.user);

    res.redirect(`/main.html?token=${token}`);

  }

);

// ============================================================
// ✅ REGISTER
// ============================================================

app.post('/api/register', async (req, res) => {

  try {

    const {
      username,
      email,
      password
    } = req.body;

    // Check existing user
    const existingUser = await User.findOne({
      $or: [
        { username },
        { email }
      ]
    });

    if (existingUser) {

      return res.status(400).json({
        error: "User already exists"
      });

    }

    // Hash password
    const hash = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      username,
      email,
      password: hash
    });

    // Token
    const token = signToken(user);

    res.json({
      success: true,
      token,
      user
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      error: "Registration failed"
    });

  }

});

// ============================================================
// ✅ LOGIN
// ============================================================

app.post('/api/login', async (req, res) => {

  try {

    const {
      username,
      password
    } = req.body;

    const user = await User.findOne({ username });

    if (!user) {

      return res.status(401).json({
        error: "User not found"
      });

    }

    const match = await bcrypt.compare(
      password,
      user.password
    );

    if (!match) {

      return res.status(401).json({
        error: "Wrong password"
      });

    }

    const token = signToken(user);

    res.json({
      success: true,
      token,
      user
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      error: "Login failed"
    });

  }

});

// ============================================================
// ✅ CHAT API
// ============================================================

app.post('/api/chat', (req, res) => {

  try {

    const msg = req.body.message.toLowerCase();

    let reply = "🤖 Samajh nahi aaya";

    if (
      msg.includes("hello") ||
      msg.includes("hi")
    ) {

      reply = "👋 Hello bhai! Kaise ho?";

    }

    else if (msg.includes("docker")) {

      reply = "🐳 Docker containers use karta hai";

    }

    else if (msg.includes("aws")) {

      reply = "☁️ AWS ek cloud platform hai";

    }

    else if (msg.includes("deploy")) {

      reply = "🚀 Docker + ECS + ALB best deployment hai";

    }

    else if (msg.includes("mongodb")) {

      reply = "🍃 MongoDB NoSQL database hai";

    }

    res.json({
      success: true,
      reply
    });

  } catch (err) {

    res.status(500).json({
      error: "Chat failed"
    });

  }

});

// ============================================================
// ✅ SOCKET.IO
// ============================================================

io.on('connection', (socket) => {

  console.log("👤 User Connected");

  socket.on('message', (msg) => {

    console.log("📩 Message:", msg);

    socket.emit(
      'reply',
      `🤖 DevOps Bot: ${msg}`
    );

  });

  socket.on('disconnect', () => {

    console.log("❌ User Disconnected");

  });

});

// ============================================================
// ✅ HEALTH CHECK
// ============================================================

app.get('/health', (req, res) => {

  res.status(200).json({
    success: true,
    message: "Server Running"
  });

});

// ============================================================
// ✅ MAIN ROUTES
// ============================================================

// INDEX.HTML
app.get('/', (req, res) => {

  res.sendFile(
    path.join(__dirname, 'public', 'index.html')
  );

});

// MAIN.HTML
app.get('/main.html', (req, res) => {

  res.sendFile(
    path.join(__dirname, 'public', 'main.html')
  );

});

// ============================================================
// ✅ 404
// ============================================================

app.use((req, res) => {

  res.status(404).json({
    error: "Route not found"
  });

});

// ============================================================
// ✅ START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {

  console.log(`
================================================
🚀 SERVER RUNNING
🌐 PORT: ${PORT}
================================================
  `);

});
