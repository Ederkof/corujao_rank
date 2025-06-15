// Corujão Server - Versão Final
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const usuarios = {};
const salas = { geral: [] };
const mural = [];
const desafios = [];
const ranking = {};
const adminNick = "ederkof";

// --- Middleware e arquivos estáticos ---
app.use(express.static(path.join(__dirname, 'public')));

function unicoNick(nick) {
    return !Object.values(usuarios).some(u => u.nick === nick);
}

function usuarioAdmin(nick) {
    return nick.toLowerCase() === adminNick;
}

// --- Roteamento HTTP ---
app.get('/api/salas', (req, res) => {
    const lista = Object.entries(salas).map(([nome, users]) => ({
        nome, usuarios: users.length
    }));
    res.json(lista);
});

app.get('/api/mural', (req, res) => res.json(mural));
app.get('/api/desafios', (req, res) => res.json(desafios));
app.get('/api/ranking', (req, res) => {
    const lista = Object.entries(ranking)
        .sort((a, b) => b[1] - a[1])
        .map(([nick, pontos]) => ({ nick, pontos }));
    res.json(lista);
});

// --- Socket.io ---
io.on('connection', socket => {
    let usuario = null;

    socket.on('login', (nick, cb) => {
        if (!nick || !unicoNick(nick)) {
            cb({ ok: false, msg: 'Nick já em uso ou inválido.' });
            return;
        }
        usuario = { nick, sala: 'geral', admin: usuarioAdmin(nick) };
        usuarios[socket.id] = usuario;
        salas.geral.push(nick);
        cb({ ok: true, admin: usuario.admin });
        io.emit('sidebar', getSidebar());
        socket.join('geral');
        socket.emit('msg', { from: 'Sistema', text: `Bem-vindo, ${nick}! Use /ajuda para comandos.` });
        io.to('geral').emit('msg', { from: 'Sistema', text: `${nick} entrou na sala.` });
    });

    socket.on('comando', (cmd, cb) => {
        if (!usuario) return;
        const [com, ...args] = cmd.trim().split(' ');
        switch (com) {
            case '/ajuda':
                cb({
                    ok: true, text:
`/sala nome — entrar/criar sala
/salas — ver salas ativas
/desafios — ver desafios abertos
/ranking — ranking dos relatos de desafios
/curiosidades — fatos do mural ou "em breve"
/limpar — limpar sua tela
/emotions — lista de emojis
/logout — sair do sistema
#nome — destacar mensagem para alguém
/admin — [apenas admin] painel admin
`
                }); break;
            case '/sala':
                if (!args[0]) { cb({ ok: false, text: 'Digite o nome da sala.' }); break; }
                mudarSala(socket, usuario, args[0]);
                cb({ ok: true, text: `Você agora está na sala #${args[0]}` });
                break;
            case '/salas':
                socket.emit('salas', Object.entries(salas).map(([nome, users]) => ({
                    nome, usuarios: users.length
                })));
                break;
            case '/desafios':
                socket.emit('desafios', desafios);
                break;
            case '/ranking':
                socket.emit('ranking', Object.entries(ranking)
                    .sort((a, b) => b[1] - a[1])
                    .map(([nick, pontos]) => ({ nick, pontos })));
                break;
            case '/curiosidades':
                if (mural.length) {
                    const fato = mural[Math.floor(Math.random() * mural.length)];
                    cb({ ok: true, text: `Curiosidade: ${fato.text}` });
                } else {
                    cb({ ok: true, text: 'Curiosidades em breve!' });
                }
                break;
            case '/limpar':
                socket.emit('limpar');
                cb({ ok: true, text: 'Chat limpo! Continue digitando.' });
                break;
            case '/emotions':
                cb({ ok: true, text: 'Emojis: :coruja: 🦉 :sorriso: 😁 :fogo: 🔥' });
                break;
            case '/logout':
                sair(socket, usuario, true);
                break;
            case '/admin':
                if (!usuario.admin) { cb({ ok: false, text: 'Somente admin.' }); break; }
                cb({ ok: true, text: 'Painel admin: /fixar, /ban, /nick, /encerrar, /mural' });
                break;
            default:
                cb({ ok: false, text: 'Comando não reconhecido. Use /ajuda.' });
        }
    });

    socket.on('msg', (msg, cb) => {
        if (!usuario) return;
        // Destacar para usuário: #nome
        let destacado = null;
        if (msg.startsWith('#')) {
            const alvo = msg.split(' ')[0].slice(1);
            if (!Object.values(usuarios).find(u => u.nick === alvo)) {
                cb({ ok: false, text: 'Usuário não encontrado.' }); return;
            }
            destacado = alvo;
        }
        // Registrar relato se for desafio (exemplo: dentro de sala que é um desafio)
        if (usuario.sala.startsWith('desafio-')) {
            ranking[usuario.nick] = (ranking[usuario.nick] || 0) + 1;
            mural.push({ text: `${usuario.nick} relatou em ${usuario.sala}`, tipo: 'relato' });
            io.emit('mural', mural.slice(-8));
        }
        // Envia mensagem na sala
        io.to(usuario.sala).emit('msg', {
            from: usuario.nick,
            text: msg,
            destaque: destacado
        });
    });

    // --- Admin actions ---
    socket.on('fixarNoMural', texto => {
        if (usuario && usuario.admin) {
            mural.push({ text: texto, tipo: 'fixo', autor: usuario.nick });
            io.emit('mural', mural.slice(-8));
        }
    });
    socket.on('criarDesafio', dados => {
        if (usuario && usuario.admin) {
            const nome = `desafio-${desafios.length + 1}`;
            desafios.push({ nome, ...dados, aberto: true });
            salas[nome] = [];
            io.emit('sidebar', getSidebar());
            io.emit('desafios', desafios);
        }
    });
    socket.on('encerrarDesafio', nome => {
        if (usuario && usuario.admin) {
            const desafio = desafios.find(d => d.nome === nome);
            if (desafio) desafio.aberto = false;
            io.emit('desafios', desafios);
        }
    });

    socket.on('disconnect', () => {
        if (!usuario) return;
        sair(socket, usuario, false);
    });
});

