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
const path = require('path');

// App Configuration
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Security Check
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

// Modelos
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
  ttl: 86400,
  autoRemove: 'interval',
  autoRemoveInterval: 60
});

// Middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Servir arquivos estáticos

app.use(session({
  secret: process.env.SESSION_SECRET || require('crypto').randomBytes(64).toString('hex'),
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 86400000
  }
}));

// Rotas para páginas HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'chat.html'));
});

// Rotas de API
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await User.findOne({ username }).select('+password');
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.userId = user._id;
    req.session.username = user.username;
    req.session.role = user.role;

    res.json({ 
      message: 'Login successful',
      user: {
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('New user connected');

  socket.on('joinRoom', async (room) => {
    socket.join(room);
    const messages = await Message.find({ room }).sort({ createdAt: -1 }).limit(50);
    socket.emit('previousMessages', messages.reverse());
  });

  socket.on('chatMessage', async (data) => {
    try {
      const { room, text } = data;
      const username = socket.request.session?.username || 'Anonymous';
      
      const message = new Message({
        user: username,
        text,
        room
      });
      
      await message.save();
      io.to(room).emit('message', message);
    } catch (error) {
      console.error('Error saving message:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
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
