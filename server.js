require('dotenv').config();

// Debug environment variables
console.log('[DEBUG] Environment Variables:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  MONGODB_URI: process.env.MONGODB_URI ? '***REDACTED***' : 'MISSING'
});

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const socketIO = require('socket.io');
const http = require('http');

// App Configuration
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Security Check - Remove in production after confirming it works
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ FATAL: MONGODB_URI not defined in environment variables');
  process.exit(1);
}

// Enhanced MongoDB Connection
mongoose.connect(MONGODB_URI, {
  dbName: 'corujao_chat',
  connectTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  w: 'majority'
})
.then(() => console.log('🔥 Connected to MongoDB | Database: corujao_chat'))
.catch(err => {
  console.error('💥 MongoDB Connection Error:', err.message);
  console.error('ℹ️ Verify your MONGODB_URI starts with mongodb:// or mongodb+srv://');
  process.exit(1);
});

// Optimized Models
const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    unique: true, 
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 20,
    match: /^[a-zA-Z0-9_]+$/
  },
  password: { 
    type: String, 
    required: true,
    minlength: 6,
    select: false
  },
  role: { 
    type: String, 
    enum: ['user', 'admin'], 
    default: 'user' 
  },
  lastSeen: { 
    type: Date, 
    default: Date.now 
  }
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
  user: { 
    type: String, 
    required: true 
  },
  text: { 
    type: String, 
    required: true,
    maxlength: 500 
  },
  room: { 
    type: String, 
    default: 'geral',
    index: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true 
  }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// Session Configuration
const sessionStore = MongoStore.create({
  mongoUrl: MONGODB_URI,
  dbName: 'corujao_chat',
  collectionName: 'sessions',
  ttl: 86400, // 1 day in seconds
  autoRemove: 'interval',
  autoRemoveInterval: 60 // Cleanup every 60 minutes
});

// Middlewares
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || require('crypto').randomBytes(64).toString('hex'),
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 86400000 // 1 day
  }
}));

// Enhanced Routes
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    if (username.length < 3 || password.length < 6) {
      return res.status(400).json({ 
        error: 'Username (min 3 chars) and password (min 6 chars) required' 
      });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = new User({
      username,
      password: hashedPassword,
      role: username === process.env.ADMIN_USERNAME ? 'admin' : 'user'
    });
    
    await user.save();
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username }).select('+password');
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    await User.updateOne({ _id: user._id }, { lastSeen: Date.now() });
    
    req.session.user = {
      id: user._id,
      username: user.username,
      role: user.role
    };
    
    res.json({ 
      success: true, 
      user: {
        id: user._id,
        username: user.username,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Robust Socket.IO Implementation
io.on('connection', (socket) => {
  console.log(`⚡ New connection: ${socket.id}`);

  socket.on('login', async (nick, callback) => {
    try {
      const user = await User.findOneAndUpdate(
        { username: nick },
        { lastSeen: Date.now() },
        { new: true }
      );
      
      if (!user) {
        return callback({ ok: false, msg: 'User not found' });
      }

      socket.user = {
        id: user._id,
        nick: user.username,
        admin: user.role === 'admin'
      };
      
      callback({ ok: true, admin: socket.user.admin });
      socket.emit('system', `Welcome, ${nick}!`);
    } catch (err) {
      console.error('Socket login error:', err);
      callback({ ok: false, msg: 'Server error' });
    }
  });

  socket.on('msg', async (text, room = 'geral', callback) => {
    try {
      if (!socket.user?.nick) throw new Error('Not authenticated');
      if (!text || text.length > 500) throw new Error('Invalid message');

      const msg = new Message({
        user: socket.user.nick,
        text,
        room
      });
      
      await msg.save();
      io.to(room).emit('msg', {
        from: socket.user.nick,
        text,
        admin: socket.user.admin,
        timestamp: new Date()
      });
      
      callback({ success: true });
    } catch (err) {
      console.error('Message error:', err);
      callback({ error: err.message });
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Disconnected: ${socket.user?.nick || socket.id}`);
  });
});

// Server Initialization
const PORT = process.env.PORT || 4040;
server.listen(PORT, () => {
  console.log(`🦉 Server running on port ${PORT}`);
  console.log(`🔗 Database: corujao_chat`);
  console.log(`🔐 Sessions: corujao_chat.sessions`);
});

// Error Handling
process.on('unhandledRejection', (err) => {
  console.error('💥 Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  process.exit(1);
});
