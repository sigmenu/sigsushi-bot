const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const QRCode = require('qrcode');
const path = require('path');

// Configurações do bot - PERSONALIZAR PARA CADA CLIENTE
const CONFIG = {
    MENU_URL: 'https://sigmenu.com/delivery/restaurante',
    RESTAURANT_NAME: 'Nome do Restaurante',
    OPENING_HOURS: 'Segunda a Domingo: 11h às 23h',
    FOOD_EMOJI: '🍽️',
    WELCOME_MESSAGE: `Olá! {{FOOD_EMOJI}} Bem-vindo(a) ao *{{RESTAURANT_NAME}}*! 

Ficamos muito felizes em receber sua mensagem! 😊

Aqui está nosso cardápio digital completo com todos os pratos deliciosos que preparamos para você:

🍽️ *Cardápio Digital:* {{MENU_URL}}

📱 *Horário de Funcionamento:*
{{OPENING_HOURS}}

🚚 *Delivery disponível!*

Para fazer seu pedido, acesse nosso cardápio pelo link acima. Qualquer dúvida, nossa equipe está aqui para ajudar!

Obrigado por escolher o *{{RESTAURANT_NAME}}*! ❤️`
};

class SimpleBotServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server);
        this.port = process.env.PORT || 3000;
        
        this.setupExpress();
        this.setupWebServer();
        this.whatsappClient = null;
        this.processedMessages = new Set();
        this.clientCooldowns = new Map();
    }

    setupExpress() {
        this.app.use(express.static(path.join(__dirname, 'public')));
        
        // Rota para gerar QR de teste
        this.app.get('/test-qr', async (req, res) => {
            try {
                const qrData = 'WhatsApp-Test-' + Date.now();
                const qrImage = await QRCode.toDataURL(qrData, {
                    width: 300,
                    margin: 2,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                });
                
                this.io.emit('qr', qrImage);
                res.json({ success: true, message: 'QR Code de teste enviado' });
            } catch (error) {
                res.status(500).json({ error: 'Erro ao gerar QR Code' });
            }
        });

        // Rota para simular conexão
        this.app.get('/simulate-ready', (req, res) => {
            this.io.emit('ready');
            res.json({ success: true, message: 'Simulando conexão estabelecida' });
        });

        // Rota de debug
        this.app.get('/debug', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'debug.html'));
        });

        // Rota de status
        this.app.get('/status', (req, res) => {
            res.json({
                success: true,
                timestamp: new Date().toISOString(),
                whatsapp_connected: this.whatsappClient ? 'checking' : 'not_initialized',
                server_status: 'running',
                port: this.port
            });
        });
    }

    setupWebServer() {
        this.io.on('connection', (socket) => {
            console.log('🌐 Cliente conectado à interface web');
            
            // Envia mensagem inicial
            socket.emit('status', 'Interface web conectada - Execute o WhatsApp manualmente');
            
            socket.on('disconnect', () => {
                console.log('🌐 Cliente desconectado da interface web');
            });
        });

        this.server.listen(this.port, () => {
            console.log(`🌐 Interface web disponível em: http://localhost:${this.port}`);
            console.log(`🧪 Teste QR: http://localhost:${this.port}/test-qr`);
            console.log(`🧪 Simular Ready: http://localhost:${this.port}/simulate-ready`);
        });
    }

    async initializeWhatsApp() {
        try {
            console.log('🔄 Tentando inicializar WhatsApp...');
            
            // Importa whatsapp-web.js dinamicamente
            const { Client, LocalAuth } = require('whatsapp-web.js');
            
            this.whatsappClient = new Client({
                authStrategy: new LocalAuth(),
                puppeteer: {
                    headless: true,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--single-process',
                        '--disable-gpu',
                        '--disable-web-security'
                    ]
                }
            });

            this.setupWhatsAppEvents();
            await this.whatsappClient.initialize();
            
        } catch (error) {
            console.error('❌ Erro ao inicializar WhatsApp:', error.message);
            console.log('💡 Executando apenas o servidor web...');
            console.log('💡 Para usar WhatsApp, instale as dependências do sistema:');
            console.log('   sudo apt install -y libnss3-dev libxss1 libatk-bridge2.0-0 libdrm2 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libxkbcommon0 libgtk-3-0');
        }
    }

    setupWhatsAppEvents() {
        if (!this.whatsappClient) return;

        this.whatsappClient.on('qr', async (qr) => {
            console.log('📱 QR Code gerado para WhatsApp');
            
            try {
                const qrImage = await QRCode.toDataURL(qr, {
                    width: 300,
                    margin: 2,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                });
                
                this.io.emit('qr', qrImage);
                console.log('🌐 QR Code enviado para interface web');
            } catch (error) {
                console.error('❌ Erro ao gerar QR Code:', error);
            }
        });

        this.whatsappClient.on('ready', () => {
            console.log('✅ WhatsApp conectado e funcionando!');
            this.io.emit('ready');
        });

        this.whatsappClient.on('message', async (message) => {
            await this.handleMessage(message);
        });

        this.whatsappClient.on('auth_failure', () => {
            console.error('❌ Falha na autenticação WhatsApp');
            this.io.emit('auth_failure');
        });

        this.whatsappClient.on('disconnected', (reason) => {
            console.log('🔌 WhatsApp desconectado:', reason);
            this.io.emit('disconnected', reason);
        });
    }

    async handleMessage(message) {
        try {
            if (message.fromMe) return;
            
            const chat = await message.getChat();
            if (chat.isGroup) return;
            
            if (this.processedMessages.has(message.id._serialized)) return;
            this.processedMessages.add(message.id._serialized);
            
            const clientId = message.from;
            const now = Date.now();
            const lastMessageTime = this.clientCooldowns.get(clientId);
            const cooldownTime = 12 * 60 * 60 * 1000;
            
            if (lastMessageTime && (now - lastMessageTime) < cooldownTime) {
                return;
            }
            
            const contact = await message.getContact();
            console.log(`📩 Mensagem de ${contact.name || contact.pushname || 'Cliente'}`);
            
            await this.sendWelcomeMessage(message);
            this.clientCooldowns.set(clientId, now);
            
        } catch (error) {
            console.error('❌ Erro ao processar mensagem:', error);
        }
    }

    async sendWelcomeMessage(message) {
        try {
            let welcomeText = CONFIG.WELCOME_MESSAGE
                .replace(/{{MENU_URL}}/g, CONFIG.MENU_URL)
                .replace(/{{RESTAURANT_NAME}}/g, CONFIG.RESTAURANT_NAME)
                .replace(/{{OPENING_HOURS}}/g, CONFIG.OPENING_HOURS)
                .replace(/{{FOOD_EMOJI}}/g, CONFIG.FOOD_EMOJI);

            await message.reply(welcomeText);
            
            const contact = await message.getContact();
            console.log(`✅ Resposta enviada para ${contact.name || contact.pushname || 'Cliente'}`);
            
        } catch (error) {
            console.error('❌ Erro ao enviar mensagem:', error);
        }
    }

    start() {
        console.log('🚀 Iniciando SigSushi Bot...');
        console.log(`🌐 Interface web: http://localhost:${this.port}`);
        
        // Tenta inicializar WhatsApp após 2 segundos
        setTimeout(() => {
            this.initializeWhatsApp();
        }, 2000);
    }

    async stop() {
        console.log('🛑 Parando bot...');
        if (this.whatsappClient) {
            await this.whatsappClient.destroy();
        }
        this.server.close();
    }
}

// Inicialização
const bot = new SimpleBotServer();
bot.start();

// Tratamento de sinais
process.on('SIGINT', async () => {
    console.log('\n🛑 Recebido sinal de parada...');
    await bot.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Recebido sinal de término...');
    await bot.stop();
    process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Erro não tratado:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Exceção não capturada:', error);
    process.exit(1);
});