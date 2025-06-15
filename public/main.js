// main.js - Corujão Terminal (Versão Integrada)
document.addEventListener('DOMContentLoaded', () => {
    // --- Configuração Inicial ---
    const socket = io('https://seu-app.onrender.com', {
        withCredentials: true,
        autoConnect: false
    });

    // --- Estado Global ---
    const state = {
        user: null,
        currentRoom: 'geral',
        isAdmin: false,
        onlineUsers: []
    };

    // --- Elementos da UI ---
    const UI = {
        chatList: document.getElementById('chat-list'),
        msgInput: document.getElementById('msg'),
        nickDisplay: document.getElementById('terminal-nick'),
        sidebarUsers: document.getElementById('lista-amigos'),
        sidebarRooms: document.getElementById('lista-salas'),
        adminPanel: document.createElement('div') // Criaremos dinamicamente
    };

    // --- Inicialização ---
    function init() {
        setupEventListeners();
        showLoginModal();
        setupAdminPanel();
    }

    // --- Sistema de Login ---
    function showLoginModal() {
        const modalHTML = `
            <div class="modal-overlay active">
                <div class="modal-content">
                    <h3>🦉 Acessar Corujão Terminal</h3>
                    <div class="form-group">
                        <input type="text" id="login-username" placeholder="Seu nick" autofocus>
                    </div>
                    <div class="form-group">
                        <input type="password" id="login-password" placeholder="Sua senha">
                    </div>
                    <button id="login-btn">Entrar</button>
                    <button id="register-btn">Criar Conta</button>
                    <p class="error-message" id="login-error"></p>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        document.getElementById('login-btn').addEventListener('click', handleLogin);
        document.getElementById('register-btn').addEventListener('click', handleRegister);
        
        // Enter key support
        document.getElementById('login-password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
    }

    async function handleLogin() {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        
        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (data.success) {
                state.user = data.user;
                state.isAdmin = data.user.role === 'admin';
                setupSocketConnection();
                closeModal();
                updateUIAfterLogin();
            } else {
                showError(data.error || 'Credenciais inválidas');
            }
        } catch (err) {
            showError('Erro ao conectar ao servidor');
        }
    }

    async function handleRegister() {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        
        if (username.length < 3) {
            return showError('Nick precisa ter pelo menos 3 caracteres');
        }
        
        try {
            const response = await fetch('/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (data.success) {
                showError('Conta criada! Faça login agora', 'success');
            } else {
                showError(data.error || 'Erro ao criar conta');
            }
        } catch (err) {
            showError('Erro ao conectar ao servidor');
        }
    }

    function closeModal() {
        const modal = document.querySelector('.modal-overlay');
        if (modal) modal.remove();
    }

    function showError(message, type = 'error') {
        const errorEl = document.getElementById('login-error');
        errorEl.textContent = message;
        errorEl.className = `error-message ${type}`;
    }

    // --- Configuração do Socket.IO ---
    function setupSocketConnection() {
        socket.connect();
        
        socket.on('connect', () => {
            socket.emit('login', state.user.username, (response) => {
                if (response.ok) {
                    state.isAdmin = response.admin;
                    updateUIAfterLogin();
                    loadInitialData();
                }
            });
        });
        
        socket.on('msg', (data) => {
            addMessage(data.from, data.text, data.admin);
        });
        
        socket.on('system', (message) => {
            addSystemMessage(message);
        });
        
        socket.on('users:update', (users) => {
            state.onlineUsers = users;
            updateOnlineUsers();
        });
        
        socket.on('disconnect', () => {
            addSystemMessage('Conexão perdida. Tentando reconectar...');
        });
    }

    // --- Funções do Chat ---
    function addMessage(from, text, isAdmin = false) {
        const messageElement = document.createElement('li');
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageElement.className = from === state.user.username ? 'msg-voce' : 'msg-corujao';
        if (isAdmin) messageElement.classList.add('admin-msg');
        
        messageElement.innerHTML = `
            <span class="hora">[${time}]</span>
            ${formatNickname(from)}: 
            ${formatMessage(text)}
        `;
        
        UI.chatList.appendChild(messageElement);
        scrollChatToBottom();
    }

    function addSystemMessage(text) {
        const messageElement = document.createElement('li');
        messageElement.className = 'msg-sistema';
        messageElement.textContent = text;
        UI.chatList.appendChild(messageElement);
        scrollChatToBottom();
    }

    function formatNickname(nick) {
        const isSelf = nick === state.user.username;
        const isAdmin = state.onlineUsers.find(u => u.nick === nick)?.admin;
        
        return `
            <span class="nick ${isSelf ? 'self' : ''} ${isAdmin ? 'admin' : ''}">
                @${nick}
            </span>
        `;
    }

    function formatMessage(text) {
        // Processa emotions e menções
        return text
            .replace(/:coruja:/g, '🦉')
            .replace(/:fogo:/g, '🔥')
            .replace(/@(\w+)/g, (match, nick) => {
                return formatNickname(nick);
            });
    }

    function scrollChatToBottom() {
        UI.chatList.scrollTop = UI.chatList.scrollHeight;
    }

    // --- Controles do Chat ---
    function setupEventListeners() {
        // Envio de mensagem
        document.getElementById('prompt-row').addEventListener('submit', (e) => {
            e.preventDefault();
            sendMessage();
        });
        
        // Comandos rápidos
        document.querySelectorAll('.cmd').forEach(cmd => {
            cmd.addEventListener('click', () => {
                UI.msgInput.value = cmd.textContent.replace('/', '');
                UI.msgInput.focus();
            });
        });
        
        // Teclas de atalho
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                clearChat();
            }
        });
    }

    function sendMessage() {
        const text = UI.msgInput.value.trim();
        if (!text || !state.user) return;
        
        if (text.startsWith('/')) {
            handleCommand(text);
        } else {
            socket.emit('msg', text, state.currentRoom, (response) => {
                if (response.error) {
                    addSystemMessage(response.error);
                }
            });
        }
        
        UI.msgInput.value = '';
    }

    function handleCommand(cmd) {
        const args = cmd.slice(1).split(' ');
        const command = args[0].toLowerCase();
        
        switch (command) {
            case 'sala':
                changeRoom(args[1] || 'geral');
                break;
            case 'limpar':
                clearChat();
                break;
            case 'admin':
                if (state.isAdmin) showAdminPanel();
                break;
            // ... outros comandos
            default:
                addSystemMessage(`Comando desconhecido: ${command}`);
        }
    }

    function changeRoom(room) {
        socket.emit('join', room);
        state.currentRoom = room;
        addSystemMessage(`Entrou na sala: ${room}`);
    }

    function clearChat() {
        UI.chatList.innerHTML = '';
    }

    // --- Sistema de Admin ---
    function setupAdminPanel() {
        UI.adminPanel.id = 'admin-panel';
        UI.adminPanel.className = 'admin-panel';
        UI.adminPanel.innerHTML = `
            <h4>🛡️ Painel Admin</h4>
            <div class="admin-actions">
                <button class="admin-btn" data-action="ban">Banir Usuário</button>
                <button class="admin-btn" data-action="mute">Silenciar</button>
                <button class="admin-btn" data-action="broadcast">Anúncio</button>
            </div>
        `;
        
        document.body.appendChild(UI.adminPanel);
        
        // Event listeners para botões admin
        UI.adminPanel.querySelectorAll('.admin-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                handleAdminAction(action);
            });
        });
    }

    function handleAdminAction(action) {
        const nick = prompt(`Digite o nick para ${action}:`);
        if (!nick) return;
        
        switch (action) {
            case 'ban':
                const reason = prompt('Motivo do banimento:');
                socket.emit('admin:ban', nick, reason);
                break;
            // ... outras ações
        }
    }

    function showAdminPanel() {
        UI.adminPanel.style.display = state.isAdmin ? 'block' : 'none';
    }

    // --- Atualização da UI ---
    function updateUIAfterLogin() {
        // Atualiza nick exibido
        UI.nickDisplay.textContent = state.user.username;
        
        // Mostra controles admin
        if (state.isAdmin) {
            document.body.classList.add('admin-mode');
            showAdminPanel();
        }
        
        // Foca no input
        UI.msgInput.focus();
    }

    function updateOnlineUsers() {
        UI.sidebarUsers.innerHTML = '';
        state.onlineUsers.forEach(user => {
            const userEl = document.createElement('li');
            userEl.textContent = `@${user.nick} ${user.admin ? '🛡️' : ''}`;
            userEl.onclick = () => startPrivateChat(user.nick);
            UI.sidebarUsers.appendChild(userEl);
        });
    }

    function startPrivateChat(nick) {
        UI.msgInput.value = `/privado ${nick} `;
        UI.msgInput.focus();
    }

    function loadInitialData() {
        // Carrega mensagens iniciais
        fetch(`/messages?room=${state.currentRoom}`)
            .then(res => res.json())
            .then(messages => {
                messages.forEach(msg => {
                    addMessage(msg.user, msg.text);
                });
            });
        
        // Carrega usuários online
        socket.emit('get:users');
    }

    // Inicia a aplicação
    init();
});
