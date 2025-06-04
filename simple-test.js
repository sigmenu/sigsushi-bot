// Teste simples apenas do Socket.IO e QR Code
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = 3004;

console.log('🧪 Teste simples iniciado...');

// Serve arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO
io.on('connection', (socket) => {
    console.log('🌐 Cliente conectado! Total:', io.engine.clientsCount);
    
    // Envia QR imediatamente quando cliente conecta
    setTimeout(async () => {
        try {
            const testData = 'Hello from test: ' + new Date().toISOString();
            const qrImage = await QRCode.toDataURL(testData, {
                width: 300,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
            
            console.log('📱 Enviando QR para cliente conectado...');
            socket.emit('qr', qrImage);
            
        } catch (error) {
            console.error('❌ Erro ao gerar QR:', error);
        }
    }, 1000);
    
    socket.on('disconnect', () => {
        console.log('🌐 Cliente desconectado! Total:', io.engine.clientsCount);
    });
});

server.listen(port, () => {
    console.log(`🧪 Teste simples em: http://localhost:${port}`);
    console.log('📝 Abra a URL acima no navegador para testar');
});

process.on('SIGINT', () => {
    console.log('\n🛑 Parando teste...');
    process.exit(0);
});