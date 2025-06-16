require('dotenv').config();

// Debug environment variables
console.log('[DEBUG] Environment Variables:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  MONGODB_URI: process.env.MONGODB_URI ? '***REDACTED***' : 'MISSING'
});

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const socketIO = require('socket.io');
const http = require('http');
const path = require('path'); // Adicionado para possível uso com arquivos estáticos

// App Configuration
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Security Check
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ FATAL: MONGODB_URI not defined in environment variables');
  process.exit(1);
}

// Enhanced MongoDB Connection
mongoose.connect(MONGODB_URI, {
  dbName: 'corujao_chat',
  connectTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  w: 'majority'
})
.then(() => console.log('🔥 Connected to MongoDB | Database: corujao_chat'))
.catch(err => {
  console.error('💥 MongoDB Connection Error:', err.message);
  console.error('ℹ️ Verify your MONGODB_URI starts with mongodb:// or mongodb+srv://');
  process.exit(1);
});

// Modelos (mantidos iguais)
const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    unique: true, 
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 20,
    match: /^[a-zA-Z0-9_]+$/
  },
  password: { 
    type: String, 
    required: true,
    minlength: 6,
    select: false
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
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
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
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// Session Configuration
const sessionStore = MongoStore.create({
  mongoUrl: MONGODB_URI,
  dbName: 'corujao_chat',
  collectionName: 'sessions',
  ttl: 86400,
  autoRemove: 'interval',
  autoRemoveInterval: 60
});

// Middlewares
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || require('crypto').randomBytes(64).toString('hex'),
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 86400000
  }
}));

// =============================================
// ROTA RAIZ ADICIONADA AQUI (NOVA)
// =============================================
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Corujão Chat</title>
      <style>
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f5f5f5;
          margin: 0;
          padding: 20px;
          color: #333;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
          background: white;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { 
          color: #2c3e50;
          text-align: center;
        }
        .status {
          background: #2ecc71;
          color: white;
          padding: 10px 20px;
          border-radius: 20px;
          display: inline-block;
          margin: 10px 0;
        }
        .routes {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 5px;
          margin-top: 20px;
        }
        .route {
          margin: 10px 0;
          padding: 10px;
          border-left: 3px solid #3498db;
          background: white;
        }
        .method {
          font-weight: bold;
          color: #3498db;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🦉 Corujão Chat - Backend</h1>
        <div style="text-align: center;">
          <div class="status">Servidor operacional ✅</div>
        </div>
        
        <div class="routes">
          <h3>📡 Endpoints disponíveis:</h3>
          
          <div class="route">
            <span class="method">POST</span> /register - Registrar novo usuário
          </div>
          
          <div class="route">
            <span class="method">POST</span> /login - Autenticar usuário
          </div>
          
          <div class="route">
            <span class="method">WEBSOCKET</span> / - Conexão Socket.IO para chat em tempo real
          </div>
        </div>
        
        <div style="margin-top: 30px; text-align: center; color: #7f8c8d;">
          <small>${new Date().toLocaleString('pt-BR')} | Ambiente: ${process.env.NODE_ENV || 'development'}</small>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Rotas existentes mantidas abaixo...
app.post('/register', async (req, res) => {
  /* ... (mantido igual) ... */
});

app.post('/login', async (req, res) => {
  /* ... (mantido igual) ... */
});

// Socket.IO (mantido igual)
io.on('connection', (socket) => {
  /* ... (mantido igual) ... */
});

// Server Initialization
const PORT = process.env.PORT || 4040;
server.listen(PORT, () => {
  console.log(`🦉 Server running on port ${PORT}`);
  console.log(`🔗 Database: corujao_chat`);
  console.log(`🔐 Sessions: corujao_chat.sessions`);
});

// Error Handling
process.on('unhandledRejection', (err) => {
  console.error('💥 Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  process.exit(1);
});
