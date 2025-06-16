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

// Conexão com MongoDB (Versão Atualizada)
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Conectado ao MongoDB Atlas!'))
  .catch(err => {
    console.error('❌ ERRO no MongoDB:', err.message);
    process.exit(1);
  });

// Modelos
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  lastSeen: { type: Date, default: Date.now }
}));

const Message = mongoose.model('Message', new mongoose.Schema({
  user: { type: String, required: true },
  text: { type: String, required: true },
  room: { type: String, default: 'geral' },
  createdAt: { type: Date, default: Date.now }
}));

// Middlewares
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'corujao-secret',
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Rotas de Autenticação
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
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
    res.status(400).json({ error: error.message });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
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
    res.status(500).json({ error: error.message });
  }
});

// Socket.IO Logic
io.on('connection', (socket) => {
  console.log('🦉 Novo usuário conectado');
  
  socket.on('login', async (nick, callback) => {
    try {
      const user = await User.findOne({ username: nick });
      
      if (!user) {
        return callback({ ok: false, msg: 'Usuário não encontrado' });
      }

      socket.user = {
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
    if (!socket.user?.nick) {
      return callback({ error: 'Não autenticado' });
    }
    
    try {
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
      console.error('Erro ao salvar mensagem:', err);
      callback({ error: 'Erro ao enviar mensagem' });
    }
  });

  socket.on('join', (room) => {
    if (!socket.user?.nick) return;
    
    if (socket.room) {
      socket.leave(socket.room);
    }
    
    socket.join(room);
    socket.room = room;
    socket.emit('system', `Você entrou na sala: ${room}`);
  });

  socket.on('disconnect', () => {
    console.log(`Usuário ${socket.user?.nick || 'desconhecido'} desconectado`);
  });
});

// Inicia o servidor
const PORT = process.env.PORT || 4040;
server.listen(PORT, () => {
  console.log(`🦉 Servidor rodando na porta ${PORT}`);
});