function mudarSala(socket, usuario, sala) {
    salas[usuario.sala] = salas[usuario.sala]?.filter(n => n !== usuario.nick) || [];
    socket.leave(usuario.sala);
    usuario.sala = sala;
    if (!salas[sala]) salas[sala] = [];
    salas[sala].push(usuario.nick);
    socket.join(sala);
    io.to(sala).emit('msg', { from: 'Sistema', text: `${usuario.nick} entrou na sala.` });
    io.emit('sidebar', getSidebar());
}

function sair(socket, usuario, logout) {
    salas[usuario.sala] = salas[usuario.sala]?.filter(n => n !== usuario.nick) || [];
    socket.leave(usuario.sala);
    if (logout) {
        socket.emit('msg', { from: 'Sistema', text: 'Logout realizado!' });
        delete usuarios[socket.id];
    } else {
        usuario.sala = 'geral';
        salas.geral.push(usuario.nick);
        socket.join('geral');
        socket.emit('msg', { from: 'Sistema', text: 'Você voltou para o chat geral!' });
    }
    io.emit('sidebar', getSidebar());
}

function getSidebar() {
    // Exemplo: últimas 4 salas, 4 usuários, 4 desafios abertos (loop)
    const ultSalas = Object.keys(salas).slice(-4);
    const ultUsers = Object.values(usuarios).slice(-4).map(u => u.nick);
    const abertos = desafios.filter(d => d.aberto).slice(-4).map(d => d.nome);
    return { ultSalas, ultUsers, abertos };
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log('Corujao Server rodando na porta ' + PORT));
