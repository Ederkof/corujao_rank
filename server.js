require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const socketIO = require('socket.io');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middlewares
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not defined');
  process.exit(1);
}
mongoose.connect(MONGODB_URI, {
  dbName: 'corujao_chat',
  connectTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  w: 'majority'
})
.then(() => console.log('✅ MongoDB conectado'))
.catch(err => {
  console.error('❌ Erro ao conectar MongoDB:', err.message);
  process.exit(1);
});

// Schemas
const userSchema = new mongoose.Schema({
  username: {
    type: String, unique: true, required: true,
    trim: true, minlength: 3, maxlength: 20,
    match: /^[a-zA-Z0-9_]+$/
  },
  password: { type: String, required: true, minlength: 6, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  lastSeen: { type: Date, default: Date.now }
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
  user: { type: String, required: true },
  text: { type: String, required: true, maxlength: 500 },
  room: { type: String, default: 'geral', index: true },
  createdAt: { type: Date, default: Date.now, index: true }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// Sessões
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || require('crypto').randomBytes(64).toString('hex'),
  store: MongoStore.create({
    mongoUrl: MONGODB_URI,
    dbName: 'corujao_chat',
    collectionName: 'sessions',
    ttl: 86400
  }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 86400000
  }
});
app.use(sessionMiddleware);
io.use((socket, next) => sessionMiddleware(socket.request, {}, next));

// Rotas
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'chat.html'));
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username e senha são obrigatórios' });

  const userExists = await User.findOne({ username });
  if (userExists) return res.status(400).json({ error: 'Nome de usuário já existe' });

  const hashed = await bcrypt.hash(password, 10);
  await new User({ username, password: hashed }).save();
  res.status(201).json({ message: 'Usuário registrado' });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username e senha são obrigatórios' });

  const user = await User.findOne({ username }).select('+password');
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error: 'Credenciais inválidas' });

  req.session.userId = user._id;
  req.session.username = user.username;
  req.session.role = user.role;
  res.json({ message: 'Login OK', user: { username: user.username, role: user.role } });
});

app.get('/me', (req, res) => {
  if (!req.session.username) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, user: { username: req.session.username, role: req.session.role } });
});

// WebSocket
io.on('connection', socket => {
  const username = socket.request.session?.username || 'Anônimo';
  console.log(`🟢 ${username} conectado`);

  socket.on('joinRoom', async room => {
    socket.join(room);
    const messages = await Message.find({ room }).sort({ createdAt: -1 }).limit(50);
    socket.emit('previousMessages', messages.reverse());
  });

  socket.on('chatMessage', async data => {
    const text = data.text;
    const room = data.room;
    const msg = new Message({ user: username, text, room });
    await msg.save();
    io.to(room).emit('message', msg);
  });

  socket.on('disconnect', () => {
    console.log(`🔴 ${username} desconectado`);
  });
});

// Inicialização
const PORT = process.env.PORT || 4040;
server.listen(PORT, () => {
  console.log(`🚀 Servidor no ar na porta ${PORT}`);
});
