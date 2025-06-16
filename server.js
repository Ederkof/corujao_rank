require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const session = require('express-session');
const MongoStore = require('connect-mongo');
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

// Conexão com MongoDB (Versão Robustecida)
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Conectado ao MongoDB Atlas!'))
  .catch(err => {
    console.error('❌ ERRO no MongoDB:', err.message);
    process.exit(1); // Encerra o processo em caso de erro
  });

// Modelos
const User = mongoose.model('User', new mongoose.Schema({
  username: { 
    type: String, 
    unique: true, 
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 20
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
    index: true // Melhora performance em buscas por sala
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true 
  }
}));

// Middlewares
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: 24 * 60 * 60 // 1 dia em segundos
  }),
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 1 dia
  }
}));

// Rotas de Autenticação (com validações melhoradas)
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validação reforçada
    if (!username || !password || username.length < 3 || password.length < 6) {
      return res.status(400).json({ 
        error: 'Usuário (min 3 chars) e senha (min 6 chars) são obrigatórios' 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = new User({
      username,
      password: hashedPassword,
      role: username === process.env.ADMIN_USERNAME ? 'admin' : 'user'
    });
    
    await user.save();
    res.status(201).json({ success: true });
  } catch (error) {
    res.status(400).json({ 
      error: error.code === 11000 ? 'Usuário já existe' : error.message 
    });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Credenciais necessárias' });
    }

    const user = await User.findOne({ username });
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    
    req.session.user = {
      id: user._id,
      username: user.username,
      role: user.role
    };
    
    res.json({ 
      success: true,
      user: req.session.user
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Socket.IO Logic (com tratamento de erros melhorado)
io.on('connection', (socket) => {
  console.log('🦉 Nova conexão:', socket.id);

  socket.on('login', async (nick, callback) => {
    try {
      const user = await User.findOne({ username: nick });
      
      if (!user) {
        return callback({ ok: false, msg: 'Usuário não encontrado' });
      }

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
      if (!socket.user?.nick) {
        throw new Error('Não autenticado');
      }

      if (!text || text.length > 500) {
        throw new Error('Mensagem inválida');
      }

      const message = new Message({
        user: socket.user.nick,
        text,
        room
      });
      
      await message.save();
      
      io.to(room).emit('msg', {
        from: socket.user.nick,
        text,
        admin: socket.user.admin,
        timestamp: new Date()
      });
      
      callback({ success: true });
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
      callback({ error: err.message || 'Erro ao enviar mensagem' });
    }
  });

  socket.on('join', (room) => {
    if (!socket.user?.nick || !room) return;
    
    if (socket.room) {
      socket.leave(socket.room);
      console.log(`${socket.user.nick} saiu da sala ${socket.room}`);
    }
    
    socket.join(room);
    socket.room = room;
    console.log(`${socket.user.nick} entrou na sala ${room}`);
    socket.emit('system', `Você entrou na sala: ${room}`);
  });

  socket.on('disconnect', () => {
    console.log(`❌ ${socket.user?.nick || socket.id} desconectado`);
  });
});

// Inicia o servidor
const PORT = process.env.PORT || 4040;
server.listen(PORT, () => {
  console.log(`🦉 Servidor rodando na porta ${PORT}`);
  console.log(`🔗 MongoDB: ${process.env.MONGODB_URI?.split('@')[1] || 'configurado'}`);
});
