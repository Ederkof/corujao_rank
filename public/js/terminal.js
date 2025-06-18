document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('terminal-corujao');
  const term = document.createElement('div');
  term.className = 'terminal-area';
  term.tabIndex = 0;
  container.appendChild(term);

  // URLs da API - atualize conforme necessário
  const API_URL = 'https://corujao-rank-production.up.railway.app/api/chat';
  const API_AUTH = 'https://corujao-rank-production.up.railway.app/api/auth';
  const SOCKET_URL = 'https://corujao-rank-production.up.railway.app';

  // Elementos do modal de login
  const authModal = document.getElementById('auth-modal');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const authSwitch = document.getElementById('auth-switch');

  // Estado do usuário
  let usuario = "";
  let logado = false;
  let salaAtual = "geral";
  let socket = null;
  let mensagensCache = [];

  // Funções auxiliares
  function appendLine(txt, className = "") {
    const line = document.createElement('div');
    if (className) line.className = className;
    line.innerHTML = txt;
    term.appendChild(line);
    term.scrollTop = term.scrollHeight;
  }

  function appendInput(prompt, callback) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';

    const promptSpan = document.createElement('span');
    promptSpan.textContent = prompt;
    row.appendChild(promptSpan);

    const input = document.createElement('input');
    input.type = "text";
    input.className = "terminal-input";
    row.appendChild(input);
    term.appendChild(row);

    input.focus();

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        const value = input.value;
        row.remove();
        callback(value);
      }
    });
  }

  // Sistema de autenticação
  async function handleLogin(username, password) {
    try {
      const response = await fetch(`${API_AUTH}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok) {
        usuario = username;
        logado = true;
        authModal.style.display = 'none';
        iniciarChat();
      } else {
        appendLine(`Erro no login: ${data.error}`, "terminal-erro");
      }
    } catch (error) {
      appendLine("Erro na conexão com o servidor", "terminal-erro");
      console.error('Login error:', error);
    }
  }

  async function handleRegister(username, password) {
    try {
      const response = await fetch(`${API_AUTH}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok) {
        appendLine(`Registro bem-sucedido! Agora faça login.`, "terminal-success");
        switchAuthMode();
      } else {
        appendLine(`Erro no registro: ${data.error}`, "terminal-erro");
      }
    } catch (error) {
      appendLine("Erro na conexão com o servidor", "terminal-erro");
      console.error('Register error:', error);
    }
  }

  function switchAuthMode() {
    const isLogin = loginForm.style.display !== 'none';
    loginForm.style.display = isLogin ? 'none' : 'block';
    registerForm.style.display = isLogin ? 'block' : 'none';
    authSwitch.textContent = isLogin ? 'Já tem conta? Faça login' : 'Não tem conta? Registre-se';
  }

  // Event listeners para autenticação
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleLogin(usernameInput.value, passwordInput.value);
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleRegister(usernameInput.value, passwordInput.value);
  });

  authSwitch.addEventListener('click', switchAuthMode);

  // Sistema de chat
  function iniciarChat() {
    term.innerHTML = '';
    appendLine("Bem-vindo ao Corujão Chat!", "terminal-info");
    appendLine("Digite /ajuda para ver os comandos disponíveis", "terminal-info");

    iniciarSocketIO();
    carregarMensagensIniciais();
    promptComando();
  }

  function iniciarSocketIO() {
    socket = io(SOCKET_URL, {
      withCredentials: true,
      reconnectionAttempts: 5
    });

    socket.on('connect', () => {
      appendLine("[Conectado ao chat em tempo real]", "terminal-success");
      socket.emit('joinRoom', salaAtual);
    });

    socket.on('new_message', (msg) => {
      if (msg.room !== salaAtual) return;

      appendLine(
        `<span class="hora">${new Date(msg.createdAt).toLocaleTimeString()}</span> ` +
        `<span class="nick${msg.user.username === usuario ? ' self' : ''}">@${msg.user.username}</span>: ` +
        `${msg.text}`,
        msg.user.username === usuario ? "msg-voce" : "msg-corujao"
      );
    });

    socket.on('error', (err) => {
      appendLine(`[Erro: ${err.message}]`, "terminal-erro");
    });
  }

  async function carregarMensagensIniciais() {
    try {
      const response = await fetch(`${API_URL}?room=${salaAtual}`);
      const messages = await response.json();

      messages.forEach(msg => {
        appendLine(
          `<span class="hora">${new Date(msg.createdAt).toLocaleTimeString()}</span> ` +
          `<span class="nick${msg.user.username === usuario ? ' self' : ''}">@${msg.user.username}</span>: ` +
          `${msg.text}`,
          msg.user.username === usuario ? "msg-voce" : "msg-corujao"
        );
      });
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }

  async function enviarMensagem(texto) {
    if (!texto.trim()) return;

    if (socket && socket.connected) {
      socket.emit('sendMessage', {
        room: salaAtual,
        text: texto
      });
    } else {
      try {
        await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: texto,
            room: salaAtual
          }),
          credentials: 'include'
        });
      } catch (error) {
        appendLine("Erro ao enviar mensagem", "terminal-erro");
      }
    }
  }

  function processaComando(txt) {
    const comando = txt.trim();
    if (!comando) {
      promptComando();
      return;
    }

    if (comando.startsWith('/')) {
      const [cmd, ...args] = comando.slice(1).split(' ');

      switch(cmd) {
        case 'sala':
          if (args.length) {
            salaAtual = args[0];
            if (socket) socket.emit('joinRoom', salaAtual);
            appendLine(`Entrou na sala: ${salaAtual}`, "terminal-info");
            carregarMensagensIniciais();
          }
          break;

        case 'ranking':
          mostrarRanking();
          break;

        case 'ajuda':
          mostrarAjuda();
          break;

        default:
          appendLine(`Comando desconhecido: /${cmd}`, "terminal-erro");
      }
    } else {
      enviarMensagem(comando);
    }

    promptComando();
  }

  function promptComando() {
    appendInput(`[${usuario}@${salaAtual}]$ `, processaComando);
  }

  function mostrarRanking() {
    appendLine("Ranking (em desenvolvimento)", "terminal-info");
  }

  function mostrarAjuda() {
    appendLine("<b>Comandos disponíveis:</b>", "terminal-info");
    appendLine("/sala [nome] - Troca de sala", "terminal-info");
    appendLine("/ranking - Mostra o ranking", "terminal-info");
    appendLine("/ajuda - Mostra esta ajuda", "terminal-info");
  }

  // Inicialização
  function iniciar() {
    // Verifica se já está logado
    fetch(`${API_AUTH}/check`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          usuario = data.user.username;
          logado = true;
          iniciarChat();
        } else {
          authModal.style.display = 'flex';
        }
      })
      .catch(() => {
        authModal.style.display = 'flex';
      });
  }

  iniciar();
});
