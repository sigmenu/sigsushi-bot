const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const QRCode = require('qrcode');
const path = require('path');

// Configurações do bot - PERSONALIZAR PARA CADA CLIENTE
const CONFIG = {
    // SUBSTITUIR: Link do cardápio do cliente
    MENU_URL: 'https://sigmenu.com/delivery/restaurante',
    
    // SUBSTITUIR: Nome do restaurante
    RESTAURANT_NAME: 'Nome do Restaurante',
    
    // SUBSTITUIR: Horário de funcionamento
    OPENING_HOURS: 'Segunda a Domingo: 11h às 23h',
    
    // SUBSTITUIR: Emoji do tipo de comida
    FOOD_EMOJI: '🍽️',
    
    // Mensagem de boas-vindas (será montada automaticamente)
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

class RestaurantBot {
    constructor() {
        // Configura servidor Express
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server);
        this.port = process.env.PORT || 3002;

        // Configura Express
        this.app.use(express.static(path.join(__dirname, 'public')));
        
        // Adiciona rotas para debug
        this.setupRoutes();

        this.setupWebServer();
        this.processedMessages = new Set(); // Para evitar mensagens duplicadas
        this.clientCooldowns = new Map(); // Para controlar cooldown de 12h por cliente
        this.currentQR = null; // Armazena o QR atual para novos clientes
        this.eventsConfigured = false; // Controla se eventos já foram configurados
        
        // Cria o primeiro cliente
        this.createWhatsAppClient();
    }

    createWhatsAppClient() {
        console.log('🔧 Criando novo cliente WhatsApp...');
        
        try {
            this.client = new Client({
                authStrategy: new LocalAuth({
                    dataPath: './session_data'
                }),
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
                        '--disable-web-security',
                        '--disable-features=VizDisplayCompositor',
                        '--disable-background-timer-throttling',
                        '--disable-backgrounding-occluded-windows',
                        '--disable-renderer-backgrounding',
                        '--disable-extensions',
                        '--disable-plugins'
                    ],
                    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                    timeout: 60000
                },
                restartOnAuthFail: true,
                takeoverOnConflict: false,
                takeoverTimeoutMs: 0
            });
            
            console.log('✅ Cliente WhatsApp criado com sucesso');
            // Só configura eventos na primeira criação
            if (!this.eventsConfigured) {
                this.setupEventListeners();
                this.eventsConfigured = true;
            }
            return true;
            
        } catch (error) {
            console.error('❌ Erro ao criar cliente WhatsApp:', error);
            
            // Fallback: criar um cliente mais simples
            console.log('🔧 Tentando configuração simplificada...');
            try {
                this.client = new Client({
                    authStrategy: new LocalAuth(),
                    puppeteer: {
                        headless: true,
                        args: ['--no-sandbox', '--disable-setuid-sandbox']
                    }
                });
                console.log('✅ Cliente WhatsApp simplificado criado');
                // Só configura eventos na primeira criação
                if (!this.eventsConfigured) {
                    this.setupEventListeners();
                    this.eventsConfigured = true;
                }
                return true;
            } catch (fallbackError) {
                console.error('❌ Erro crítico ao criar cliente:', fallbackError);
                return false;
            }
        }
    }

    setupRoutes() {
        // Rota para página de debug
        this.app.get('/debug', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'debug.html'));
        });

        // Rota para página de administração
        this.app.get('/admin', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'admin.html'));
        });

        // Rota para dashboard
        this.app.get('/dashboard', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
        });

        // Rota para testar QR Code
        this.app.get('/test-qr', (req, res) => {
            res.json({ 
                message: 'QR Code de teste solicitado',
                timestamp: new Date().toISOString(),
                status: 'success'
            });
        });

        // Rota para simular bot conectado
        this.app.get('/simulate-ready', (req, res) => {
            this.io.emit('ready');
            res.json({ 
                message: 'Bot simulado como conectado',
                timestamp: new Date().toISOString(),
                status: 'success'
            });
        });

        // Rota para status da API
        this.app.get('/api/status', (req, res) => {
            res.json({
                status: 'online',
                timestamp: new Date().toISOString(),
                whatsapp: this.client ? 'initialized' : 'not_initialized',
                hasQR: !!this.currentQR,
                eventsConfigured: this.eventsConfigured
            });
        });

        // Rota para forçar regeneração do QR Code
        this.app.post('/api/regenerate-qr', async (req, res) => {
            console.log('🔄 QR regeneração forçada via API...');
            
            try {
                const success = await this.recreateWhatsAppClient();
                
                if (success) {
                    res.json({ 
                        success: true, 
                        message: 'QR Code regeneração iniciada' 
                    });
                } else {
                    res.status(500).json({ 
                        success: false, 
                        message: 'Erro ao recriar cliente WhatsApp' 
                    });
                }
                
            } catch (error) {
                console.error('❌ Erro ao forçar regeneração:', error);
                res.status(500).json({ 
                    success: false, 
                    message: 'Erro interno ao regenerar QR' 
                });
            }
        });

        // API para login de administração (temporário - usar autenticação real em produção)
        this.app.post('/api/login', express.json(), (req, res) => {
            const { username, password } = req.body;
            
            // Credenciais básicas (ALTERAR EM PRODUÇÃO)
            if (username === 'admin' && password === 'admin123') {
                res.json({ 
                    success: true, 
                    user: { username: 'admin' },
                    message: 'Login realizado com sucesso'
                });
            } else {
                res.status(401).json({ 
                    success: false, 
                    message: 'Credenciais inválidas' 
                });
            }
        });

        // API temporária para restaurantes (para funcionamento da página admin)
        this.app.get('/api/restaurants', (req, res) => {
            res.json([]);
        });

        this.app.post('/api/restaurants', express.json(), (req, res) => {
            res.json({ success: true, message: 'Funcionalidade em desenvolvimento' });
        });

        this.app.put('/api/restaurants/:id', express.json(), (req, res) => {
            res.json({ success: true, message: 'Funcionalidade em desenvolvimento' });
        });

        this.app.delete('/api/restaurants/:id', (req, res) => {
            res.json({ success: true, message: 'Funcionalidade em desenvolvimento' });
        });
    }

    async recreateWhatsAppClient() {
        console.log('🔄 Recriando cliente WhatsApp...');
        
        try {
            // Limpa QR atual
            this.currentQR = null;
            
            // Destrói cliente atual se existir
            if (this.client) {
                try {
                    await this.client.destroy();
                    console.log('🗑️ Cliente anterior destruído');
                } catch (error) {
                    console.log('⚠️ Cliente anterior já estava destruído');
                }
            }
            
            // Aguarda um pouco antes de recriar
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Cria novo cliente
            const success = this.createWhatsAppClient();
            
            if (success) {
                // Inicializa o novo cliente
                console.log('🚀 Inicializando novo cliente...');
                this.client.initialize();
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error('❌ Erro ao recriar cliente WhatsApp:', error);
            return false;
        }
    }

    setupWebServer() {
        // Socket.IO para atualizações em tempo real
        this.io.on('connection', (socket) => {
            console.log('🌐 Cliente conectado à interface web. Total de clientes:', this.io.engine.clientsCount);
            
            // Se já temos um QR Code disponível, envia para o novo cliente
            if (this.currentQR) {
                console.log('📱 Enviando QR existente para novo cliente...');
                socket.emit('qr', this.currentQR);
            }
            
            socket.on('disconnect', () => {
                console.log('🌐 Cliente desconectado da interface web. Total de clientes:', this.io.engine.clientsCount);
            });
        });

        // Inicia o servidor web
        this.server.listen(this.port, () => {
            console.log(`🌐 Interface web disponível em: http://localhost:${this.port}`);
            console.log(`🐛 Debug disponível em: http://localhost:${this.port}/debug`);
            console.log(`👨‍💼 Admin disponível em: http://localhost:${this.port}/admin`);
        });
    }


    setupEventListeners() {
        // Evento quando o QR Code é gerado
        this.client.on('qr', async (qr) => {
            console.log('📱 QR Code gerado - Disponível na interface web');
            console.log('🌐 Acesse: http://localhost:' + this.port);
            console.log('🔍 Debug: QR String length:', qr.length);
            
            // QR Code removido do terminal para evitar conflitos
            // Use apenas a interface web: http://localhost:${this.port}
            
            // Gera QR Code como imagem base64 para a web
            try {
                const qrImage = await QRCode.toDataURL(qr, {
                    width: 300,
                    margin: 2,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                });
                
                console.log('✅ QR Code convertido para base64 com sucesso');
                
                // Armazena o QR atual
                this.currentQR = qrImage;
                
                // Envia QR Code para todos os clientes conectados
                this.io.emit('qr', qrImage);
                console.log('📡 QR Code enviado via Socket.IO para', this.io.engine.clientsCount, 'clientes conectados');
            } catch (error) {
                console.error('❌ Erro ao gerar QR Code para web:', error);
            }
        });

        // Evento quando está pronto
        this.client.on('ready', () => {
            console.log('✅ Bot conectado e funcionando!');
            console.log(`🤖 ${CONFIG.RESTAURANT_NAME} - Chatbot iniciado com sucesso!`);
            console.log('📞 Aguardando mensagens...');
            
            // Limpa QR atual pois já está conectado
            this.currentQR = null;
            
            // Notifica interface web
            this.io.emit('ready');
        });

        // Evento quando recebe uma mensagem
        this.client.on('message', async (message) => {
            await this.handleMessage(message);
        });

        // Evento de erro
        this.client.on('auth_failure', () => {
            console.error('❌ Falha na autenticação. Gerando novo QR...');
            
            // Limpa QR atual
            this.currentQR = null;
            
            // Notifica interface web
            this.io.emit('auth_failure');
            
            // Recria cliente simples
            setTimeout(() => {
                this.eventsConfigured = false;
                if (this.createWhatsAppClient()) {
                    this.client.initialize();
                }
            }, 2000);
        });

        // Evento de desconexão
        this.client.on('disconnected', (reason) => {
            console.log('🔌 Desconectado:', reason);
            console.log('🔄 Preparando para gerar novo QR...');
            
            // Limpa QR atual
            this.currentQR = null;
            
            // Notifica interface web
            this.io.emit('disconnected', reason);
            
            // Força destruição e recriação completa
            setTimeout(async () => {
                console.log('🔄 Destruindo cliente atual...');
                
                try {
                    if (this.client) {
                        await this.client.destroy();
                    }
                } catch (error) {
                    console.log('⚠️ Cliente já estava destruído');
                }
                
                // Aguarda um pouco
                setTimeout(() => {
                    console.log('🆕 Criando cliente completamente novo...');
                    
                    // Marca eventos como não configurados para recriar tudo
                    this.eventsConfigured = false;
                    
                    // Cria novo cliente
                    if (this.createWhatsAppClient()) {
                        console.log('🚀 Inicializando novo cliente...');
                        this.client.initialize();
                    }
                }, 2000);
                
            }, 3000);
        });

        // Evento de mudança de estado
        this.client.on('change_state', (state) => {
            console.log('🔄 Estado mudou para:', state);
        });

        // Evento de loading screen
        this.client.on('loading_screen', (percent, message) => {
            console.log(`⏳ Carregando: ${percent}% - ${message}`);
        });

        // Eventos de debug adicicionais
        this.client.on('authenticated', () => {
            console.log('🔐 Cliente autenticado com sucesso');
        });

        this.client.on('authentication_failure', (msg) => {
            console.error('❌ Falha na autenticação:', msg);
        });

        this.client.on('remote_session_saved', () => {
            console.log('💾 Sessão remota salva');
        });

        // Evento quando logout é detectado
        this.client.on('logout', () => {
            console.log('🚪 Logout detectado - Sessão removida');
            console.log('🔄 Forçando recriação do cliente...');
            
            // Limpa QR atual
            this.currentQR = null;
            
            // Notifica interface web
            this.io.emit('logout');
            
            // Força recriação imediata
            setTimeout(() => {
                this.eventsConfigured = false;
                if (this.createWhatsAppClient()) {
                    this.client.initialize();
                }
            }, 1000);
        });
    }

    async handleMessage(message) {
        try {
            // Evita responder mensagens próprias
            if (message.fromMe) return;

            // Evita responder mensagens de grupos (opcional)
            const chat = await message.getChat();
            if (chat.isGroup) return;

            // Evita processar a mesma mensagem duas vezes
            if (this.processedMessages.has(message.id._serialized)) return;
            this.processedMessages.add(message.id._serialized);

            // Verifica cooldown de 12 horas por cliente
            const clientId = message.from;
            const now = Date.now();
            const lastMessageTime = this.clientCooldowns.get(clientId);
            const cooldownTime = 12 * 60 * 60 * 1000; // 12 horas em milissegundos

            // Se já enviou mensagem há menos de 12h, não responde
            if (lastMessageTime && (now - lastMessageTime) < cooldownTime) {
                const contact = await message.getContact();
                const remainingTime = Math.ceil((cooldownTime - (now - lastMessageTime)) / (60 * 60 * 1000));
                console.log(`⏰ Cliente ${contact.name || contact.pushname || 'Desconhecido'} em cooldown. Restam ${remainingTime}h para nova resposta automática.`);
                return;
            }

            // Log da mensagem recebida
            const contact = await message.getContact();
            console.log(`📩 Mensagem de ${contact.name || contact.pushname || 'Cliente'}: ${message.body}`);

            // Envia a mensagem de boas-vindas
            await this.sendWelcomeMessage(message);

            // Registra o tempo da resposta para o cliente
            this.clientCooldowns.set(clientId, now);
            console.log(`⏰ Cooldown de 12h iniciado para ${contact.name || contact.pushname || 'Cliente'}`);

        } catch (error) {
            console.error('❌ Erro ao processar mensagem:', error);
        }
    }

    async sendWelcomeMessage(message) {
        try {
            // Personaliza a mensagem substituindo as variáveis
            let welcomeText = CONFIG.WELCOME_MESSAGE
                .replace(/{{MENU_URL}}/g, CONFIG.MENU_URL)
                .replace(/{{RESTAURANT_NAME}}/g, CONFIG.RESTAURANT_NAME)
                .replace(/{{OPENING_HOURS}}/g, CONFIG.OPENING_HOURS)
                .replace(/{{FOOD_EMOJI}}/g, CONFIG.FOOD_EMOJI);

            // Envia a mensagem
            await message.reply(welcomeText);

            // Log da resposta enviada
            const contact = await message.getContact();
            console.log(`✅ Resposta enviada para ${contact.name || contact.pushname || 'Cliente'}`);

        } catch (error) {
            console.error('❌ Erro ao enviar mensagem de boas-vindas:', error);
        }
    }

    // Inicia o bot
    start() {
        console.log('🚀 Iniciando o bot...');
        console.log(`🌐 Interface web será disponível em: http://localhost:${this.port}`);
        console.log('🔄 Inicializando cliente WhatsApp...');
        
        try {
            this.client.initialize();
            console.log('✅ Cliente WhatsApp inicializado com sucesso');
        } catch (error) {
            console.error('❌ Erro ao inicializar cliente WhatsApp:', error);
        }
    }

    // Para o bot
    async stop() {
        console.log('🛑 Parando o bot...');
        
        try {
            // Para o cliente WhatsApp se existir e estiver inicializado
            if (this.client && this.client.pupPage) {
                console.log('🔌 Fechando cliente WhatsApp...');
                await this.client.destroy();
            }
        } catch (error) {
            console.log('⚠️ Cliente WhatsApp já estava desconectado');
        }
        
        try {
            // Para o servidor web
            if (this.server) {
                console.log('🌐 Fechando servidor web...');
                this.server.close();
            }
        } catch (error) {
            console.log('⚠️ Servidor web já estava fechado');
        }
        
        console.log('✅ Bot parado com sucesso');
    }
}

// Inicialização do bot
const bot = new RestaurantBot();

// Inicia o bot
bot.start();

// Tratamento de sinais para parar o bot graciosamente
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

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Erro não tratado:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Exceção não capturada:', error);
    process.exit(1);
});