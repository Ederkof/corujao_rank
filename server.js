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
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// Configurações de ambiente com valores padrão robustos
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const PORT = process.env.PORT || 4040;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/corujao_chat';
const SESSION_SECRET = process.env.SESSION_SECRET || uuidv4();

// Verificação/Criação da pasta public
const PUBLIC_DIR = path.join(__dirname, 'public');
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  console.log(`✅ Pasta public criada em: ${PUBLIC_DIR}`);
}

// Configuração do Socket.IO com CORS
const io = socketIO(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true
  }
});

// Middlewares otimizados
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use('/public', express.static(PUBLIC_DIR, {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

// Conexão com o MongoDB com tratamento melhorado
mongoose.connect(MONGODB_URI, {
  dbName: 'corujao_chat',
  connectTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  w: 'majority'
})
.then(() => console.log('✅ MongoDB conectado com sucesso'))
.catch(err => {
  console.error('❌ Erro ao conectar ao MongoDB:', err.message);
  process.exit(1);
});

// Schemas
const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  password: { 
    type: String, 
    required: true,
    minlength: 8
  },
  role: { 
    type: String, 
    enum: ['user', 'admin'], 
    default: 'user' 
  },
  lastSeen: { 
    type: Date 
  }
}, { timestamps: true, autoIndex: true });

const messageSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  text: { 
    type: String, 
    required: true,
    maxlength: 1000
  },
  room: { 
    type: String, 
    required: true,
    index: true
  },
  messageId: { 
    type: String, 
    default: uuidv4 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

messageSchema.index({ room: 1, createdAt: -1 });

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// Configuração de sessão com opções para produção
const sessionMiddleware = session({
  secret: SESSION_SECRET,
  name: 'corujao.sid',
  store: MongoStore.create({
    mongoUrl: MONGODB_URI,
    dbName: 'corujao_chat',
    collectionName: 'sessions',
    ttl: 24 * 60 * 60,
    autoRemove: 'native'
  }),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    domain: process.env.NODE_ENV === 'production' ? '.onrender.com' : undefined
  }
});

app.use(sessionMiddleware);

// Middleware para integrar sessão com Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Middlewares de autenticação e rate limiting
const authenticate = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  next();
};

const rateLimit = (req, res, next) => {
  // Implementação básica de rate limiting
  const now = Date.now();
  const window = 15 * 60 * 1000; // 15 minutos
  const maxRequests = 100;
  
  if (!req.session.requestCount) {
    req.session.requestCount = 1;
    req.session.firstRequestTime = now;
    return next();
  }

  if (now - req.session.firstRequestTime > window) {
    req.session.requestCount = 1;
    req.session.firstRequestTime = now;
    return next();
  }

  req.session.requestCount++;
  if (req.session.requestCount > maxRequests) {
    return res.status(429).json({ error: 'Muitas requisições' });
  }

  next();
};

// Rotas
app.get('/', (req, res) => {
  res.json({ status: 'online', timestamp: new Date() });
});

app.get('/chat', authenticate, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get('/messages', authenticate, async (req, res) => {
  try {
    const { room = 'general', limit = 50 } = req.query;
    const messages = await Message.find({ room })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('user', 'username');
    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
});

app.post('/register', rateLimit, async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    req.session.userId = user._id;
    res.status(201).json({ username: user.username, role: user.role });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Nome de usuário já existe' });
    }
    res.status(500).json({ error: 'Erro ao registrar usuário' });
  }
});

app.post('/login', rateLimit, async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    req.session.userId = user._id;
    res.json({ username: user.username, role: user.role });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao fazer logout' });
    }
    res.clearCookie('corujao.sid');
    res.json({ message: 'Logout realizado com sucesso' });
  });
});

app.get('/me', authenticate, (req, res) => {
  res.json({ userId: req.session.userId });
});

// WebSocket handlers
io.on('connection', async (socket) => {
  console.log('Novo cliente conectado:', socket.id);

  if (!socket.request.session.userId) {
    console.log('Conexão não autenticada, desconectando...');
    return socket.disconnect(true);
  }

  try {
    const user = await User.findById(socket.request.session.userId);
    if (!user) {
      return socket.disconnect(true);
    }

    user.lastSeen = new Date();
    await user.save();

    socket.on('joinRoom', (room) => {
      socket.join(room);
      console.log(`${user.username} entrou na sala ${room}`);
    });

    socket.on('chatMessage', async ({ text, room }) => {
      try {
        const message = new Message({
          user: user._id,
          text,
          room
        });
        await message.save();
        
        const populatedMessage = await Message.populate(message, { path: 'user', select: 'username' });
        
        io.to(room).emit('message', populatedMessage);
      } catch (err) {
        console.error('Erro ao salvar mensagem:', err);
      }
    });

    socket.on('disconnect', async () => {
      console.log('Cliente desconectado:', socket.id);
      user.lastSeen = new Date();
      await user.save();
    });

  } catch (err) {
    console.error('Erro na conexão Socket.IO:', err);
    socket.disconnect(true);
  }
});

// Middleware de tratamento de erros melhorado
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ 
      error: 'Arquivo muito grande',
      code: 'FILE_TOO_LARGE'
    });
  }
  
  res.status(500).json({ 
    error: 'Erro interno no servidor',
    code: 'INTERNAL_SERVER_ERROR'
  });
});

// Inicialização do servidor com tratamento de erros
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🔗 Acesse: ${FRONTEND_URL}`);
})
.on('error', (err) => {
  console.error('❌ Erro ao iniciar servidor:', err);
  process.exit(1);
});

// Process handlers para shutdown
function gracefulShutdown() {
  console.log('\n🛑 Desligando servidor...');
  
  server.close(() => {
    console.log('✅ Servidor HTTP fechado');
    mongoose.connection.close(false, () => {
      console.log('✅ Conexão com MongoDB fechada');
      process.exit(0);
    });
  });
  
  setTimeout(() => {
    console.log('❌ Desligamento forçado após timeout');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
