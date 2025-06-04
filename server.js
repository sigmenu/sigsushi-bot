const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const QRCode = require('qrcode');
const path = require('path');

class WebServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server);
        this.port = process.env.PORT || 3000;

        this.setupExpress();
        this.setupSocketIO();
    }

    setupExpress() {
        // Serve arquivos estáticos
        this.app.use(express.static(path.join(__dirname, 'public')));

        // Rota principal
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        // Rota de teste para gerar QR Code de exemplo
        this.app.get('/test-qr', async (req, res) => {
            try {
                const testQR = 'test-qr-code-' + Date.now();
                const qrImage = await QRCode.toDataURL(testQR, {
                    width: 300,
                    margin: 2,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                });
                
                // Envia QR Code para todos os clientes conectados
                this.io.emit('qr', qrImage);
                res.json({ success: true, message: 'QR Code de teste enviado' });
            } catch (error) {
                res.status(500).json({ error: 'Erro ao gerar QR Code de teste' });
            }
        });

        // Rota de teste para simular conexão
        this.app.get('/test-ready', (req, res) => {
            this.io.emit('ready');
            res.json({ success: true, message: 'Status "ready" enviado' });
        });
    }

    setupSocketIO() {
        this.io.on('connection', (socket) => {
            console.log('🌐 Cliente conectado à interface web');
            
            socket.on('disconnect', () => {
                console.log('🌐 Cliente desconectado da interface web');
            });
        });
    }

    start() {
        this.server.listen(this.port, () => {
            console.log(`🌐 Servidor web iniciado em: http://localhost:${this.port}`);
            console.log(`🧪 Teste QR Code: http://localhost:${this.port}/test-qr`);
            console.log(`🧪 Teste Ready: http://localhost:${this.port}/test-ready`);
        });
    }

    // Métodos para integração com o bot WhatsApp
    emitQR(qrData) {
        this.io.emit('qr', qrData);
    }

    emitReady() {
        this.io.emit('ready');
    }

    emitDisconnected(reason) {
        this.io.emit('disconnected', reason);
    }

    emitAuthFailure() {
        this.io.emit('auth_failure');
    }
}

// Se executado diretamente, inicia apenas o servidor
if (require.main === module) {
    const server = new WebServer();
    server.start();
    
    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Parando servidor...');
        process.exit(0);
    });
}

module.exports = WebServer;