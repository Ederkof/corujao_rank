// main.js - Corujão Terminal V2.0 (Cliente Unificado)

// --- Conexão Socket.IO ---
const socket = io(); 
let admin = false; // Flag para verificar se o usuario logado é admin
let nick = ''; // O nickname do usuario logado

// --- Funções Auxiliares de Elementos HTML ---
function el(id) { return document.getElementById(id); }

// --- Funções de Destaque e Formatação ---
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

// --- Funções de Renderização da Interface (Adaptadas para seu HTML) ---
function renderSidebar({ ultSalas, ultUsers, abertos }) {
    const listaAmigos = el('lista-amigos');
    const listaSalas = el('lista-salas');
    const sidebarDirUl = el('sidebar-dir').querySelector('ul'); // Lista dentro da sidebar direita

    // Limpa as listas existentes
    if (listaAmigos) listaAmigos.innerHTML = '';
    if (listaSalas) listaSalas.innerHTML = '';
    if (sidebarDirUl) sidebarDirUl.innerHTML = '';

    // Renderiza Amigos (ultUsers)
    if (listaAmigos && ultUsers) {
        ultUsers.forEach(u => {
            const li = document.createElement('li');
            li.onclick = () => jogarProCentro(u, 'amigo'); // Simulação de clique local
            li.textContent = u;
            listaAmigos.appendChild(li);
        });
    }

    // Renderiza Salas (ultSalas)
    if (listaSalas && ultSalas) {
        ultSalas.forEach(s => {
            const li = document.createElement('li');
            li.onclick = () => jogarProCentro(s, 'sala'); // Simulação de clique local
            li.textContent = `#${s}`; // Adiciona '#' para salas
            listaSalas.appendChild(li);
        });
    }

    // Renderiza Desafios/Torneios (abertos) na sidebar direita
    if (sidebarDirUl && abertos) {
        sidebarDirUl.innerHTML += `<li class="titulo">Desafios & Torneios</li>`; // Recria o titulo
        abertos.forEach(d => {
            const li = document.createElement('li');
            li.onclick = () => eventoPainel(d, 'event-desafio'); // Simulação de clique local
            li.textContent = d;
            sidebarDirUl.appendChild(li);
        });
    }
}

function renderMural(muralData) { 
    const chatList = el('chat-list');

    // Remove itens de mural anteriores para evitar duplicacao
    const oldMuralItems = chatList.querySelectorAll('.mural-item');
    oldMuralItems.forEach(item => item.remove());

    muralData.forEach(e => {
        const li = document.createElement('li');
        li.className = `msg-evento mural-item ${e.tipo === 'fixo' ? 'fixo' : ''}`;
        li.innerHTML = mostrarEmotions(e.text); 

        // Adiciona sempre como o primeiro filho para que o mural fique no topo
        // (Assumindo que o #terminal-header nao eh um filho direto de chat-list mas sim acima)
        if (chatList) {
            chatList.insertBefore(li, chatList.firstChild); 
        }
    });
    chatList.scrollTop = chatList.scrollHeight; // Rola para o final para ver a ultima mensagem
}

// --- Funções de Adicionar Mensagens ao Chat ---
function addMsg(from, text, destaque = false, sistema = false) {
    const chatList = el('chat-list');
    const hora = new Date().toLocaleTimeString('pt-BR').slice(0,5);
    let classe = sistema ? 'msg-sistema' : 'msg-corujao'; 
    if (from.toLowerCase() === nick.toLowerCase()) {
        classe = 'msg-voce'; // Se a msg é do proprio user
    }
    if (destaque) classe += ' destaque';

    let processedText = destacarMencoes(mostrarEmotions(text));

    const li = document.createElement('li');
    li.className = classe;
    li.innerHTML = `<span class="hora">[${hora}]</span> ${nomeSpan(from)}: ${processedText}`;

    // Adiciona ao final da lista
    if (chatList) {
        chatList.appendChild(li);
        chatList.scrollTop = chatList.scrollHeight;
    }
}

