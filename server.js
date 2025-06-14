// ===== BACKEND AUTENTICAÇÃO BÁSICA NODEJS/MONGODB =====
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const session = require('express-session');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 4040;

// --- 1. CONEXÃO COM O MONGODB LOCAL OU ATLAS ---
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/backend_global';
mongoose.connect(mongoUri)
  .then(() => console.log('Conectado ao MongoDB com sucesso!'))
  .catch(err => {
    console.error('Erro ao conectar ao MongoDB:', err.message);
    process.exit(1);
  });

// --- 2. MODELO DE USUÁRIO ---
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  role: { type: String, default: 'user' },
  permissions: [String]
});
const User = mongoose.model('User', userSchema);

// --- 3. MIDDLEWARES GLOBAIS ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SECRET_KEY || 'corujao-secret',
  resave: false,
  saveUninitialized: false
}));

// --- 4. PATCH UNIVERSAL: EDERKOF É SEMPRE ADMIN ---
async function patchEderkofAdmin(user) {
  if (user.username === "ederkof") {
    user.role = "admin";
    user.permissions = ["all"];
    await user.save();
  }
}

// --- 5. ROTAS DE AUTENTICAÇÃO ---

// REGISTRO
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuário e senha obrigatórios.' });

  const userExists = await User.findOne({ username });
  if (userExists) return res.status(400).json({ error: 'Usuário já existe.' });

  const hashed = await bcrypt.hash(password, 10);
  const user = new User({ username, password: hashed });
  await patchEderkofAdmin(user);
  await user.save();

  req.session.userId = user._id;
  res.json({ message: 'Usuário registrado!', username: user.username });
});

// LOGIN
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(400).json({ error: 'Usuário não encontrado.' });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ error: 'Senha incorreta.' });

  await patchEderkofAdmin(user);
  req.session.userId = user._id;
  res.json({ message: 'Login realizado!', username: user.username });
});

// --- 6. ROTA DE TESTE (opcional) ---
app.get('/api/teste', (req, res) => {
  res.json({ mensagem: "API funcionando!" });
});

// --- 7. ROTA PARA PEGAR USUÁRIO LOGADO (SESSÃO) ---
app.get('/api/me', async (req, res) => {
  if (!req.session.userId) return res.json({});
  const user = await User.findById(req.session.userId);
  if (!user) return res.json({});
  res.json({ username: user.username, role: user.role });
});

// --- 8. LOGOUT ---
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: "Logout feito com sucesso." });
  });
});

// --- 9. SERVE O FRONTEND NA HOME ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- 10. INICIA O SERVIDOR ---
app.listen(PORT, () => {
  console.log(`Servidor Corujão rodando na porta ${PORT}`);
});
