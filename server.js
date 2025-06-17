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

// Configurações de ambiente
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const PORT = process.env.PORT || 4040;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/corujao_chat';
const SESSION_SECRET = process.env.SESSION_SECRET || uuidv4();

// Verificação/Criação da pasta views (ajustado para seu caso)
const VIEWS_DIR = path.join(__dirname, 'views');
if (!fs.existsSync(VIEWS_DIR)) {
  fs.mkdirSync(VIEWS_DIR, { recursive: true });
  console.log(`✅ Pasta views criada em: ${VIEWS_DIR}`);
}

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

// Ajuste crítico: Serve arquivos estáticos da pasta views (onde está seu index.html)
app.use(express.static(VIEWS_DIR, {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

// Conexão com MongoDB (mantido igual)
mongoose.connect(MONGODB_URI, {
  dbName: 'corujao_chat',
  connectTimeoutMS: 30000
})
.then(() => console.log('✅ MongoDB conectado com sucesso'))
.catch(err => console.error('❌ Erro ao conectar ao MongoDB:', err));

// Schemas e Models (mantidos iguais)
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }
}));

const Message = mongoose.model('Message', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  text: { type: String, required: true },
  room: { type: String, required: true }
}));

// Configuração de sessão (mantido igual)
app.use(session({
  secret: SESSION_SECRET,
  store: MongoStore.create({ mongoUrl: MONGODB_URI }),
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Middleware para Socket.IO (mantido igual)
io.use((socket, next) => {
  session(socket.request, {}, next);
});

// Rotas principais ajustadas para /views
app.get('/', (req, res) => {
  res.sendFile(path.join(VIEWS_DIR, 'index.html')); // Caminho corrigido
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(VIEWS_DIR, 'chat.html')); // Caminho corrigido
});

// Demais rotas (mantidas iguais)
app.post('/register', async (req, res) => {
  /* ... código original ... */
});

app.post('/login', async (req, res) => {
  /* ... código original ... */
});

// WebSocket handlers (mantido igual)
io.on('connection', (socket) => {
  /* ... código original ... */
});

// Inicialização do servidor
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🔗 Acesse: ${FRONTEND_URL}`);
});
