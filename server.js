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
const limparArquivosTemporarios = require('./clean.js');

const app = express();
const server = http.createServer(app);

// Configs
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const PORT = process.env.PORT || 4040;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/corujao_chat';
const SESSION_SECRET = process.env.SESSION_SECRET || uuidv4();
const NODE_ENV = process.env.NODE_ENV || 'development';

// Rate limiter simples por IP para sockets
const rateLimiter = {
  ips: new Map(),
  consume(ip) {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 min
    const maxRequests = 5;

    if (!this.ips.has(ip)) {
      this.ips.set(ip, { count: 1, startTime: now });
      return { remainingPoints: maxRequests - 1, msBeforeNext: windowMs };
    }

    const ipData = this.ips.get(ip);
    if (now - ipData.startTime > windowMs) {
      ipData.count = 1;
      ipData.startTime = now;
      return { remainingPoints: maxRequests - 1, msBeforeNext: windowMs };
    }

    if (ipData.count >= maxRequests) {
      return {
        remainingPoints: 0,
        msBeforeNext: windowMs - (now - ipData.startTime),
        isExceeded: true,
      };
    }

    ipData.count++;
    return {
      remainingPoints: maxRequests - ipData.count,
      msBeforeNext: windowMs - (now - ipData.startTime),
    };
  },
};

// MongoDB
mongoose
  .connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000, socketTimeoutMS: 10000 })
  .then(() => console.log('✅ MongoDB conectado com sucesso'))
  .catch((err) => {
    console.error('❌ Falha na conexão com MongoDB:', err);
    process.exit(1);
  });

// Models
const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 20 },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
  },
  { timestamps: true }
);
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, trim: true, maxlength: 500 },
  room: { type: String, required: true, enum: ['general', 'support', 'offtopic'] },
  createdAt: { type: Date, default: Date.now, index: true },
});
const Message = mongoose.model('Message', messageSchema);

// Session middleware
const sessionMiddleware = session({
  secret: SESSION_SECRET,
  name: 'corujao.sid',
  store: MongoStore.create({ mongoUrl: MONGODB_URI }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: NODE_ENV === 'production',
    httpOnly: true,
    sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 14, // 14 dias
  },
});

// Middlewares
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(sessionMiddleware);

// Socket.io
const io = socketIO(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Integrar sessão no socket.io
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Rate limiter no socket
io.use((socket, next) => {
  const ip = socket.handshake.address;
  const rateLimitRes = rateLimiter.consume(ip);

  if (rateLimitRes.isExceeded) {
    socket.emit('rate_limit_exceeded', {
      message: 'Muitas requisições! Espere um pouco.',
      retryAfter: Math.ceil(rateLimitRes.msBeforeNext / 1000),
    });
    return next(new Error('Rate limit excedido'));
  }

  socket.rateLimit = {
    remaining: rateLimitRes.remainingPoints,
    reset: Math.floor(Date.now() / 1000) + rateLimitRes.msBeforeNext / 1000,
  };

  next();
});

// Autenticação no socket
io.use((socket, next) => {
  if (socket.request.session?.userId) {
    next();
  } else {
    socket.emit('auth_error', { message: 'Requer autenticação' });
    next(new Error('Não autorizado'));
  }
});

// Rotas estáticas
app.use(express.static(path.join(__dirname, 'public')));

// Rota chat protegida
app.get('/chat', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Não autorizado' });
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Registro
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password || password.length < 8) {
      return res.status(400).json({ error: 'Credenciais inválidas' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = new User({ username, password: hashedPassword });
    await user.save();

    res.status(201).json({ message: 'Usuário criado com sucesso' });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Usuário já existe' });
    }
    res.status(500).json({ error: 'Erro no registro' });
  }
});

// Login
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username }).select('+password');
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

    req.session.userId = user._id;
    res.json({ message: 'Login bem-sucedido' });
  } catch {
    res.status(500).json({ error: 'Erro no login' });
  }
});

// Logout
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Erro ao fazer logout' });
    res.clearCookie('corujao.sid').json({ message: 'Logout efetuado' });
  });
});

// Websocket handlers
io.on('connection', (socket) => {
  const session = socket.request.session;
  console.log('🔌 Nova conexão:', socket.id, 'Usuário:', session.userId);

  socket.on('joinRoom', (room) => {
    if (['general', 'support', 'offtopic'].includes(room)) {
      socket.join(room);
      socket.emit('systemMessage', `Você entrou na sala ${room}`);
    }
  });

  socket.on('sendMessage', async ({ room, text }) => {
    try {
      if (!text || typeof text !== 'string' || !room) {
        return socket.emit('error', 'Dados inválidos');
      }
      const trimmedText = text.trim().substring(0, 500);
      const message = new Message({
        user: session.userId,
        text: trimmedText,
        room,
      });
      await message.save();

      // Popula o username para o frontend (opcional)
      await message.populate('user', 'username');

      io.to(room).emit('newMessage', {
        _id: message._id,
        user: { _id: session.userId, username: message.user.username },
        text: message.text,
        room: message.room,
        createdAt: message.createdAt,
      });
    } catch (err) {
      socket.emit('error', 'Erro ao enviar mensagem');
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 Conexão encerrada:', socket.id);
  });
});

// Limpeza de arquivos temporários
limparArquivosTemporarios();

process.on('exit', limparArquivosTemporarios);
process.on('SIGINT', () => {
  limparArquivosTemporarios();
  process.exit();
});

// Inicia servidor
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🔗 Acessível em: ${FRONTEND_URL}`);
  console.log(`⚡ Modo: ${NODE_ENV}`);
});

// Erros globais
process.on('unhandledRejection', (err) => {
  console.error('❌ Rejeição não tratada:', err);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Exceção não capturada:', err);
  process.exit(1);
});
