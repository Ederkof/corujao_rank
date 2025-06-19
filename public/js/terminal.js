// terminal.js - Versão corrigida e completa

const API_BASE = 'https://corujao-rank-production.up.railway.app';
const AUTH_API = `${API_BASE}/api/auth`;

const authModal = document.getElementById('auth-modal');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const terminalNick = document.getElementById('terminal-nick');
const terminalCorujao = document.getElementById('terminal-corujao');
const promptRow = document.getElementById('prompt-row');
const msgInput = document.getElementById('msg');

let currentUser = null;

// Exibe mensagem no terminal (com scroll automático)
function addTerminalMessage(text, className = 'msg-corujao') {
  const hora = new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
  const div = document.createElement('div');
  div.className = className;
  div.innerHTML = `[${hora}] ${text}`;
  terminalCorujao.appendChild(div);
  terminalCorujao.scrollTop = terminalCorujao.scrollHeight;
}

// Função para trocar a aba de autenticação (login/cadastro) — já está no HTML, só manter
function switchAuthTab(tab) {
  if (tab === 'login') {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    document.querySelectorAll('.auth-tab').forEach(el => el.classList.toggle('active', el.textContent.toLowerCase() === 'login'));
  } else {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    document.querySelectorAll('.auth-tab').forEach(el => el.classList.toggle('active', el.textContent.toLowerCase() === 'cadastro'));
  }
}

// Função para verificar login ao carregar a página
async function checkLogin() {
  try {
    const response = await axios.get(`${AUTH_API}/check`, { withCredentials: true });
    if (response.data.success) {
      currentUser = response.data.user;
      terminalNick.textContent = currentUser.username;
      authModal.style.display = 'none';
      addTerminalMessage(`Bem-vindo, <span class="nick self">${currentUser.username}</span>!`, 'terminal-success');
    } else {
      authModal.style.display = 'flex';
    }
  } catch (error) {
    authModal.style.display = 'flex';
  }
}

// Função para realizar login
window.handleLogin = async function() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();

  if (!username || !password) {
    alert('Por favor, preencha nome de usuário e senha.');
    return;
  }

  try {
    const response = await axios.post(`${AUTH_API}/login`, { username, password }, { withCredentials: true });
    if (response.data.success) {
      currentUser = response.data.user;
      terminalNick.textContent = currentUser.username;
      authModal.style.display = 'none';
      addTerminalMessage(`Login efetuado com sucesso. Bem-vindo, <span class="nick self">${currentUser.username}</span>!`, 'terminal-success');
    } else {
      alert(response.data.message || 'Erro no login.');
    }
  } catch (error) {
    alert('Erro ao conectar com o servidor.');
  }
};

// Função para realizar cadastro
window.handleRegister = async function() {
  const username = document.getElementById('register-username').value.trim();
  const password = document.getElementById('register-password').value.trim();
  const confirm = document.getElementById('register-confirm').value.trim();

  if (!username || !password || !confirm) {
    alert('Por favor, preencha todos os campos.');
    return;
  }

  if (password !== confirm) {
    alert('As senhas não coincidem.');
    return;
  }

  try {
    const response = await axios.post(`${AUTH_API}/register`, { username, password }, { withCredentials: true });
    if (response.data.success) {
      alert('Cadastro realizado com sucesso! Faça login agora.');
      switchAuthTab('login');
    } else {
      alert(response.data.message || 'Erro no cadastro.');
    }
  } catch (error) {
    alert('Erro ao conectar com o servidor.');
  }
};

// Função para enviar mensagem no terminal
async function sendMessage(text) {
  if (!text.trim()) return;

  addTerminalMessage(`<span class="nick self">${currentUser ? currentUser.username : 'visitante'}</span>: ${text}`, 'msg-voce');
  msgInput.value = '';

  // Aqui você pode implementar o envio via socket ou API conforme sua aplicação
  // Exemplo básico:
  // socket.emit('chat message', text);
}

// Inicialização e eventos
document.addEventListener('DOMContentLoaded', () => {
  checkLogin();

  // Evento submit para o formulário do chat
  promptRow.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentUser) {
      alert('Você precisa estar logado para enviar mensagens.');
      return;
    }
    const text = msgInput.value;
    sendMessage(text);
  });
});
