// main.js - Corujão Terminal (Versão Final Segura)
document.addEventListener('DOMContentLoaded', () => {
    // Configurações base com fallback seguro
    const API_BASE = 'https://corujao-rank-1.onrender.com';
    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    // Silenciar logs em produção
    const safeLog = (...args) => {
        if (isLocalhost) console.log('[Corujão]', ...args);
    };

    const safeError = (...args) => {
        if (isLocalhost) console.error('[Corujão]', ...args);
    };

    // Inicialização segura do Socket.IO com fallback
    let socket;
    try {
        socket = io(API_BASE, {
            withCredentials: true,
            autoConnect: false,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 10000,
            transports: ['websocket']
        });
    } catch (e) {
        safeError('Erro ao inicializar socket:', e);
        showFatalError('Erro de conexão. Recarregue a página.');
        return;
    }

    // Estado da aplicação com valores padrão seguros
    const state = {
        user: null,
        currentRoom: 'geral',
        isAdmin: false,
        onlineUsers: [],
        lastMessageTime: 0,
        rateLimit: {
            lastMessage: 0,
            count: 0
        }
    };

    // Cache seguro de elementos UI com verificação
    const UI = {};
    try {
        UI.chatList = document.getElementById('chat-list');
        UI.msgInput = document.getElementById('msg');
        UI.nickDisplay = document.getElementById('terminal-nick');
        UI.sidebarUsers = document.getElementById('lista-amigos');
        UI.sidebarRooms = document.getElementById('lista-salas');
        UI.loginModal = document.getElementById('login-modal');
        UI.nickInput = document.getElementById('login-nick');
        UI.loginButton = document.getElementById('login-button');
        UI.adminPanel = document.createElement('div');
        
        if (!UI.chatList || !UI.msgInput || !UI.loginModal) {
            throw new Error('Elementos essenciais não encontrados');
        }
    } catch (e) {
        safeError('Erro ao carregar elementos:', e);
        showFatalError('Erro no sistema. Recarregue a página.');
        return;
    }

    // Funções de segurança
    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"'`=\/]/g, tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
            "'": '&#39;', '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;'
        }[tag]));
    }

    function sanitizeInput(input, maxLength = 200) {
        return escapeHTML(input.toString().trim().substring(0, maxLength));
    }

    function isValidNick(nick) {
        return /^[a-zA-Z0-9_]{3,20}$/.test(nick);
    }

    // Funções de UI com tratamento de erro silencioso
    function showFatalError(message) {
        try {
            const errorEl = document.createElement('div');
            errorEl.className = 'fatal-error';
            errorEl.innerHTML = `<p>🦉 ${escapeHTML(message)}</p>`;
            document.body.prepend(errorEl);
        } catch (e) {
            safeError('Erro ao mostrar erro fatal:', e);
        }
    }

    function showLoginModal() {
        try {
            UI.loginModal.style.display = 'block';
            UI.nickInput.focus();
        } catch (e) {
            safeError('Erro ao mostrar modal de login:', e);
        }
    }

    function hideLoginModal() {
        try {
            UI.loginModal.style.display = 'none';
        } catch (e) {
            safeError('Erro ao esconder modal de login:', e);
        }
    }

    function addMessage(from, text, isAdmin = false, isSystem = false) {
        try {
            if (!from || !text) return;
            
            // Prevenção de flood (1 mensagem por segundo)
            const now = Date.now();
            if (now - state.lastMessageTime < 1000) return;
            state.lastMessageTime = now;

            const messageElement = document.createElement('li');
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            if (isSystem) {
                messageElement.className = 'msg-sistema';
            } else {
                messageElement.className = from === (state.user?.username || '') ? 'msg-voce' : 'msg-corujao';
                if (isAdmin) messageElement.classList.add('admin-msg');
            }

            messageElement.innerHTML = `
                <span class="hora">[${time}]</span>
                ${isSystem ? '' : formatNickname(from)} 
                ${formatMessage(text)}
            `;

            UI.chatList.appendChild(messageElement);
            scrollChatToBottom();
        } catch (e) {
            safeError('Erro ao adicionar mensagem:', e);
        }
    }

    function formatNickname(nick) {
        try {
            if (!nick) return '';
            const isSelf = nick === (state.user?.username || '');
            const isAdmin = state.onlineUsers.find(u => u.nick === nick)?.admin;
            return `<span class="nick ${isSelf ? 'self' : ''} ${isAdmin ? 'admin' : ''}">@${sanitizeInput(nick)}</span>`;
        } catch (e) {
            safeError('Erro ao formatar nickname:', e);
            return '@unknown';
        }
    }

    function formatMessage(text) {
        try {
            const escaped = sanitizeInput(text);
            return escaped
                .replace(/:coruja:/g, '🦉')
                .replace(/:fogo:/g, '🔥')
                .replace(/@(\w+)/g, (match, nick) => formatNickname(nick));
        } catch (e) {
            safeError('Erro ao formatar mensagem:', e);
            return '[mensagem inválida]';
        }
    }

    function scrollChatToBottom() {
        try {
            UI.chatList.scrollTop = UI.chatList.scrollHeight;
        } catch (e) {
            safeError('Erro ao rolar chat:', e);
        }
    }

    function updateUserList(users) {
        try {
            state.onlineUsers = users;
            if (!UI.sidebarUsers) return;

            UI.sidebarUsers.innerHTML = '';
            users.forEach(user => {
                const userElement = document.createElement('li');
                userElement.className = user.admin ? 'admin' : '';
                userElement.textContent = `@${user.nick}`;
                UI.sidebarUsers.appendChild(userElement);
            });
        } catch (e) {
            safeError('Erro ao atualizar lista de usuários:', e);
        }
    }

    function updateRoomList(rooms) {
        try {
            if (!UI.sidebarRooms) return;

            UI.sidebarRooms.innerHTML = '';
            rooms.forEach(room => {
                const roomElement = document.createElement('li');
                roomElement.textContent = `#${room}`;
                if (room === state.currentRoom) {
                    roomElement.classList.add('active');
                }
                roomElement.addEventListener('click', () => joinRoom(room));
                UI.sidebarRooms.appendChild(roomElement);
            });
        } catch (e) {
            safeError('Erro ao atualizar lista de salas:', e);
        }
    }

    function joinRoom(room) {
        try {
            if (!room || room === state.currentRoom) return;
            
            socket.emit('leave-room', state.currentRoom);
            state.currentRoom = room;
            socket.emit('join-room', room);
            
            addMessage('Sistema', `Você entrou na sala ${room}`, false, true);
            updateRoomList([...new Set([...state.rooms, room])]);
        } catch (e) {
            safeError('Erro ao entrar na sala:', e);
        }
    }

    function setupAdminPanel() {
        try {
            if (!state.isAdmin) return;
            
            UI.adminPanel.id = 'admin-panel';
            UI.adminPanel.innerHTML = `
                <h3>Painel Admin</h3>
                <button id="ban-user">Banir Usuário</button>
                <button id="mute-user">Silenciar Usuário</button>
            `;
            document.body.appendChild(UI.adminPanel);
        } catch (e) {
            safeError('Erro ao configurar painel admin:', e);
        }
    }

    function handleLogin() {
        try {
            const nick = UI.nickInput.value.trim();
            if (!isValidNick(nick)) {
                alert('Nick inválido! Use apenas letras, números e underscore (3-20 caracteres)');
                return;
            }

            state.user = { username: nick };
            UI.nickDisplay.textContent = nick;
            hideLoginModal();

            // Conectar ao socket após login
            socket.connect();
        } catch (e) {
            safeError('Erro no login:', e);
            showFatalError('Erro durante o login. Recarregue a página.');
        }
    }

    function setupEventListeners() {
        try {
            // Eventos de UI
            UI.loginButton.addEventListener('click', handleLogin);
            UI.nickInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleLogin();
            });

            UI.msgInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && UI.msgInput.value.trim()) {
                    const now = Date.now();
                    
                    // Prevenção de flood
                    if (now - state.rateLimit.lastMessage < 2000) {
                        state.rateLimit.count++;
                        if (state.rateLimit.count > 3) {
                            addMessage('Sistema', 'Aguarde antes de enviar mais mensagens', false, true);
                            return;
                        }
                    } else {
                        state.rateLimit.count = 0;
                    }
                    state.rateLimit.lastMessage = now;

                    socket.emit('chat-message', {
                        room: state.currentRoom,
                        text: UI.msgInput.value
                    });
                    UI.msgInput.value = '';
                }
            });

            // Eventos do Socket.IO
            socket.on('connect', () => {
                addMessage('Sistema', 'Conectado ao servidor', false, true);
                socket.emit('join-room', state.currentRoom);
            });

            socket.on('disconnect', () => {
                addMessage('Sistema', 'Desconectado do servidor', false, true);
            });

            socket.on('chat-message', (data) => {
                addMessage(data.from, data.text, data.admin);
            });

            socket.on('user-list', (users) => {
                updateUserList(users);
            });

            socket.on('room-list', (rooms) => {
                updateRoomList(rooms);
            });

            socket.on('admin-status', (isAdmin) => {
                state.isAdmin = isAdmin;
                if (isAdmin) setupAdminPanel();
            });

            socket.on('error', (err) => {
                addMessage('Sistema', `Erro: ${err.message}`, false, true);
            });

            socket.on('banned', () => {
                showFatalError('Você foi banido deste servidor.');
            });

        } catch (e) {
            safeError('Erro ao configurar event listeners:', e);
            showFatalError('Erro no sistema. Recarregue a página.');
        }
    }

    // Inicialização segura
    function safeInit() {
        try {
            setupEventListeners();
            showLoginModal();
            safeLog('Aplicação inicializada com segurança');
        } catch (e) {
            safeError('Erro na inicialização:', e);
            showFatalError('Erro crítico. Por favor, recarregue.');
        }
    }

    safeInit();
});
