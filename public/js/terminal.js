const io = require('socket.io-client');
const readline = require('readline');

const SOCKET_URL = 'http://localhost:4040';

// Função para login via API (simples, usando fetch)
const fetch = require('node-fetch');
const fetchCookie = require('fetch-cookie/node-fetch')(fetch);
const cookieJar = {};

async function login(username, password) {
  try {
    const res = await fetchCookie(`${SOCKET_URL}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      headers: { 'Content-Type': 'application/json' }
    });
    if (res.ok) {
      console.log('Login efetuado com sucesso!');
      return true;
    } else {
      console.log('Falha no login:', await res.text());
      return false;
    }
  } catch (err) {
    console.error('Erro no login:', err);
    return false;
  }
}

async function startChat() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.question('Usuário: ', async (username) => {
    rl.question('Senha: ', async (password) => {
      const logged = await login(username, password);
      if (!logged) {
        rl.close();
        return;
      }

      // Conectar socket com cookie da sessão
      const socket = io(SOCKET_URL, {
        withCredentials: true,
        extraHeaders: {
          // nenhum cabeçalho extra por enquanto
        }
      });

      socket.on('connect', () => {
        console.log('Conectado ao servidor');
        socket.emit('join_room', 'general');
      });

      socket.on('message_history', (messages) => {
        console.log('Histórico:');
        messages.forEach(m => {
          console.log(`[${m.room}] ${m.user.username}: ${m.text}`);
        });
      });

      socket.on('new_message', (message) => {
        console.log(`[${message.room}] ${message.user.username}: ${message.text}`);
      });

      socket.on('system_message', (msg) => {
        console.log(`[SYSTEM] ${msg}`);
      });

      socket.on('error', (err) => {
        console.log('[ERROR]', err);
      });

      rl.on('line', (input) => {
        // Envia mensagem para 'general'
        if (input.trim().length > 0) {
          socket.emit('send_message', { room: 'general', text: input });
        }
      });

      socket.on('disconnect', () => {
        console.log('Desconectado do servidor');
        rl.close();
      });
    });
  });
}

startChat();
