const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

// Servir arquivos estáticos da pasta 'public'
app.use(express.static('public'));

// Rota secreta/admin
app.get('/admin', (req, res) => {
  res.send('Rota secreta do Corujão!');
});

app.listen(PORT, () => {
  console.log(`Servidor Corujão rodando na porta ${PORT}`);
});
