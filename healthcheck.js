const http = require('http'); 
http.createServer((req, res) => { 
    res.end('OK'); 
}).listen(3000, '127.0.0.1');
