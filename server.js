require('dotenv').config();

// Dependências principais
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
const { rateLimiter } = require('socket.io-ratelimiter'); // Correção aplicada

// Inicialização do app
const app = express();
const server = http.createServer(app);

// ======================
// CONFIGURAÇÕES CRÍTICAS (ATUALIZADAS)
// ======================
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const PORT = process.env.PORT || 4040;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/corujao_chat';
const SESSION_SECRET = process.env.SESSION_SECRET || uuidv4();
const NODE_ENV = process.env.NODE_ENV || 'development';

// Verificação de variáveis de ambiente essenciais
if (!process.env.MONGODB_URI) {
  console.warn('⚠️  AVISO: Usando MongoDB local. Configure MONGODB_URI no .env para produção');
}

// ======================
// CONFIGURAÇÃO SEGURA DE ARQUIVOS ESTÁTICOS
// ======================
const staticOptions = {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (filePath.includes('.js')) {
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Content-Type': 'application/javascript; charset=UTF-8',
        'X-Content-Type-Options': 'nosniff'
      });
    }
  }
};

app.use(express.static(path.join(__dirname, 'public'), staticOptions));

// Rota especial para garantir integridade do terminal.js
app.get('/terminal.js', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'terminal.js');
  fs.stat(filePath, (err, stats) => {
    if (err) {
      console.error('❌ Arquivo terminal.js não encontrado:', err);
      return res.status(404).send('Arquivo não encontrado');
    }

    res.sendFile(filePath, {
      headers: {
        'Content-Length': stats.size,
        'Last-Modified': new Date(stats.mtime).toUTCString()
      }
    }, (err) => {
      if (err) console.error('❌ Erro ao servir terminal.js:', err);
    });
  });
});

// ======================
// CONFIGURAÇÃO DO SOCKET.IO (ATUALIZADA)
// ======================
const io = socketIO(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000 // 2 minutos
  },
  auth: {
    timeout: 5000 // 5 segundos para autenticar
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// ======================
// MIDDLEWARES ESSENCIAIS
// ======================
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
  exposedHeaders: ['Content-Length', 'X-File-Size']
}));

app.use(express.json({
  limit: '10kb',
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

app.use(express.urlencoded({
  extended: true,
  limit: '10kb',
  parameterLimit: 10
}));

// ======================
// CONEXÃO COM BANCO DE DADOS (OTIMIZADA)
// ======================
mongoose.connect(MONGODB_URI, {
  dbName: 'corujao_chat',
  connectTimeoutMS: 30000,
  socketTimeoutMS: 30000,
  serverSelectionTimeoutMS: 5000,
  retryWrites: true,
  retryReads: true,
  autoIndex: NODE_ENV === 'development' // Indexação apenas em desenvolvimento
})
.then(() => {
  console.log('✅ MongoDB conectado com sucesso');
  // Cria índices para produção
  if (NODE_ENV === 'production') createIndexes();
})
.catch(err => {
  console.error('❌ Falha crítica na conexão com MongoDB:', err);
  process.exit(1);
});

async function createIndexes() {
  await Message.createIndexes([
    { 'room': 1, 'createdAt': -1 },
    { 'user': 1 }
  ]);
  console.log('🔍 Índices do MongoDB criados');
}

// ======================
// MODELOS DO BANCO DE DADOS
// ======================
const User = mongoose.model('User', new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20,
    match: /^[a-zA-Z0-9_]+$/
  },
  password: { 
    type: String, 
    required: true,
    select: false
  },
  role: { 
    type: String, 
    enum: ['user', 'admin'], 
    default: 'user' 
  }
}, { timestamps: true }));

const Message = mongoose.model('Message', new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  text: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 500 
  },
  room: { 
    type: String, 
    required: true,
    enum: ['general', 'support', 'offtopic'] 
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true 
  }
}));

// ======================
// CONFIGURAÇÃO DE SESSÃO (ATUALIZADA)
// ======================
const sessionMiddleware = session({
  secret: SESSION_SECRET,
  name: 'corujao.sid',
  store: MongoStore.create({
    mongoUrl: MONGODB_URI,
    ttl: 14 * 24 * 60 * 60, // 14 dias
    autoRemove: 'interval',
    autoRemoveInterval: 60 // Minutos
  }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: NODE_ENV === 'production',
    httpOnly: true,
    sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 14, // 14 dias
    domain: NODE_ENV === 'production' ? '.seusite.com' : undefined
  }
});

app.use(sessionMiddleware);

