require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const session = require('express-session');
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

// Conexão com MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/corujao', {
  useNewUrlParser: true,
  useUnifiedTopology: true
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
  resave: false,
  saveUninitialized: true
}));

// Rotas de Autenticação
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
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
  console.log('Novo usuário conectado');
  
  // Autenticação via Socket
  socket.on('login', async (nick, callback) => {
    try {
      const user = await User.findOne({ username: nick });
      const isAdmin = user?.role === 'admin';
      
      if (user) {
        socket.user = {
          nick: user.username,
          admin: isAdmin
        };
        
        callback({ ok: true, admin: isAdmin });
        socket.emit('system', `Bem-vindo de volta, ${nick}!`);
      } else {
        callback({ ok: false, msg: 'Usuário não encontrado' });
      }
    } catch (err) {
      callback({ ok: false, msg: 'Erro no servidor' });
    }
  });

  // Sistema de Mensagens
  socket.on('msg', async (text, room = 'geral', callback) => {
    if (!socket.user) return callback({ error: 'Não autenticado' });
    
    const message = new Message({
      user: socket.user.nick,
      text,
      room
    });
    
    await message.save();
    io.to(room).emit('msg', {
      from: socket.user.nick,
      text,
      admin: socket.user.admin
    });
    
    callback({ success: true });
  });

  // Comandos Admin
  socket.on('admin:ban', async (nick, reason) => {
    if (socket.user?.admin) {
      // Lógica de banimento
      io.emit('system', `Usuário @${nick} foi banido por ${reason}`);
    }
  });

  // Gerenciamento de Salas
  socket.on('join', (room) => {
    if (socket.room) {
      socket.leave(socket.room);
    }
    socket.join(room);
    socket.room = room;
  });
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
