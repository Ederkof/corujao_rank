// main.js - Corujão Terminal V2.0 (Versão Estável)

// --- Estado Global ---
const state = {
    socket: io(),
    admin: false,
    nick: '',
    loggedIn: false
};

// --- Inicialização Segura ---
document.addEventListener('DOMContentLoaded', () => {
    // Configuração do Tema
    setupTheme();

    // Configuração dos Eventos
    setupEventListeners();

    // Inicia o processo de login
    initLogin();
});

// --- Configuração do Tema ---
function setupTheme() {
    const htmlElement = document.documentElement;
    const themeDots = document.querySelectorAll('.theme-dot');

    const updateTheme = (idx) => {
        if (idx === 0) {
            htmlElement.classList.remove('claro');
            themeDots[0]?.classList.add('selected');
            themeDots[1]?.classList.remove('selected');
        } else {
            htmlElement.classList.add('claro');
            themeDots[1]?.classList.add('selected');
            themeDots[0]?.classList.remove('selected');
        }
    };

    updateTheme(0); // Tema escuro por padrão
    themeDots[0]?.addEventListener('click', () => updateTheme(0));
    themeDots[1]?.addEventListener('click', () => updateTheme(1));
}

// --- Configuração dos Eventos ---
function setupEventListeners() {
    // Botão enviar e input
    const enviarBtn = el('enviar');
    const inputElement = el('input');

    if (enviarBtn && inputElement) {
        enviarBtn.addEventListener('click', enviarMsg);
        inputElement.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') enviarMsg();
        });
    }

    // Botões de comando rápido
    document.querySelectorAll('.cmd').forEach(button => {
        button.addEventListener('click', () => {
            const input = el('input');
            if (input) {
                input.value = button.textContent.trim();
                input.focus();
            }
        });
    });
}

// --- Sistema de Login ---
function initLogin() {
    // Verifica se já tem um nick armazenado
    const savedNick = localStorage.getItem('corujao_nick');
    
    if (savedNick && savedNick.length >= 3) {
        tryLogin(savedNick);
    } else {
        showNickModal();
    }
}

function showNickModal() {
    const modal = `
        <div class="modal-overlay active">
            <div class="modal">
                <h3>Bem-vindo ao Corujão Terminal</h3>
                <input type="text" id="nick-input" placeholder="Digite seu nick" autofocus>
                <button id="confirm-nick">Entrar</button>
                <p class="error-msg" id="nick-error"></p>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modal);

    const nickInput = document.getElementById('nick-input');
    const confirmBtn = document.getElementById('confirm-nick');
    const errorMsg = document.getElementById('nick-error');

    confirmBtn.addEventListener('click', () => {
        const nick = nickInput.value.trim();
        if (validateNick(nick)) {
            tryLogin(nick);
        }
    });

    nickInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const nick = nickInput.value.trim();
            if (validateNick(nick)) {
                tryLogin(nick);
            }
        }
    });
}

function validateNick(nick) {
    const errorMsg = document.getElementById('nick-error');
    if (!errorMsg) return false;

    if (!nick || nick.length < 3) {
        errorMsg.textContent = "Nick deve ter pelo menos 3 caracteres";
        return false;
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(nick)) {
        errorMsg.textContent = "Use apenas letras, números e underline";
        return false;
    }

    errorMsg.textContent = "";
    return true;
}

function tryLogin(nick) {
    state.socket.emit('login', nick, (resp) => {
        if (resp.ok) {
            // Login bem-sucedido
            state.nick = nick;
            state.admin = resp.admin;
            state.loggedIn = true;
            
            // Armazena o nick no localStorage
            localStorage.setItem('corujao_nick', nick);
            
            // Atualiza a UI
            updateUIAfterLogin();
            
            // Remove o modal
            const modal = document.querySelector('.modal-overlay');
            if (modal) modal.remove();
            
            // Carrega dados iniciais
            loadInitialData();
        } else {
            // Mostra erro no modal
            const errorMsg = document.getElementById('nick-error');
            if (errorMsg) errorMsg.textContent = resp.msg;
            
            // Foca no input novamente
            const nickInput = document.getElementById('nick-input');
            if (nickInput) nickInput.focus();
        }
    });
}

function updateUIAfterLogin() {
    const nickElement = el('terminal-nick');
    if (nickElement) nickElement.textContent = state.nick;
    
    const chatList = el('chat-list');
    if (chatList) chatList.innerHTML = '';
    
    addMsg('Sistema', `Bem-vindo, ${state.nick}! Digite /ajuda para ver os comandos.`, false, true);
    
    const input = el('input');
    if (input) {
        input.focus();
        input.disabled = false;
        input.placeholder = "Digite sua mensagem...";
    }
}

function loadInitialData() {
    state.socket.emit('sidebar');
    state.socket.emit('mural');
}

// --- Funções do Chat ---
function enviarMsg() {
    const inputElement = el('input');
    if (!inputElement || !state.loggedIn) return;
    
    const val = inputElement.value.trim();
    if (!val) return;

    if (val.startsWith('/')) {
        state.socket.emit('comando', val, (resp) => {
            if (resp?.text) addMsg('Sistema', resp.text, null, true);
        });
    } else {
        state.socket.emit('msg', val, (resp) => {
            if (resp?.text) addMsg('Sistema', resp.text, null, true);
        });
    }
    inputElement.value = '';
    inputElement.focus();
}

function addMsg(from, text, destaque = false, sistema = false) {
    const chatList = el('chat-list');
    if (!chatList) return;

    const hora = new Date().toLocaleTimeString('pt-BR').slice(0,5);
    let classe = sistema ? 'msg-sistema' : 'msg-corujao';
    
    if (from.toLowerCase() === state.nick.toLowerCase()) {
        classe = 'msg-voce';
    }
    if (destaque) classe += ' destaque';

    const processedText = destacarMencoes(mostrarEmotions(text));
    const li = document.createElement('li');
    li.className = classe;
    li.innerHTML = `<span class="hora">[${hora}]</span> ${nomeSpan(from)}: ${processedText}`;
    chatList.appendChild(li);
    chatList.scrollTop = chatList.scrollHeight;
}

// --- Funções Auxiliares ---
function el(id) { 
    return document.getElementById(id); 
}

function nomeSpan(nome) {
    if (nome.toLowerCase() === state.nick.toLowerCase()) {
        return `<span class="nick self">@${nome}</span>`;
    } else {
        return `<span class="nick">@${nome}</span>`;
    }
}

function destacarMencoes(texto) {
    return texto.replace(/@([a-zA-Z0-9_]+)/g, (match, nome) => {
        if (nome.toLowerCase() === state.nick.toLowerCase()) {
            return `<span class="nick self">@${nome}</span>`;
        } else {
            return `<span class="nick">@${nome}</span>`;
        }
    });
}

function mostrarEmotions(texto) {
    return texto
        .replace(/:coruja:/g, '🦉')
        .replace(/:fogo:/g, '🔥')
        .replace(/:zzz:/g, '😴')
        .replace(/:top:/g, '😎')
        .replace(/:alegria:/g, '😂')
        .replace(/:viva:/g, '🙌')
        .replace(/:pc:/g, '💻')
        .replace(/:sorriso:/g, '😁');
}

// --- Eventos Socket.IO ---
state.socket.on('connect', () => {
    if (state.loggedIn) {
        // Reconecta automaticamente se já estava logado
        state.socket.emit('relogin', state.nick, (resp) => {
            if (resp.ok) {
                state.admin = resp.admin;
                addMsg('Sistema', 'Reconectado ao servidor', false, true);
            }
        });
    }
});

state.socket.on('disconnect', () => {
    addMsg('Sistema', 'Conexão perdida. Tentando reconectar...', true, true);
});

state.socket.on('msg', (data) => {
    addMsg(data.from, data.text, data.destaque, data.sistema);
});

state.socket.on('limpar', () => { 
    const cl = el('chat-list'); 
    if (cl) cl.innerHTML = ''; 
});

state.socket.on('salas', (salas) => {
    addMsg('Sistema', 'Salas ativas: ' + salas.map(s => `#${s.nome} (${s.usuarios})`).join(', '), false, true);
});

