const socket = io();
let admin = false;

function el(id) { return document.getElementById(id); }

let nick = '';

function renderSidebar({ ultSalas, ultUsers, abertos }) {
    el('sidebar').innerHTML =
        `<b>Salas:</b> ${ultSalas.join(', ')}<br>
         <b>Usuários:</b> ${ultUsers.join(', ')}<br>
         <b>Desafios:</b> ${abertos.join(', ')}`;
}
function renderMural(mural) {
    el('mural').innerHTML = mural.map(e =>
        `<div class="${e.tipo === 'fixo' ? 'fixo' : ''}">${e.text}</div>`
    ).join('');
}

// --- Login simples ---
function pedirNick() {
    nick = prompt("Digite seu nick (único):") || '';
    socket.emit('login', nick, resp => {
        if (!resp.ok) { alert(resp.msg); pedirNick(); }
        else {
            admin = resp.admin;
            el('messages').innerHTML = '';
        }
    });
}
pedirNick();

// --- Eventos chat principal ---
socket.on('msg', data => {
    const { from, text, destaque } = data;
    let classe = from === 'Sistema' ? 'sistema' : 'msg';
    let html = '';
    if (destaque) classe += ' destaque';
    html = `<div class="${classe}"><span class="nick">${from}</span>: ${text}</div>`;
    el('messages').innerHTML += html;
    el('messages').scrollTop = el('messages').scrollHeight;
});
socket.on('limpar', () => { el('messages').innerHTML = ''; });
socket.on('salas', salas => {
    alert('Salas ativas:\n' + salas.map(s => `#${s.nome} (${s.usuarios})`).join('\n'));
});
socket.on('desafios', desafios => {
    alert('Desafios:\n' + desafios.map(d => `${d.nome} (${d.aberto ? 'Aberto' : 'Fechado'})`).join('\n'));
});
socket.on('ranking', lista => {
    alert('TOP CORUJOES:\n' + lista.map((e, i) => `${i+1}. ${e.nick} - ${e.pontos}`).join('\n'));
});
socket.on('mural', renderMural);
socket.on('sidebar', renderSidebar);

// --- Prompt ---
el('enviar').onclick = enviarMsg;
el('input').addEventListener('keypress', e => { if (e.key === 'Enter') enviarMsg(); });

function enviarMsg() {
    const val = el('input').value.trim();
    if (!val) return;
    if (val.startsWith('/')) {
        socket.emit('comando', val, resp => {
            if (!resp) return;
            if (resp.text) addMsg('Sistema', resp.text, null, true);
            if (resp.ok === false) el('input').value = '';
        });
    } else {
        socket.emit('msg', val, resp => {
            if (resp && resp.text) addMsg('Sistema', resp.text, null, true);
        });
    }
    el('input').value = '';
}
function addMsg(from, text, destaque, sistema) {
    let classe = sistema ? 'sistema' : 'msg';
    if (destaque) classe += ' destaque';
    let html = `<div class="${classe}"><span class="nick">${from}</span>: ${text}</div>`;
    el('messages').innerHTML += html;
    el('messages').scrollTop = el('messages').scrollHeight;
}

// --- Admin (fixar mural) ---
if (admin) {
    el('mural').onclick = () => {
        const texto = prompt('Texto para fixar no mural:');
        if (texto) socket.emit('fixarNoMural', texto);
    }
}

socket.emit('sidebar');
socket.emit('mural');
