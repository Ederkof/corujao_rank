// terminal.js

const socket = io();  // Conecta ao socket.io do servidor

let usuario = null; // Usuário logado
let logado = false;

// Função que inicia o chat depois do login
function iniciarChat() {
  if (!usuario) return;

  // Atualiza o nick na interface
  document.getElementById('terminal-nick').textContent = usuario;

  // Esconde modal
  document.getElementById('auth-modal').style.display = 'none';

  // Aqui você pode carregar mensagens antigas ou avisos
  appendMensagemSistema(`Bem-vindo(a), ${usuario}!`);

  // Ouvir mensagens do servidor
  socket.on('novaMensagem', msg => {
    appendMensagem(msg.usuario, msg.texto, msg.hora);
  });

  // Enviar mensagem
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

// Função que mostra mensagens no terminal
function appendMensagem(usuarioMsg, texto, hora) {
  const terminal = document.getElementById('terminal-corujao');
  const horaFormat = hora || new Date().toLocaleTimeString().slice(0, 5);
  const div = document.createElement('div');
  div.innerHTML = `[${horaFormat}] <span class="nick">${usuarioMsg}:</span> ${texto}`;
  terminal.appendChild(div);
  terminal.scrollTop = terminal.scrollHeight;
}

function appendMensagemSistema(texto) {
  const terminal = document.getElementById('terminal-corujao');
  const div = document.createElement('div');
  div.className = 'terminal-info';
  div.textContent = texto;
  terminal.appendChild(div);
  terminal.scrollTop = terminal.scrollHeight;
}

// Login com chamada API
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
      headers: {'Content-Type':'application/json'},
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (res.ok) {
      usuario = username;
      logado = true;
      iniciarChat();
    } else {
      alert(data.error || 'Falha no login');
    }
  } catch (err) {
    alert('Erro de conexão');
    console.error(err);
  }
}

// Cadastro com chamada API
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
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ username, password })
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

// Checa se está logado ao carregar a página
async function checkLogin() {
  try {
    const res = await fetch('https://corujao-rank-production.up.railway.app/api/auth/check', {
      credentials: 'include'
    });
    const data = await res.json();
    if (res.ok && data.success) {
      usuario = data.user.username;
      logado = true;
      iniciarChat();
    } else {
      document.getElementById('auth-modal').style.display = 'flex';
    }
  } catch {
    document.getElementById('auth-modal').style.display = 'flex';
  }
}

// Chamar no carregamento da página
document.addEventListener('DOMContentLoaded', () => {
  checkLogin();
});
