// Servidor de teste simples sem dependências do WhatsApp
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const QRCode = require('qrcode');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = 3000;

// Serve arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Socket.IO
io.on('connection', (socket) => {
    console.log('🌐 Cliente conectado');
    
    // Simula geração de QR Code após 2 segundos
    setTimeout(async () => {
        try {
            const qrData = 'WhatsApp-QR-Code-' + Date.now();
            const qrImage = await QRCode.toDataURL(qrData, {
                width: 300,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
            
            console.log('📱 Enviando QR Code para cliente');
            socket.emit('qr', qrImage);
        } catch (error) {
            console.error('❌ Erro ao gerar QR:', error);
        }
    }, 2000);
    
    socket.on('disconnect', () => {
        console.log('🌐 Cliente desconectado');
    });
});

server.listen(port, () => {
    console.log(`🌐 Servidor teste rodando em: http://localhost:${port}`);
    console.log('📱 QR Code será gerado automaticamente em 2 segundos após conexão');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Parando servidor...');
    process.exit(0);
});