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

// Conexão com MongoDB - Versão Corrigida
mongoose.connect(process.env.MONGODB_URI, {
  dbName: 'corujao' // Adicionando nome do banco explicitamente
})
.then(() => console.log('✅ Conectado ao MongoDB Atlas! Banco: corujao'))
.catch(err => {
  console.error('❌ ERRO no MongoDB:', err.message);
  process.exit(1);
});

// Modelos (mantidos iguais, já estão corretos)
// ... [seus modelos User e Message permanecem iguais]

// Middlewares - SESSÃO CORRIGIDA DEFINITIVAMENTE
const sessionStore = MongoStore.create({
  mongoUrl: process.env.MONGODB_URI,
  dbName: 'corujao', // Mesmo banco da conexão principal
  collectionName: 'sessions',
  ttl: 14 * 24 * 60 * 60, // 14 dias
  autoRemove: 'native' // Limpeza automática de sessões expiradas
});

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'segredo-temporario',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Altere para true em produção com HTTPS
    httpOnly: true,
    maxAge: 14 * 24 * 60 * 60 * 1000 // 14 dias
  }
}));

// ... [suas rotas e lógica do Socket.IO permanecem iguais]

// Inicia o servidor
const PORT = process.env.PORT || 4040;
server.listen(PORT, () => {
  console.log(`🦉 Servidor rodando na porta ${PORT}`);
  console.log(`🔗 MongoDB: ${process.env.MONGODB_URI?.split('@')[1] || 'configurado'}`);
  console.log(`🛡️ Sessões armazenadas em: corujao.sessions`);
});
