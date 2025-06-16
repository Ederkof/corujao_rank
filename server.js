require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const session = require('express-session');
const MongoStore = require('connect-mongo'); // Sintaxe atualizada
const socketIO = require('socket.io');
const http = require('http');

// Configuração do App
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Conexão MongoDB Blindada a Erros
mongoose.connect(process.env.MONGODB_URI, {
  dbName: 'corujao_chat',
  connectTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  w: 'majority'
})
.then(() => console.log('🔥 Conectado ao MongoDB | Banco: corujao_chat'))
.catch(err => {
  console.error('💥 ERRO MongoDB:', err.message);
  process.exit(1);
});

// Modelos Otimizados
const User = mongoose.model('User', new mongoose.Schema({
  username: { 
    type: String, 
    unique: true, 
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 20,
    match: /^[a-zA-Z0-9_]+$/ // Apenas letras, números e _
  },
  password: { 
    type: String, 
    required: true,
    minlength: 6
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
}, { timestamps: true }));

const Message = mongoose.model('Message', new mongoose.Schema({
  user: { 
    type: String, 
    required: true 
  },
  text: { 
    type: String, 
    required: true,
    maxlength: 500 
  },
  room: { 
    type: String, 
    default: 'geral',
    index: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true 
  }
}));

// Configuração de Sessão Atualizada
const sessionStore = MongoStore.create({
  mongoUrl: process.env.MONGODB_URI,
  dbName: 'corujao_chat',
  collectionName: 'sessions',
  ttl: 86400, // 1 dia em segundos
  autoRemove: 'interval',
  autoRemoveInterval: 60 // Limpeza a cada 60 minutos
});

// Middlewares
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'seguro_' + Math.random().toString(36).substring(2, 15),
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 86400000 // 1 dia
  }
}));

// Rotas
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password || username.length < 3 || password.length < 6) {
      return res.status(400).json({ error: 'Usuário (3+ chars) e senha (6+ chars) necessários' });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ error: 'Usuário já existe' });
    }

    const user = new User({
      username,
      password: await bcrypt.hash(password, 10),
      role: username === process.env.ADMIN_USERNAME ? 'admin' : 'user'
    });
    
    await user.save();
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Erro no registro:', err);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    
    // Atualiza lastSeen
    await User.updateOne({ _id: user._id }, { lastSeen: Date.now() });
    
    req.session.user = {
      id: user._id,
      username: user.username,
      role: user.role
    };
    
    res.json({ success: true, user: req.session.user });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Socket.IO
io.on('connection', (socket) => {
  console.log(`⚡ Nova conexão: ${socket.id}`);

  socket.on('login', async (nick, callback) => {
    try {
      const user = await User.findOneAndUpdate(
        { username: nick },
        { lastSeen: Date.now() },
        { new: true }
      );
      
      if (!user) return callback({ ok: false, msg: 'Usuário não encontrado' });

      socket.user = {
        id: user._id,
        nick: user.username,
        admin: user.role === 'admin'
      };
      
      callback({ ok: true, admin: socket.user.admin });
      socket.emit('system', `Bem-vindo, ${nick}!`);
    } catch (err) {
      console.error('Erro no login via socket:', err);
      callback({ ok: false, msg: 'Erro no servidor' });
    }
  });

  socket.on('msg', async (text, room = 'geral', callback) => {
    try {
      if (!socket.user?.nick) throw new Error('Não autenticado');
      if (!text || text.length > 500) throw new Error('Mensagem inválida');

      const msg = new Message({
        user: socket.user.nick,
        text,
        room
      });
      
      await msg.save();
      io.to(room).emit('msg', {
        from: socket.user.nick,
        text,
        admin: socket.user.admin,
        timestamp: new Date()
      });
      
      callback({ success: true });
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
      callback({ error: err.message });
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ ${socket.user?.nick || socket.id} desconectado`);
  });
});

// Inicialização
const PORT = process.env.PORT || 4040;
server.listen(PORT, () => {
  console.log(`🦉 Servidor rodando na porta ${PORT}`);
  console.log(`🔗 Banco de dados: corujao_chat`);
  console.log(`🔐 Sessões: corujao_chat.sessions`);
});

// Tratamento de erros
process.on('unhandledRejection', (err) => {
  console.error('💥 Erro não tratado:', err);
});