// ======================
// MIDDLEWARES DO SOCKET.IO (ATUALIZADOS)
// ======================
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Configuração do rate limiter corrigida
io.use(rateLimiter({
  windowMs: 60 * 1000, // 1 minuto
  max: 5, // Máximo de 5 eventos por conexão
  onExceeded: (socket, error) => {
    const ip = socket.handshake.address;
    console.warn(`⏱️ Rate limit excedido para ${ip}`);
    socket.emit('rate_limit_exceeded', { 
      message: 'Muitas requisições! Espere um pouco.' 
    });
  }
}));

io.use((socket, next) => {
  if (socket.request.session?.userId) {
    next();
  } else {
    const ip = socket.handshake.address;
    console.warn(`⛔ Conexão bloqueada de ${ip} (ID: ${socket.id})`);
    socket.emit('auth_error', { message: 'Requer autenticação' });
    next(new Error("Não autorizado"));
  }
});

// ======================
// ROTAS PRINCIPAIS
// ======================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'), {
    headers: {
      'Cache-Control': 'no-store'
    }
  });
});

app.get('/chat', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  res.sendFile(path.join(__dirname, 'public', 'chat.html'), {
    headers: {
      'Cache-Control': 'no-store'
    }
  });
});

// ======================
// ROTAS DE AUTENTICAÇÃO
// ======================
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password || password.length < 8) {
      return res.status(400).json({ 
        error: 'Usuário e senha válidos são obrigatórios (mínimo 8 caracteres)' 
      });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ error: 'Nome de usuário já existe' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = new User({ 
      username, 
      password: hashedPassword 
    });
    
    await user.save();
    res.status(201).json({ message: 'Usuário criado com sucesso' });
  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Credenciais inválidas' });
    }

    const user = await User.findOne({ username }).select('+password');
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    req.session.userId = user._id;
    res.json({ message: 'Login bem-sucedido' });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Erro ao destruir sessão:', err);
      return res.status(500).json({ error: 'Erro ao fazer logout' });
    }
    
    res.clearCookie('corujao.sid');
    res.json({ message: 'Logout efetuado' });
  });
});

// ======================
// HANDLERS DO WEBSOCKET (ATUALIZADOS)
// ======================
io.on('connection', (socket) => {
  const session = socket.request.session;
  const ip = socket.handshake.address;
  
  console.log('🔌 Nova conexão:', {
    id: socket.id,
    user: session.userId,
    ip: ip
  });

  // Evento para entrar em salas
  socket.on('joinRoom', (room) => {
    if (!['general', 'support', 'offtopic'].includes(room)) {
      return socket.emit('error', { message: 'Sala inválida' });
    }

    socket.join(room);
    socket.emit('systemMessage', { text: `Você entrou na sala ${room}` });
    console.log(`🚪 Usuário ${session.userId} entrou na sala ${room}`);
  });

  // Evento para enviar mensagens
  socket.on('sendMessage', async ({ room, text }) => {
    try {
      if (!text || !room || text.length > 500) {
        return socket.emit('error', { message: 'Mensagem inválida' });
      }

      const message = new Message({
        user: session.userId,
        text: text.trim(),
        room
      });

      await message.save();
      
      io.to(room).emit('newMessage', {
        user: session.userId,
        text: message.text,
        timestamp: message.createdAt
      });

      console.log(`✉️ Mensagem enviada por ${session.userId} em ${room}`);
    } catch (err) {
      console.error('Erro ao salvar mensagem:', err);
      socket.emit('error', { message: 'Erro ao enviar mensagem' });
    }
  });

  // Evento de desconexão
  socket.on('disconnect', (reason) => {
    console.log('🔌 Conexão encerrada:', {
      id: socket.id,
      user: session.userId,
      reason: reason
    });
  });
});

// ======================
// MANUSEIO DE ERROS (ATUALIZADO)
// ======================
app.use((err, req, res, next) => {
  console.error('❌ Erro não tratado:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  res.status(500).json({ error: 'Ocorreu um erro interno' });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Rejeição não tratada em:', promise, 'Motivo:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Exceção não capturada:', {
    error: err.message,
    stack: err.stack
  });
  process.exit(1);
});

// ======================
// INICIALIZAÇÃO DO SERVIDOR
// ======================
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🔗 Acessível em: ${FRONTEND_URL}`);
  console.log(`📁 Servindo arquivos estáticos de: ${path.join(__dirname, 'public')}`);
  console.log(`⚡ Modo: ${NODE_ENV}`);
});
