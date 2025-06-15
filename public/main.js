// main.js - Corujão Terminal V2.0 (Cliente Unificado)

// --- Conexão Socket.IO ---
const socket = io(); 
let admin = false;
let nick = '';

// --- Funções Auxiliares ---
function el(id) { return document.getElementById(id); }

function nomeSpan(nome) {
    if (nome.toLowerCase() === nick.toLowerCase()) {
        return `<span class="nick self">@${nome}</span>`;
    } else {
        return `<span class="nick">@${nome}</span>`;
    }
}

function destacarMencoes(texto) {
    return texto.replace(/@([a-zA-Z0-9_]+)/g, (match, nome) => {
        if (nome.toLowerCase() === nick.toLowerCase()) {
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

// --- Funções de Renderização ---
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

function addMsg(from, text, destaque = false, sistema = false) {
    const chatList = el('chat-list');
    if (!chatList) return;

    const hora = new Date().toLocaleTimeString('pt-BR').slice(0,5);
    let classe = sistema ? 'msg-sistema' : 'msg-corujao';
    
    if (from.toLowerCase() === nick.toLowerCase()) {
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

// --- Login ---
function pedirNick() {
    nick = prompt("Digite seu nick (único):") || '';
    if (!nick) {
        alert("Nick é obrigatório!");
        pedirNick(); 
        return;
    }
    
    const nickElement = el('terminal-nick');
    if (nickElement) nickElement.textContent = nick;
    
    socket.emit('login', nick, resp => {
        if (!resp.ok) {
            alert(resp.msg);
            pedirNick();
        } else {
            admin = resp.admin;
            const chatList = el('chat-list');
            if (chatList) chatList.innerHTML = '';
            addMsg('Sistema', `Bem-vindo, ${nick}! Digite /ajuda para ver os comandos.`, false, true);
            socket.emit('sidebar'); 
            socket.emit('mural');
        }
    });
}

// --- Eventos Socket.IO ---
socket.on('msg', data => addMsg(data.from, data.text, data.destaque, data.sistema));
socket.on('limpar', () => { const cl = el('chat-list'); if (cl) cl.innerHTML = ''; });
socket.on('salas', salas => addMsg('Sistema', 'Salas ativas: ' + salas.map(s => `#${s.nome} (${s.usuarios})`).join(', '), false, true));
socket.on('desafios', desafios => addMsg('Sistema', 'Desafios: ' + desafios.map(d => `${d.nome} (${d.aberto ? 'Aberto' : 'Fechado'})`).join(', '), false, true));
socket.on('ranking', lista => addMsg('Sistema', 'TOP CORUJÕES:\n' + lista.map((e, i) => `${i+1}. @${e.nick} - ${e.pontos}`).join('\n'), false, true));
socket.on('mural', renderMural);
socket.on('sidebar', renderSidebar);

// --- Funções Auxiliares ---
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

function enviarMsg() {
    const inputElement = el('input');
    if (!inputElement) return;
    
    const val = inputElement.value.trim();
    if (!val) return;

    if (val.startsWith('/')) {
        socket.emit('comando', val, resp => {
            if (resp?.text) addMsg('Sistema', resp.text, null, true);
        });
    } else {
        socket.emit('msg', val, resp => {
            if (resp?.text) addMsg('Sistema', resp.text, null, true);
        });
    }
    inputElement.value = '';
}

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    // Configuração de Tema
    const htmlElement = document.documentElement;
    const themeDots = document.querySelectorAll('.theme-dot');

    function atualizaTema(idx) {
        if (idx === 0) {
            htmlElement.classList.remove('claro');
            themeDots[0]?.classList.add('selected');
            themeDots[1]?.classList.remove('selected');
        } else {
            htmlElement.classList.add('claro');
            themeDots[1]?.classList.add('selected');
            themeDots[0]?.classList.remove('selected');
        }
    }
    
    atualizaTema(0);
    themeDots[0]?.addEventListener('click', () => atualizaTema(0));
    themeDots[1]?.addEventListener('click', () => atualizaTema(1));

    // Configuração de Eventos
    const enviarBtn = el('enviar');
    if (enviarBtn) enviarBtn.addEventListener('click', enviarMsg);

    const inputElement = el('input');
    if (inputElement) {
        inputElement.addEventListener('keypress', e => {
            if (e.key === 'Enter') enviarMsg();
        });
    }

    // Botões de Comando
    document.querySelectorAll('.cmd').forEach(button => {
        button.addEventListener('click', () => {
            if (inputElement) {
                inputElement.value = button.textContent.trim();
                inputElement.dispatchEvent(new KeyboardEvent('keypress', {
                    key: 'Enter',
                    bubbles: true
                }));
            }
        });
    });

    // Inicia após pequeno delay
    setTimeout(pedirNick, 300);
});
