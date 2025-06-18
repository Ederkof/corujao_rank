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
        lastMessageTime: 0
    };

    // Cache seguro de elementos UI com verificação
    const UI = {};
    try {
        UI.chatList = document.getElementById('chat-list');
        UI.msgInput = document.getElementById('msg');
        UI.nickDisplay = document.getElementById('terminal-nick');
        UI.sidebarUsers = document.getElementById('lista-amigos');
        UI.sidebarRooms = document.getElementById('lista-salas');
        UI.adminPanel = document.createElement('div');
        
        if (!UI.chatList || !UI.msgInput) throw new Error('Elementos essenciais não encontrados');
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

    function addMessage(from, text, isAdmin = false) {
        try {
            if (!from || !text) return;
            
            // Prevenção de flood (1 mensagem por segundo)
            const now = Date.now();
            if (now - state.lastMessageTime < 1000) return;
            state.lastMessageTime = now;

            const messageElement = document.createElement('li');
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            messageElement.className = from === (state.user?.username || '') ? 'msg-voce' : 'msg-corujao';
            if (isAdmin) messageElement.classList.add('admin-msg');

            messageElement.innerHTML = `
                <span class="hora">[${time}]</span>
                ${formatNickname(from)}: 
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

    // Restante do código (igual ao anterior, mas usando as novas funções seguras)
    // ... [incluir todas as outras funções do código anterior aqui]
    // Substituindo as chamadas originais pelas versões seguras

    // Inicialização segura
    function safeInit() {
        try {
            setupEventListeners();
            showLoginModal();
            setupAdminPanel();
            safeLog('Aplicação inicializada com segurança');
        } catch (e) {
            safeError('Erro na inicialização:', e);
            showFatalError('Erro crítico. Por favor, recarregue.');
        }
    }

    safeInit();
});
