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
app.use(express.static(PUBLIC_DIR, {
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

// Schemas (mantidos iguais)
const userSchema = new mongoose.Schema({
  username: { /* ... */ },
  password: { /* ... */ },
  role: { /* ... */ },
  lastSeen: { /* ... */ }
}, { timestamps: true, autoIndex: true });

const messageSchema = new mongoose.Schema({
  user: { /* ... */ },
  text: { /* ... */ },
  room: { /* ... */ },
  messageId: { /* ... */ },
  createdAt: { /* ... */ }
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

// Middlewares de autenticação e rate limiting (mantidos iguais)
const authenticate = (req, res, next) => { /* ... */ };
const rateLimit = (req, res, next) => { /* ... */ };

// Rotas (mantidas iguais)
app.get('/', (req, res) => { /* ... */ });
app.get('/chat', authenticate, (req, res) => { /* ... */ });
app.get('/messages', authenticate, async (req, res) => { /* ... */ });
app.post('/register', rateLimit, async (req, res) => { /* ... */ });
app.post('/login', rateLimit, async (req, res) => { /* ... */ });
app.post('/logout', (req, res) => { /* ... */ });
app.get('/me', authenticate, (req, res) => { /* ... */ });

// WebSocket handlers (mantidos iguais)
io.on('connection', async (socket) => { /* ... */ });

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
