krequire('dotenv').config();

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
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutos
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
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
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
    ttl: 24 * 60 * 60, // 1 dia em segundos
    autoRemove: 'native'
  }),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 1 dia
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

// Rotas
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/chat', authenticate, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'chat.html'));
});

app.post('/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    // Validação básica
    if (!username || !password) {
      return res.status(400).json({ error: 'Username e senha são obrigatórios' });
    }

    // Verificação case-insensitive
    const userExists = await User.findOne({ username })
      .collation({ locale: 'en', strength: 2 })
      .lean();

    if (userExists) {
      return res.status(409).json({ error: 'Nome de usuário já está em uso' });
    }

    // Verificação de e-mail se fornecido
    if (email) {
      const emailExists = await User.findOne({ email }).lean();
      if (emailExists) {
        return res.status(409).json({ error: 'E-mail já está em uso' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = await User.create({
      username,
      password: hashedPassword,
      email: email || undefined
    });

    // Não retornar a senha
    const userResponse = {
      id: newUser._id,
      username: newUser.username,
      role: newUser.role,
      createdAt: newUser.createdAt
    };

    res.status(201).json({
      message: 'Usuário registrado com sucesso',
      user: userResponse
    });

  } catch (error) {
    console.error('Erro no registro:', error);
    
    // Tratamento de erros do MongoDB
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({ 
        error: `${field === 'username' ? 'Nome de usuário' : 'E-mail'} já está em uso` 
      });
    }
    
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username e senha são obrigatórios' });
    }

    const user = await User.findOne({ username })
      .collation({ locale: 'en', strength: 2 })
      .select('+password')
      .lean();

    if (!user) {
      console.log(`Tentativa de login falhou: usuário "${username}" não encontrado`);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      console.log(`Tentativa de login falhou: senha incorreta para o usuário "${username}"`);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Atualizar lastSeen
    await User.updateOne({ _id: user._id }, { $set: { lastSeen: new Date() } });

    // Configurar sessão
    req.session.userId = user._id;
    req.session.username = user.username;
    req.session.role = user.role;
    
    // Não retornar a senha
    delete user.password;

    res.json({
      message: 'Login realizado com sucesso',
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        lastSeen: user.lastSeen
      }
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Erro ao fazer logout:', err);
      return res.status(500).json({ error: 'Erro ao fazer logout' });
    }
    
    res.clearCookie('corujao.sid');
    res.json({ message: 'Logout realizado com sucesso' });
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

  // Atualizar lastSeen ao conectar
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

  // Evento para enviar mensagem
  socket.on('chatMessage', async (data) => {
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
      
      io.to(room).emit('message', {
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
  res.status(500).json({ error: 'Erro interno no servidor' });
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
