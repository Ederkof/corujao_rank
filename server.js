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

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

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

// Middlewares
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Conexão com o MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/corujao_chat';

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
    unique: true,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 20,
    match: /^[a-zA-Z0-9_]+$/,
    index: true
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
}, {
  timestamps: true,
  autoIndex: true
});

const messageSchema = new mongoose.Schema({
  user: {
    type: String,
    required: true
  },
  text: {
    type: String,
    required: true,
    maxlength: 500,
    trim: true
  },
  room: {
    type: String,
    default: 'geral',
    index: true
  },
  messageId: {
    type: String,
    default: uuidv4,
    unique: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Índices para melhor performance
messageSchema.index({ room: 1, createdAt: -1 });

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// Configuração de sessão
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || uuidv4(),
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
    maxAge: 24 * 60 * 60 * 1000
  }
});

app.use(sessionMiddleware);

// Middleware para integrar sessão com Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Middleware de autenticação
const authenticate = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  next();
};

// Rate limiting básico
const rateLimit = (req, res, next) => {
  const now = Date.now();
  const windowMs = 60000; // 1 minuto
  const maxRequests = 30; // Máximo de 30 requisições por minuto
  
  if (!req.session.requests) {
    req.session.requests = [];
    req.session.firstRequestTime = now;
  }
  
  // Remove requisições antigas
  req.session.requests = req.session.requests.filter(time => now - time < windowMs);
  
  if (req.session.requests.length >= maxRequests) {
    const retryAfter = Math.ceil((req.session.requests[0] + windowMs - now) / 1000);
    return res.status(429).json({
      error: 'Muitas requisições',
      retryAfter: `${retryAfter} segundos`
    });
  }
  
  req.session.requests.push(now);
  next();
};

// Rotas
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/chat', authenticate, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'chat.html'));
});

app.get('/messages', authenticate, async (req, res) => {
  try {
    const messages = await Message.find({ room: req.query.room || 'geral' })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar mensagens' });
  }
});

app.post('/register', rateLimit, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        error: 'Username e senha são obrigatórios',
        code: 'MISSING_FIELDS'
      });
    }

    // Verificação case-insensitive robusta
    const existingUser = await User.findOne({ 
      username: { $regex: new RegExp(`^${username}$`, 'i') } 
    });

    if (existingUser) {
      return res.status(409).json({ 
        error: 'Nome de usuário já está em uso',
        code: 'USERNAME_EXISTS'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = await User.create({
      username,
      password: hashedPassword
    });

    // Configurar sessão automaticamente após registro
    req.session.userId = newUser._id;
    req.session.username = newUser.username;
    req.session.role = newUser.role;

    res.status(201).json({
      success: true,
      user: {
        id: newUser._id,
        username: newUser.username,
        role: newUser.role
      }
    });

  } catch (error) {
    console.error('Erro no registro:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({ 
        error: 'Nome de usuário já está em uso',
        code: 'DUPLICATE_USERNAME'
      });
    }
    
    res.status(500).json({ 
      error: 'Erro ao criar conta',
      code: 'REGISTRATION_ERROR'
    });
  }
});

app.post('/login', rateLimit, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        error: 'Username e senha são obrigatórios',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // Busca case-insensitive
    const user = await User.findOne({ 
      username: { $regex: new RegExp(`^${username}$`, 'i') } 
    }).select('+password');

    if (!user) {
      console.log(`Usuário não encontrado: ${username}`);
      return res.status(401).json({ 
        error: 'Credenciais inválidas',
        code: 'USER_NOT_FOUND'
      });
    }

    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      console.log(`Senha inválida para usuário: ${username}`);
      return res.status(401).json({ 
        error: 'Credenciais inválidas',
        code: 'INVALID_PASSWORD'
      });
    }

    // Atualizar lastSeen e configurar sessão
    user.lastSeen = new Date();
    await user.save();

    req.session.userId = user._id;
    req.session.username = user.username;
    req.session.role = user.role;

    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        lastSeen: user.lastSeen
      }
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ 
      error: 'Erro durante o login',
      code: 'LOGIN_ERROR'
    });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Erro ao fazer logout:', err);
      return res.status(500).json({ 
        error: 'Erro ao fazer logout',
        code: 'LOGOUT_ERROR'
      });
    }
    
    res.clearCookie('corujao.sid');
    res.json({ 
      success: true,
      message: 'Logout realizado com sucesso' 
    });
  });
});

app.get('/me', authenticate, (req, res) => {
  res.json({
    authenticated: true,
    user: {
      id: req.session.userId,
      username: req.session.username,
      role: req.session.role
    }
  });
});

// WebSocket handlers
io.on('connection', async (socket) => {
  const session = socket.request.session;
  
  if (!session?.userId) {
    console.log('Conexão WebSocket recusada: usuário não autenticado');
    return socket.disconnect(true);
  }

  const username = session.username;
  console.log(`🟢 ${username} conectado (ID: ${socket.id})`);

  // Atualizar status para online
  try {
    await User.updateOne(
      { _id: session.userId },
      { $set: { lastSeen: 'online' } }
    );
  } catch (err) {
    console.error(`Erro ao atualizar lastSeen para ${username}:`, err);
  }

  // Evento para entrar em uma sala
  socket.on('joinRoom', async (room) => {
    try {
      socket.join(room);
      console.log(`${username} entrou na sala ${room}`);
      
      const messages = await Message.find({ room })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      
      socket.emit('previousMessages', messages.reverse());
    } catch (err) {
      console.error(`Erro ao carregar mensagens para ${username}:`, err);
    }
  });

  // Evento para obter lista de usuários
  socket.on('get:users', async () => {
    try {
      const users = await User.find({}, 'username role lastSeen');
      socket.emit('users:list', users);
    } catch (err) {
      console.error('Erro ao buscar usuários:', err);
    }
  });

  // Evento para enviar mensagem
  socket.on('chat:message', async (data) => {
    try {
      const { text, room } = data;
      
      if (!text || !text.trim() || !room) {
        return;
      }

      const message = new Message({
        user: username,
        text: text.trim(),
        room,
        messageId: uuidv4()
      });

      await message.save();
      
      io.to(room).emit('chat:message', {
        user: username,
        text: text.trim(),
        room,
        messageId: message.messageId,
        createdAt: message.createdAt
      });
    } catch (err) {
      console.error(`Erro ao salvar mensagem de ${username}:`, err);
    }
  });

  // Evento para desconexão
  socket.on('disconnect', async () => {
    console.log(`🔴 ${username} desconectado (ID: ${socket.id})`);
    
    try {
      await User.updateOne(
        { _id: session.userId },
        { $set: { lastSeen: new Date() } }
      );
    } catch (err) {
      console.error(`Erro ao atualizar lastSeen para ${username}:`, err);
    }
  });
});

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ 
    error: 'Erro interno no servidor',
    code: 'INTERNAL_SERVER_ERROR'
  });
});

// Inicialização do servidor
const PORT = process.env.PORT || 4040;
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🔗 Acesse: ${FRONTEND_URL}`);
});

// Process handlers
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

function gracefulShutdown() {
  console.log('\n🛑 Desligando servidor...');
  
  server.close(() => {
    console.log('✅ Servidor HTTP fechado');
    mongoose.connection.close(false, () => {
      console.log('✅ Conexão com MongoDB fechada');
      process.exit(0);
    });
  });
}