// --- Login e Fluxo Principal ---
function pedirNick() {
    nick = prompt("Digite seu nick (único):") || '';
    if (!nick) {
        alert("Nick é obrigatório!");
        pedirNick(); 
        return;
    }
    el('terminal-nick').textContent = nick; 
    socket.emit('login', nick, resp => {
        if (!resp.ok) {
            alert(resp.msg);
            pedirNick();
        } else {
            admin = resp.admin;
            el('chat-list').innerHTML = ''; // Limpa o chat após login bem-sucedido
            addMsg('Sistema', `Bem-vindo, ${nick}! Digite /ajuda para ver os comandos.`, false, true);
            // Emite para o servidor os eventos para ele enviar os dados iniciais
            socket.emit('sidebar'); 
            socket.emit('mural');
        }
    });
}

// --- Eventos do Socket.IO (Mensagens e Comandos do Servidor) ---
socket.on('msg', data => {
    addMsg(data.from, data.text, data.destaque, data.sistema);
});

socket.on('limpar', () => { el('chat-list').innerHTML = ''; }); 

socket.on('salas', salas => {
    // As salas ja sao renderizadas pela sidebar, entao este eh um log para o chat
    addMsg('Sistema', 'Salas ativas: ' + salas.map(s => `#<span class="math-inline">\{s\.nome\} \(</span>{s.usuarios})`).join(', '), false, true);
});

socket.on('desafios', desafios => {
    // Os desafios ja sao renderizados pela sidebar, entao este eh um log para o chat
    addMsg('Sistema', 'Desafios: ' + desafios.map(d => `<span class="math-inline">\{d\.nome\} \(</span>{d.aberto ? 'Aberto' : 'Fechado'})`).join(', '), false, true);
});

socket.on('ranking', lista => {
    let rankText = 'TOP CORUJÕES:\n' + lista.map((e, i) => `<span class="math-inline">\{i\+1\}\. @</span>{e.nick} - ${e.pontos}`).join('\n');
    addMsg('Sistema', rankText, false, true);
});

socket.on('mural', renderMural); // Servidor envia atualizacao do mural
socket.on('sidebar', renderSidebar); // Servidor envia atualizacao da sidebar

// --- Envio de Mensagens e Comandos pelo Usuário ---
el('enviar').onclick = enviarMsg;
el('input').addEventListener('keypress', e => { if (e.key === 'Enter') enviarMsg(); });

function enviarMsg() {
    const val = el('input').value.trim();
    if (!val) return;

    // Se é um comando, envia para o servidor para processamento
    if (val.startsWith('/')) {
        socket.emit('comando', val, resp => {
            if (!resp) return;
            if (resp.text) addMsg('Sistema', resp.text, null, true);
        });
    } else {
        // Se é uma mensagem normal, envia para o servidor
        socket.emit('msg', val, resp => {
            if (resp && resp.text) addMsg('Sistema', resp.text, null, true); 
        });
    }
    el('input').value = ''; // Limpa o input
}

// --- Lógica de Tema Claro/Escuro (do seu JS original) ---
window.addEventListener('load', () => { // Usar 'load' para garantir que tudo esteja pronto
    const htmlElement = document.documentElement;
    const themeDots = document.querySelectorAll('.theme-dot');

    function atualizaTema(idx) {
        if(idx === 0) { // Escuro
            htmlElement.classList.remove('claro');
            themeDots[0].classList.add('selected');
            themeDots[1].classList.remove('selected');
        } else { // Claro
            htmlElement.classList.add('claro');
            themeDots[1].classList.add('selected');
            themeDots[0].classList.remove('selected');
        }
    }
    // Inicializa o tema padrao (escuro)
    atualizaTema(0); 

    themeDots[0].onclick = () => atualizaTema(0); 
    themeDots[1].onclick = () => atualizaTema(1);

    el('msg').focus(); // Foca no input de mensagem após o carregamento completo

    // --- Lógica para os botões do rodapé (/comandos) ---
    const cmdButtons = document.querySelectorAll('.cmd');
    cmdButtons.forEach(button => {
        button.onclick = () => {
            const commandText = button.textContent.trim();
            el('input').value = commandText; // Coloca o comando no input
            // Simula o evento Enter para acionar o envioMsg
            const event = new KeyboardEvent('keypress', { key: 'Enter', bubbles: true, cancelable: true });
            el('input').dispatchEvent(event);
        };
    });

    // Pede o nick apos o DOM estar pronto e a pagina carregada
    // Atrasado um pouco para garantir que o prompt apareca apos o layout
    setTimeout(pedirNick, 500); 
});
