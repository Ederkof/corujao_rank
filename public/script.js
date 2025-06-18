// Conexão WebSocket
const socket = io();

document.getElementById("prompt-row").addEventListener("submit", (e) => {
  e.preventDefault();
  const msgInput = document.getElementById("msg");
  const mensagem = {
    usuario: "ederkof",  // Substitua por um nome de usuário real
    texto: msgInput.value,
    data: new Date().toLocaleTimeString()
  };

  // Envia via Socket.io (tempo real)
  socket.emit('chat message', mensagem);
  
  // Opcional: Envia também via HTTP (backup)
  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mensagem)
  });

  msgInput.value = "";  // Limpa o campo
});

// Recebe mensagens de outros usuários
socket.on('chat message', (msg) => {
  const chatContainer = document.getElementById("chat-container"); // Ajuste o ID
  chatContainer.innerHTML += `
    <div class="mensagem">
      <strong>${msg.usuario}</strong> (${msg.data}): ${msg.texto}
    </div>
  `;
});
