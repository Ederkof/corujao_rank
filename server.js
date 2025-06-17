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
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

// Configurações de ambiente
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const PORT = process.env.PORT || 4040;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/corujao_chat';
const SESSION_SECRET = process.env.SESSION_SECRET || uuidv4();

// Configuração do Socket.IO
const io = socketIO(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middlewares
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Serve arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

// Conexão com MongoDB
mongoose.connect(MONGODB_URI, {
  dbName: 'corujao_chat',
  connectTimeoutMS: 30000
})
.then(() => console.log('✅ MongoDB conectado com sucesso'))
.catch(err => {
  console.error('❌ Erro ao conectar ao MongoDB:', err);
  process.exit(1);
});

// Schemas e Models
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }
}));

const Message = mongoose.model('Message', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  text: { type: String, required: true },
  room: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}));

// Configuração de sessão
const sessionMiddleware = session({
  secret: SESSION_SECRET,
  store: MongoStore.create({ mongoUrl: MONGODB_URI }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax'
  }
});

app.use(sessionMiddleware);

// Integra sessão no Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Rotas principais
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/chat', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).send('Não autorizado');
  }
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Rotas de autenticação
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || password.length < 4) {
    return res.status(400).send('Usuário e senha válidos são obrigatórios (mínimo 4 caracteres)');
  }

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).send('Nome de usuário já existe');

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.status(201).send('Usuário criado com sucesso');
  } catch (error) {
    console.error('Erro ao registrar:', error);
    res.status(500).send('Erro interno ao registrar');
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).send('Usuário e senha são obrigatórios');
  }

  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(400).send('Usuário não encontrado');

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).send('Senha incorreta');

    req.session.userId = user._id;
    res.send('Login bem-sucedido');
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).send('Erro interno no login');
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).send('Erro ao sair');
    res.clearCookie('connect.sid');
    res.send('Logout efetuado');
  });
});

// WebSocket handlers
io.on('connection', (socket) => {
  const session = socket.request.session;
  const userId = session?.userId;

  if (!userId) {
    console.warn('Usuário sem sessão tentou conectar via socket');
    return;
  }

  console.log('🔌 Novo socket conectado:', socket.id);

  socket.on('joinRoom', (room) => {
    socket.join(room);
    socket.emit('message', { user: 'Sistema', text: `Você entrou na sala ${room}` });
  });

  socket.on('sendMessage', async ({ room, text }) => {
    if (!text || !room) return;

    const message = new Message({ user: userId, text, room });
    await message.save();

    io.to(room).emit('message', {
      user: userId,
      text,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('disconnect', () => {
    console.log('🔌 Usuário desconectado:', socket.id);
  });
});

// Inicialização do servidor
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🔗 Acesse: ${FRONTEND_URL}`);
});
