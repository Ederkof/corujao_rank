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

// Configurações básicas
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const PORT = process.env.PORT || 4040;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/corujao_chat';
const SESSION_SECRET = process.env.SESSION_SECRET || uuidv4();
const NODE_ENV = process.env.NODE_ENV || 'development';

// Conexão com MongoDB
mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 10000,
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB conectado com sucesso'))
.catch(err => {
  console.error('❌ Falha na conexão com MongoDB:', err);
  process.exit(1);
});

// Modelos
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20
  },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  avatar: { type: String, default: '' }
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, trim: true, maxlength: 500 },
  room: { type: String, required: true, enum: ['general', 'support', 'offtopic'], default: 'general' },
  createdAt: { type: Date, default: Date.now, index: true },
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// Middlewares
app.use(cors({
  origin: [FRONTEND_URL, 'https://corujao-rank-production.up.railway.app'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuração de sessão
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

app.use(sessionMiddleware);

// Rotas de autenticação
const authRouter = express.Router();

authRouter.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password || password.length < 8) {
      return res.status(400).json({ 
        error: 'Username e password são obrigatórios (mínimo 8 caracteres)' 
      });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({
        error: 'Username já está em uso'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = new User({ username, password: hashedPassword });
    await user.save();

    req.session.userId = user._id;
    res.status(201).json({ 
      message: 'Usuário registrado com sucesso',
      user: { id: user._id, username: user.username }
    });

  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username }).select('+password');
    
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    req.session.userId = user._id;
    res.json({ 
      message: 'Login bem-sucedido',
      user: { id: user._id, username: user.username }
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

authRouter.get('/check', async (req, res) => {
  if (!req.session.userId) {
    return res.json({ success: false });
  }

  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.json({ success: false });
    }

    res.json({ 
      success: true,
      user: {
        id: user._id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Erro ao verificar autenticação:', error);
    res.status(500).json({ success: false });
  }
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao fazer logout' });
    }
    res.clearCookie('corujao.sid').json({ message: 'Logout efetuado com sucesso' });
  });
});

app.use('/api/auth', authRouter);

// Configuração do Socket.io
const io = socketIO(server, {
  cors: {
    origin: [FRONTEND_URL, 'https://corujao-rank-production.up.railway.app'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Middleware de autenticação para Socket.io
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

io.use((socket, next) => {
  if (socket.request.session?.userId) {
    next();
  } else {
    next(new Error('Não autorizado'));
  }
});

// Lógica do chat em tempo real
io.on('connection', async (socket) => {
  try {
    const user = await User.findById(socket.request.session.userId);
    if (!user) {
      socket.emit('auth_error', { message: 'Usuário não encontrado' });
      return socket.disconnect(true);
    }

    socket.user = {
      id: user._id,
      username: user.username,
      role: user.role
    };

    console.log(`🔌 ${user.username} conectado (${socket.id})`);

    // Enviar histórico de mensagens
    const messages = await Message.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('user', 'username')
      .lean();

    socket.emit('message_history', messages.reverse());

    // Eventos do chat
    socket.on('join_room', (room) => {
      if (['general', 'support', 'offtopic'].includes(room)) {
        socket.join(room);
        socket.emit('system_message', `Você entrou na sala ${room}`);
      }
    });

    socket.on('send_message', async ({ room, text }) => {
      try {
        if (!text || !room) {
          return socket.emit('error', 'Dados inválidos');
        }
        
        const message = new Message({
          user: user._id,
          text: text.trim().substring(0, 500),
          room,
        });
        
        await message.save();
        await message.populate('user', 'username');

        io.to(room).emit('new_message', message);
      } catch (err) {
        console.error('Erro ao enviar mensagem:', err);
        socket.emit('error', 'Erro ao enviar mensagem');
      }
    });

    socket.on('disconnect', () => {
      console.log(`🔌 ${user.username} desconectado (${socket.id})`);
    });

  } catch (err) {
    console.error('Erro na conexão do socket:', err);
    socket.disconnect(true);
  }
});

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🔗 Acessível em: ${FRONTEND_URL}`);
  console.log(`⚡ Modo: ${NODE_ENV}`);
});

// Tratamento de erros
process.on('unhandledRejection', (err) => {
  console.error('❌ Rejeição não tratada:', err);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Exceção não capturada:', err);
  process.exit(1);
});
