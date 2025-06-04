// Script de teste para verificar se o QR Code está sendo gerado corretamente
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const QRCode = require('qrcode');
const path = require('path');

console.log('🧪 Teste de QR Code iniciado...');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = 3003;

// Serve arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'test.html'));
});

// Rota para página original
app.get('/index', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota para gerar QR de teste
app.get('/test-qr', async (req, res) => {
    try {
        console.log('🧪 Gerando QR Code de teste...');
        const testData = 'test-qr-' + Date.now();
        
        const qrImage = await QRCode.toDataURL(testData, {
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });
        
        console.log('✅ QR Code de teste gerado com sucesso');
        
        // Envia para todos os clientes conectados
        io.emit('qr', qrImage);
        console.log('📡 QR Code enviado para', io.engine.clientsCount, 'clientes conectados');
        
        res.json({ 
            success: true, 
            message: 'QR Code de teste gerado e enviado',
            clients: io.engine.clientsCount
        });
    } catch (error) {
        console.error('❌ Erro ao gerar QR de teste:', error);
        res.status(500).json({ error: error.message });
    }
});

// Socket.IO
io.on('connection', (socket) => {
    console.log('🌐 Cliente conectado ao teste. Total:', io.engine.clientsCount);
    
    // Envia QR imediatamente quando cliente conecta
    setTimeout(async () => {
        try {
            console.log('🧪 Gerando QR para cliente conectado...');
            const qrImage = await QRCode.toDataURL('client-connect-' + Date.now(), {
                width: 300,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
            socket.emit('qr', qrImage);
            console.log('✅ QR enviado para cliente conectado');
        } catch (error) {
            console.error('❌ Erro ao gerar QR para cliente:', error);
        }
    }, 500);
    
    socket.on('disconnect', () => {
        console.log('🌐 Cliente desconectado do teste. Total:', io.engine.clientsCount);
    });
});

// Inicia servidor
server.listen(port, () => {
    console.log(`🧪 Servidor de teste disponível em: http://localhost:${port}`);
    console.log(`🧪 Teste QR Code: http://localhost:${port}/test-qr`);
    console.log('🔗 QR será gerado automaticamente quando cliente conectar');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Parando teste...');
    process.exit(0);
});