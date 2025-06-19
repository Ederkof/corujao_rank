// terminal.js

// Conecta ao socket.io com URL explícita e websocket só
const socket = io('https://corujao-rank-production.up.railway.app', { transports: ['websocket'] });

let usuario = null; // Usuário logado

// Inicia chat após login
function iniciarChat() {
  if (!usuario) return;

  // Atualiza nick na interface (logo antes do input, conforme seu HTML)
  document.getElementById('terminal-nick').textContent = usuario;

  // Esconde modal login/cadastro
  document.getElementById('auth-modal').style.display = 'none';

  // Mensagem de boas-vindas no terminal
  appendMensagemSistema(`Bem-vindo(a), ${usuario}!`);

  // Ouve mensagens do servidor
  socket.on('novaMensagem', msg => {
    appendMensagem(msg.usuario, msg.texto, msg.hora);
  });

  // Envio de mensagem via form
  const form = document.getElementById('prompt-row');
  form.onsubmit = e => {
    e.preventDefault();
    const input = document.getElementById('msg');
    const texto = input.value.trim();
    if (!texto) return;
    socket.emit('enviarMensagem', { usuario, texto });
    input.value = '';
  };
}

// Append mensagem no terminal
function appendMensagem(usuarioMsg, texto, hora) {
  const terminal = document.getElementById('terminal-corujao');
  const horaFormat = hora || new Date().toLocaleTimeString().slice(0, 5);
  const div = document.createElement('div');
  div.innerHTML = `[${horaFormat}] <span class="nick">${usuarioMsg}:</span> ${texto}`;
  terminal.appendChild(div);
  terminal.scrollTop = terminal.scrollHeight;
}

// Append mensagem sistema (info)
function appendMensagemSistema(texto) {
  const terminal = document.getElementById('terminal-corujao');
  const div = document.createElement('div');
  div.className = 'terminal-info';
  div.textContent = texto;
  terminal.appendChild(div);
  terminal.scrollTop = terminal.scrollHeight;
}

// Login via API
async function handleLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  if (!username || !password) {
    alert('Informe usuário e senha!');
    return;
  }

  try {
    const res = await fetch('https://corujao-rank-production.up.railway.app/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (res.ok) {
      usuario = username;
      iniciarChat();
    } else {
      alert(data.error || 'Falha no login');
    }
  } catch (err) {
    alert('Erro de conexão');
    console.error(err);
  }
}

// Cadastro via API
async function handleRegister() {
  const username = document.getElementById('register-username').value.trim();
  const password = document.getElementById('register-password').value;
  const confirm = document.getElementById('register-confirm').value;

  if (!username || !password || !confirm) {
    alert('Preencha todos os campos!');
    return;
  }
  if (password !== confirm) {
    alert('Senhas não conferem!');
    return;
  }

  try {
    const res = await fetch('https://corujao-rank-production.up.railway.app/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (res.ok) {
      alert('Cadastro realizado com sucesso! Faça login.');
      switchAuthTab('login');
    } else {
      alert(data.error || 'Falha no cadastro');
    }
  } catch (err) {
    alert('Erro de conexão');
    console.error(err);
  }
}

// Verifica login ao carregar página
async function checkLogin() {
  try {
    const res = await fetch('https://corujao-rank-production.up.railway.app/api/auth/check', {
      credentials: 'include',
    });
    const data = await res.json();
    if (res.ok && data.success) {
      usuario = data.user.username;
      iniciarChat();
    } else {
      document.getElementById('auth-modal').style.display = 'flex';
    }
  } catch {
    document.getElementById('auth-modal').style.display = 'flex';
  }
}

// Carregar página: verificar login
document.addEventListener('DOMContentLoaded', () => {
  checkLogin();
});

// Expor funções globais para HTML chamar
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.switchAuthTab = function(tab) {
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
  document.querySelectorAll('.auth-tab').forEach(el => {
    el.classList.toggle('active', el.textContent.toLowerCase() === tab);
  });
};
