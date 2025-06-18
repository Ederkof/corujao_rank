const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Modo emergência ativo');
});
server.listen(3000, 'localhost', () => {
    console.log('Operando com RAM mínima');
});