state.socket.on('desafios', (desafios) => {
    addMsg('Sistema', 'Desafios: ' + desafios.map(d => `${d.nome} (${d.aberto ? 'Aberto' : 'Fechado'})`).join(', '), false, true);
});

state.socket.on('ranking', (lista) => {
    addMsg('Sistema', 'TOP CORUJÕES:\n' + lista.map((e, i) => `${i+1}. @${e.nick} - ${e.pontos}`).join('\n'), false, true);
});

state.socket.on('mural', renderMural);
state.socket.on('sidebar', renderSidebar);

// --- Funções de Renderização ---
function renderMural(muralData) { 
    const chatList = el('chat-list');
    if (!chatList) return;

    const oldMuralItems = chatList.querySelectorAll('.mural-item');
    oldMuralItems.forEach(item => item.remove());

    muralData.forEach(e => {
        const li = document.createElement('li');
        li.className = `msg-evento mural-item ${e.tipo === 'fixo' ? 'fixo' : ''}`;
        li.innerHTML = mostrarEmotions(e.text);
        chatList.insertBefore(li, chatList.firstChild); 
    });
    chatList.scrollTop = chatList.scrollHeight;
}

function renderSidebar({ ultSalas, ultUsers, abertos }) {
    const listaAmigos = el('lista-amigos');
    const listaSalas = el('lista-salas');
    const sidebarDirUl = el('sidebar-dir')?.querySelector('ul');

    if (listaAmigos) listaAmigos.innerHTML = '';
    if (listaSalas) listaSalas.innerHTML = '';
    if (sidebarDirUl) sidebarDirUl.innerHTML = '';

    if (listaAmigos && ultUsers) {
        ultUsers.forEach(u => {
            const li = document.createElement('li');
            li.onclick = () => jogarProCentro(u, 'amigo');
            li.textContent = u;
            listaAmigos.appendChild(li);
        });
    }

    if (listaSalas && ultSalas) {
        ultSalas.forEach(s => {
            const li = document.createElement('li');
            li.onclick = () => jogarProCentro(s, 'sala');
            li.textContent = `#${s}`;
            listaSalas.appendChild(li);
        });
    }

    if (sidebarDirUl && abertos) {
        sidebarDirUl.innerHTML += `<li class="titulo">Desafios & Torneios</li>`;
        abertos.forEach(d => {
            const li = document.createElement('li');
            li.onclick = () => eventoPainel(d, 'event-desafio');
            li.textContent = d;
            sidebarDirUl.appendChild(li);
        });
    }
}

// --- Funções de Navegação ---
function jogarProCentro(item, tipo) {
    const inputElement = el('input');
    if (!inputElement) return;
    
    if (tipo === 'amigo') {
        inputElement.value = `/msg ${item} `;
    } else if (tipo === 'sala') {
        inputElement.value = `/entrar ${item}`;
    }
    inputElement.focus();
}

function eventoPainel(evento, tipo) {
    const inputElement = el('input');
    if (!inputElement) return;
    
    if (tipo === 'event-desafio') {
        inputElement.value = `/desafio ${evento}`;
        inputElement.focus();
    }
}
