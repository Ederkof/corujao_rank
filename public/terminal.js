// terminal.js - Corujão Server: O terminal de chat mais completo do mundo!
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('terminal-corujano');
  const term = document.createElement('div');
  term.className = 'terminal-area';
  term.tabIndex = 0;
  container.appendChild(term);

  // URL do backend (ajuste conforme seu deploy)
  const API_URL = 'https://corujao-rank-1.onrender.com/api/mensagens';
  const API_RANKING = 'https://corujao-rank-1.onrender.com/api/ranking';

  // Manifesto & Mural
  const manifesto = [
    "███████████████████████████████████████████████████████████████",
    "█                                                           █",
    "█                 CORUJÃO SERVER - MANIFESTO                █",
    "█                                                           █",
    "█  Liberdade digital pra todos. Aqui ninguém é obrigado.    █",
    "█  Respeito acima de tudo. Sem patrão, sem abuso, sem medo. █",
    "█  Você cria sua própria história, sua conta, seu caminho.  █",
    "█  Tudo é livre, tudo é colaborativo.                       █",
    "█                                                           █",
    "█  Quem entra aqui aceita construir junto, com ética        █",
    "█  e responsabilidade.                                      █",
    "█                                                           █",
    "█  Bem-vindo à madrugada dos livres!                        █",
    "█                                                           █",
    "███████████████████████████████████████████████████████████████",
    ""
  ];

  const mural = [
    "Aviso do Corujão:",
    "- Respeite todo mundo!",
    "- Liberdade digital é nosso lema.",
    "- O que você criar aqui é seu e de todos.",
    "- Denuncie abusos ou problemas com /admin."
  ];

  // Curiosidades (adicione mais se quiser!)
  const curiosidades = [
    "Você sabia? O Corujão Server nasceu de um sonho de liberdade digital para todos.",
    "Curiosidade: O animal coruja simboliza sabedoria, visão noturna e liberdade de pensamento.",
    "A internet foi inventada para conectar pessoas. O Corujão existe para aproximar ainda mais!",
    "Você pode criar quantas salas quiser. Corujão é espaço livre, sem limites.",
    "O maior grupo de corujas é chamado de 'parlamento'. Agora você também faz parte!",
    "A cada nova sala criada aqui, nasce um espaço único de convivência, criatividade e amizade.",
    "A palavra 'hacker' já significou 'explorador curioso'. Seja um coruja-hacker do bem!",
    "Curiosidade musical: Muitas igrejas usam corais noturnos porque a noite inspira reflexão.",
    "A curiosidade é o motor da inteligência. Volte amanhã para mais uma curiosidade!",
    "Seja sempre livre para aprender, errar, tentar de novo e ensinar alguém. Isso é Corujão.",
    "Você sabia? O emoji 🦉 foi lançado oficialmente em 2015.",
    "No Japão, corujas são símbolo de proteção e boa sorte.",
    "A maior coruja do mundo é a Bubo bubo, que pode ter até 1,80m de envergadura.",
    "Toda vez que você faz uma pergunta, uma coruja aprende um pouco mais.",
    "As mulheres têm papel fundamental na tecnologia. Incentive e convide todas para o Corujão!"
  ];

  // Estado do terminal
  let usuario = "", senha = "";
  let logado = false;
  let salaAtual = "geral";
  let polling = null;
  let mensagensCache = [];
  let mensagensPrivadas = {}; // {nick: [mensagens]}
  let socket = null; // Conexão Socket.IO

  // Funções utilitárias
  function appendLine(txt, className = "") {
    const line = document.createElement('div');
    if (className) line.className = className;
    line.innerHTML = txt;
    term.appendChild(line);
    term.scrollTop = term.scrollHeight;
  }

  function appendInput(prompt, callback, isPassword = false) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';

    const promptSpan = document.createElement('span');
    promptSpan.textContent = prompt;
    row.appendChild(promptSpan);

    const input = document.createElement('input');
    input.type = isPassword ? "password" : "text";
    input.className = "terminal-input";
    row.appendChild(input);
    term.appendChild(row);

    input.focus();

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        const value = input.value;
        row.remove();
        callback(value);
      }
    });
    term.scrollTop = term.scrollHeight;
  }

  function destacarMencoes(texto) {
    return texto.replace(/@([a-zA-Z0-9_]+)/g, (match, nome) => {
      if (nome.toLowerCase() === usuario.toLowerCase()) {
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
      .replace(/:pc:/g, '💻');
  }

  // ----------- SOCKET.IO INTEGRATION -------------
  function iniciarSocketIO() {
    // Substitua pela URL do seu servidor Socket.IO
    socket = io('https://corujao-rank-1.onrender.com', {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ['websocket']
    });

    socket.on('connect', () => {
      appendLine("[Conectado ao servidor em tempo real]", "terminal-info");
      socket.emit('join', { usuario, sala: salaAtual });
    });

    socket.on('disconnect', () => {
      appendLine("[Conexão perdida. Tentando reconectar...]", "terminal-erro");
    });

    socket.on('nova_mensagem', (msg) => {
      if ((msg.sala || "geral") !== salaAtual) return;
      
      const hora = msg.hora || "--:--";
      const nome = msg.nome || "anon";
      const texto = destacarMencoes(mostrarEmotions(msg.texto || ""));
      
      appendLine(
        `<span class="hora">${hora}</span> <span class="nick${nome === usuario ? ' self' : ''}">@${nome}</span>: ${texto}`,
        nome === usuario ? "msg-voce" : "msg-corujao"
      );
      
      // Atualiza cache
      mensagensCache.push(msg);
    });

    socket.on('mensagem_privada', (data) => {
      receberMensagemPrivada(data.de, data.mensagem);
    });

    socket.on('usuario_entrou', (nick) => {
      appendLine(`<span class="terminal-info">@${nick} entrou na sala</span>`);
    });

    socket.on('usuario_saiu', (nick) => {
      appendLine(`<span class="terminal-info">@${nick} saiu da sala</span>`);
    });

    socket.on('error', (err) => {
      appendLine(`[Erro: ${err.message}]`, "terminal-erro");
    });
  }

  // ----------- CHAT INTEGRADO -------------
  async function carregarMensagensChat() {
    if (!logado) return;
    try {
      const res = await fetch(API_URL + '?sala=' + encodeURIComponent(salaAtual));
      const msgs = await res.json();
      if (JSON.stringify(msgs) !== JSON.stringify(mensagensCache)) {
        limparChatVisual();
        msgs.forEach(msg => {
          if ((msg.sala || "geral") !== salaAtual) return;
          const hora = msg.hora || "--:--";
          const nome = msg.nome || "anon";
          const texto = destacarMencoes(mostrarEmotions(msg.texto || ""));
          appendLine(
            `<span class="hora">${hora}</span> <span class="nick${nome === usuario ? ' self' : ''}">@${nome}</span>: ${texto}`,
            nome === usuario ? "msg-voce" : "msg-corujao"
          );
        });
        mensagensCache = msgs;
      }
    } catch (e) {
      appendLine("[Falha ao sincronizar com servidor...]", "terminal-erro");
    }
  }

  function limparChatVisual() {
    const lines = Array.from(term.querySelectorAll('.msg-voce, .msg-corujao'));
    lines.forEach(line => line.remove());
  }

  async function enviarMensagemBackend(texto) {
    if (!usuario) return;
    
    if (socket && socket.connected) {
      socket.emit('enviar_mensagem', {
        nome: usuario,
        texto,
        sala: salaAtual
      });
    } else {
      // Fallback para HTTP se o Socket.IO não estiver disponível
      await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: usuario, texto, sala: salaAtual })
      });
    }
  }

  // ----------- PRIVADO -------------
  function receberMensagemPrivada(de, msg) {
    if (!mensagensPrivadas[de]) mensagensPrivadas[de] = [];
    mensagensPrivadas[de].push(msg);
    appendLine(`<span class="msg-privado">[PRIVADO de @${de}]: ${msg}</span>`, "msg-privado");
  }

  function enviarMensagemPrivada(para, msg) {
    if (!mensagensPrivadas[para]) mensagensPrivadas[para] = [];
    mensagensPrivadas[para].push(msg);
    appendLine(`<span class="msg-privado">[PRIVADO para @${para}]: ${msg}</span>`, "msg-privado");
    
    if (socket && socket.connected) {
      socket.emit('mensagem_privada', {
        de: usuario,
        para,
        mensagem: msg
      });
    }
    // Implemente fallback HTTP aqui se necessário
  }

  // ----------- RANKING -------------
  async function mostrarRanking() {
    try {
      const res = await fetch(API_RANKING);
      const rank = await res.json();
      appendLine("<b>TOP CORUJÕES</b>", "terminal-info");
      rank.forEach((r, i) => appendLine(`${i+1}. @${r.nick} - ${r.pontos} pontos`, "terminal-info"));
    } catch {
      appendLine("Ranking indisponível.", "terminal-info");
    }
  }

  // ----------- MEMES -------------
  function mostrarMemeRandom() {
    const imagens = [
      'https://api.memegen.link/images/doge/Corujao/Server.png',
      'https://api.memegen.link/images/awesome/Corujao_is_Awesome.png',
      'https://api.memegen.link/images/rollsafe/Use_o_Corujao/Para_chats.png'
    ];
    const meme = imagens[Math.floor(Math.random() * imagens.length)];
    appendLine(`<img src="${meme}" alt="Meme" height="80">`, "terminal-info");
  }

  // ----------- BADGES -------------
  function mostrarBadge(nick) {
    if (!nick) nick = usuario;
    const badges = {
      'ederkof': '🦉🔥 Lenda Viva',
      'admin': '🛡️ Moderador',
      'anon': '👻 Invisível'
    };
    appendLine(`Badge de @${nick}: ${badges[nick] || '🦉 Coruja'} `, "terminal-info");
  }

  // ----------- CURIOSIDADES -------------
  function mostrarCuriosidade() {
    const idx = Math.floor(Math.random() * curiosidades.length);
    appendLine(`<b>Curiosidade do Dia:</b> ${curiosidades[idx]}`, "terminal-info");
  }
  // ----------- FLUXO PRINCIPAL -------------
  function iniciar() {
    if (polling) clearInterval(polling);
    if (socket) socket.disconnect();
    
    term.innerHTML = '';
    salaAtual = "geral";
    manifesto.forEach(linha => appendLine(linha, "terminal-info"));
    appendInput('Crie seu nome, sua história: ', nomeCriado);
  }

  function nomeCriado(nome) {
    usuario = nome.trim();
    if(usuario.length < 2) {
      appendLine("Nome muito curto. Tente novamente.", "terminal-info");
      appendInput('Crie seu nome, sua história: ', nomeCriado);
    } else {
      appendLine(`Usuário: ${usuario}`);
      appendInput('Sua senha: ', senhaCriada, true);
    }
  }

  function senhaCriada(s) {
    senha = s;
    appendLine(`Senha: ${'*'.repeat(senha.length)}`);
    appendLine(`Bem-vindo(a), ${usuario}! Agora é sua vez de deixar história aqui no Corujão Server.`);
    appendLine("Digite /ajuda para comandos ou comece a criar.");
    logado = true;
    
    // Inicia conexões
    iniciarSocketIO();
    
    setTimeout(() => {
      carregarMensagensChat();
      polling = setInterval(carregarMensagensChat, 2000);
    }, 500);
    promptComando();
  }

  function promptComando() {
    appendInput(`[${usuario}@${salaAtual}]$ `, processaComando);
  }

  function mensagemInspiradoraSala(novaSala) {
    appendLine(`<b>Você criou ou entrou na sala <span style="color:var(--azul-nick)">#${novaSala}</span>!</b>`, "terminal-info");
    appendLine(`<span style="color:var(--verde2)">
      Aqui é seu espaço livre para compartilhar, criar, brincar e ser você mesmo.<br>
      Convide quem quiser, combine encontros, faça enquetes, cante, ore ou só jogue conversa fora!<br>
      Corujão é liberdade digital de verdade. 🦉<br>
      <i>Sinta-se em casa, a sala é sua!</i>
    </span>`, "terminal-info");
    
    // Atualiza sala no Socket.IO
    if (socket && socket.connected) {
      socket.emit('trocar_sala', {
        usuario,
        salaAntiga: salaAtual,
        salaNova: novaSala
      });
    }
  }

  function processaComando(txt) {
    const comando = txt.trim();

    if (comando === '') {
      promptComando();
      return;
    }

    // COMANDOS AVANÇADOS
    if (comando.startsWith('/')) {
      // Comando com argumento (ex: /sala memes)
      if (comando.startsWith('/sala ')) {
        const novaSala = comando.split(' ')[1];
        salaAtual = novaSala || "geral";
        mensagemInspiradoraSala(salaAtual);
        carregarMensagensChat();
      } else if (comando.startsWith('/privado ')) {
        const partes = comando.split(' ');
        const nick = partes[1];
        const mensagem = partes.slice(2).join(' ');
        enviarMensagemPrivada(nick, mensagem);
      } else if (comando.startsWith('/memes ')) {
        const conteudo = comando.substring(7);
        appendLine(`Seu meme enviado: <b>${conteudo}</b>`, "terminal
