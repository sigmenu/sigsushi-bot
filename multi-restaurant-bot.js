const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const QRCode = require('qrcode');
const path = require('path');
const Database = require('./json-database');

class MultiRestaurantBot {
    constructor() {
        this.db = new Database();
        this.restaurants = new Map(); // Map<restaurantId, BotInstance>
        this.setupWebServer();
        this.loadRestaurants();
    }

    setupWebServer() {
        this.app = express();
        this.server = http.createServer(this.app);
        
        // CORS Configuration para VPS
        const cors = require('cors');
        this.app.use(cors({
            origin: '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            credentials: true
        }));
        
        this.io = socketIo(this.server, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST'],
                credentials: true
            },
            allowEIO3: true,
            transports: ['websocket', 'polling']
        });
        
        this.port = process.env.PORT || 3000;

        console.log('🔥 [SERVER DEBUG] Setting up web server...');
        console.log(`🔥 [SERVER DEBUG] Port: ${this.port}`);
        console.log(`🔥 [SERVER DEBUG] Environment: ${process.env.NODE_ENV || 'development'}`);

        // Middleware
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        this.app.use(express.static(path.join(__dirname, 'public')));

        // Log de todas as requests
        this.app.use((req, res, next) => {
            console.log(`🔥 [HTTP] ${req.method} ${req.url} - ${req.ip}`);
            next();
        });

        this.setupRoutes();
        this.setupWebSocket();

        this.server.listen(this.port, '0.0.0.0', () => {
            console.log(`🌐 Sistema Multi-Restaurante ativo em: http://0.0.0.0:${this.port}`);
            console.log(`👤 Admin: http://0.0.0.0:${this.port}/admin`);
            console.log(`🔥 [SERVER DEBUG] Server bound to all interfaces (0.0.0.0)`);
            console.log(`🔥 [SERVER DEBUG] Test routes available:`);
            console.log(`   - GET /test-qr/[restaurantId] - Force QR generation`);
            console.log(`   - GET /test-websocket - Test WebSocket`);
            console.log(`   - GET /debug-full - Full debug info`);
        });

        this.server.on('error', (error) => {
            console.error('🔥 [SERVER ERROR]', error);
        });
    }

    setupRoutes() {
        // Página principal - Dashboard
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
        });

        // Página de admin
        this.app.get('/admin', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'admin.html'));
        });

        // API Routes
        this.app.post('/api/login', async (req, res) => {
            try {
                const { username, password } = req.body;
                const user = await this.db.authenticateUser(username, password);
                
                if (user) {
                    res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
                } else {
                    res.status(401).json({ success: false, message: 'Credenciais inválidas' });
                }
            } catch (error) {
                res.status(500).json({ success: false, message: 'Erro interno do servidor' });
            }
        });

        // CRUD Restaurantes
        this.app.get('/api/restaurants', async (req, res) => {
            try {
                const restaurants = await this.db.getAllRestaurants();
                res.json(restaurants);
            } catch (error) {
                res.status(500).json({ error: 'Erro ao buscar restaurantes' });
            }
        });

        this.app.post('/api/restaurants', async (req, res) => {
            try {
                const restaurant = await this.db.createRestaurant(req.body);
                res.json(restaurant);
            } catch (error) {
                res.status(500).json({ error: 'Erro ao criar restaurante' });
            }
        });

        this.app.put('/api/restaurants/:id', async (req, res) => {
            try {
                await this.db.updateRestaurant(req.params.id, req.body);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: 'Erro ao atualizar restaurante' });
            }
        });

        this.app.delete('/api/restaurants/:id', async (req, res) => {
            try {
                await this.stopRestaurantBot(req.params.id);
                await this.db.deleteRestaurant(req.params.id);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: 'Erro ao deletar restaurante' });
            }
        });

        // Controle de bots
        this.app.post('/api/restaurants/:id/start', async (req, res) => {
            try {
                await this.startRestaurantBot(req.params.id);
                res.json({ success: true, message: 'Bot iniciado' });
            } catch (error) {
                res.status(500).json({ error: 'Erro ao iniciar bot' });
            }
        });

        this.app.post('/api/restaurants/:id/stop', async (req, res) => {
            try {
                await this.stopRestaurantBot(req.params.id);
                res.json({ success: true, message: 'Bot parado' });
            } catch (error) {
                res.status(500).json({ error: 'Erro ao parar bot' });
            }
        });

        // Status dos bots
        this.app.get('/api/status', (req, res) => {
            const status = {};
            this.restaurants.forEach((bot, id) => {
                status[id] = {
                    connected: bot.client.info ? true : false,
                    state: bot.state || 'unknown'
                };
            });
            res.json(status);
        });

        // ROTA DE TESTE PARA FORÇAR GERAÇÃO DE QR CODE
        this.app.get('/test-qr/:restaurantId?', async (req, res) => {
            console.log('🔥 [TEST QR] Test QR route called');
            const restaurantId = req.params.restaurantId || 'test-restaurant';
            
            try {
                console.log(`🔥 [TEST QR] Generating test QR for restaurant: ${restaurantId}`);
                
                // Gera um QR de teste
                const testQRString = `https://web.whatsapp.com/qr-test-${Date.now()}`;
                const testQRImage = await (require('qrcode')).toDataURL(testQRString, {
                    width: 300,
                    margin: 2,
                    errorCorrectionLevel: 'M'
                });
                
                console.log(`🔥 [TEST QR] Test QR generated, length: ${testQRImage.length}`);
                
                const testPayload = {
                    restaurantId: restaurantId,
                    qrData: testQRImage,
                    timestamp: Date.now(),
                    debug: 'TEST_QR_MANUAL',
                    test: true
                };
                
                // Emite para todos os clientes
                console.log(`🔥 [TEST QR] Emitting to ${this.io.engine.clientsCount} clients`);
                this.io.emit('qr', testPayload);
                this.io.emit('qr_debug', {
                    message: 'Test QR generated manually',
                    timestamp: Date.now(),
                    clientsCount: this.io.engine.clientsCount
                });
                
                res.json({
                    success: true,
                    message: 'Test QR generated and emitted',
                    restaurantId: restaurantId,
                    qrLength: testQRImage.length,
                    clientsNotified: this.io.engine.clientsCount,
                    timestamp: Date.now()
                });
                
            } catch (error) {
                console.error('🔥 [TEST QR ERROR]', error);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    stack: error.stack
                });
            }
        });

        // ROTA PARA TESTAR WEBSOCKET
        this.app.get('/test-websocket', (req, res) => {
            console.log('🔥 [TEST WS] Testing WebSocket connectivity');
            
            const testData = {
                message: 'WebSocket test from server',
                timestamp: Date.now(),
                clientsCount: this.io.engine.clientsCount
            };
            
            this.io.emit('websocket_test', testData);
            
            res.json({
                success: true,
                message: 'WebSocket test sent',
                data: testData
            });
        });

        // ROTA PARA DEBUG COMPLETO
        this.app.get('/debug-full', (req, res) => {
            const debug = {
                server: {
                    port: this.port,
                    clients: this.io.engine.clientsCount,
                    restaurants: this.restaurants.size
                },
                restaurants: {},
                environment: {
                    nodeVersion: process.version,
                    platform: process.platform,
                    uptime: process.uptime(),
                    memory: process.memoryUsage()
                }
            };
            
            this.restaurants.forEach((bot, id) => {
                debug.restaurants[id] = {
                    state: bot.state,
                    connected: bot.client.info ? true : false,
                    name: bot.restaurant.name
                };
            });
            
            res.json(debug);
        });
    }

    setupWebSocket() {
        this.io.on('connection', (socket) => {
            console.log('🔥 [WS DEBUG 1] Cliente conectado ao dashboard');
            console.log(`🔥 [WS DEBUG 2] Total clients: ${this.io.engine.clientsCount}`);
            console.log(`🔥 [WS DEBUG 3] Socket ID: ${socket.id}`);
            console.log(`🔥 [WS DEBUG 4] Client IP: ${socket.handshake.address}`);
            console.log(`🔥 [WS DEBUG 5] Client headers:`, socket.handshake.headers);

            // Envia confirmação de conexão
            socket.emit('connection_confirmed', {
                message: 'WebSocket connected successfully',
                socketId: socket.id,
                timestamp: Date.now(),
                serverTime: new Date().toISOString()
            });

            socket.on('subscribe_restaurant', (restaurantId) => {
                socket.join(`restaurant_${restaurantId}`);
                console.log(`🔥 [WS DEBUG 6] Cliente inscrito no restaurante: ${restaurantId}`);
                
                // Envia status atual do restaurante quando cliente se inscreve
                const botInstance = this.restaurants.get(restaurantId);
                if (botInstance && botInstance.state === 'qr_ready') {
                    console.log(`🔥 [WS DEBUG 7] Reenviando QR para cliente recém conectado`);
                    // Se há QR disponível, reenviar
                    socket.emit('qr_status', {
                        restaurantId: restaurantId,
                        state: botInstance.state,
                        message: 'QR available for reconnected client'
                    });
                }
                
                // Confirma inscrição
                socket.emit('subscription_confirmed', {
                    restaurantId: restaurantId,
                    timestamp: Date.now()
                });
            });

            // Eventos de debug para frontend
            socket.on('ping_test', (data) => {
                console.log(`🔥 [WS DEBUG 8] Ping recebido:`, data);
                socket.emit('pong_test', {
                    received: data,
                    timestamp: Date.now(),
                    message: 'Pong from server'
                });
            });

            socket.on('disconnect', (reason) => {
                console.log(`🔥 [WS DEBUG 9] Cliente desconectado: ${reason}`);
                console.log(`🔥 [WS DEBUG 10] Remaining clients: ${this.io.engine.clientsCount - 1}`);
            });

            socket.on('error', (error) => {
                console.error(`🔥 [WS DEBUG ERROR] Socket error:`, error);
            });
        });

        // Log de eventos do Socket.IO
        this.io.engine.on('connection_error', (err) => {
            console.error('🔥 [WS DEBUG ERROR] Connection error:', err);
        });
    }

    async loadRestaurants() {
        try {
            const restaurants = await this.db.getAllRestaurants();
            console.log(`📋 Carregados ${restaurants.length} restaurantes`);
            
            // Auto-start restaurantes que estavam ativos
            for (const restaurant of restaurants) {
                if (restaurant.session_active) {
                    console.log(`🔄 Auto-iniciando bot: ${restaurant.name}`);
                    await this.startRestaurantBot(restaurant.id);
                }
            }
        } catch (error) {
            console.error('❌ Erro ao carregar restaurantes:', error);
        }
    }

    async startRestaurantBot(restaurantId) {
        try {
            if (this.restaurants.has(restaurantId)) {
                console.log(`⚠️ Bot já está rodando para restaurante: ${restaurantId}`);
                return;
            }

            const restaurant = await this.db.getRestaurantById(restaurantId);
            if (!restaurant) {
                throw new Error('Restaurante não encontrado');
            }

            console.log(`🚀 Iniciando bot para: ${restaurant.name}`);

            const botInstance = new RestaurantBotInstance(restaurant, this.db, this.io);
            this.restaurants.set(restaurantId, botInstance);

            await botInstance.start();
            await this.db.updateSessionStatus(restaurantId, true);

            console.log(`✅ Bot iniciado para: ${restaurant.name}`);
        } catch (error) {
            console.error(`❌ Erro ao iniciar bot para ${restaurantId}:`, error);
            throw error;
        }
    }

    async stopRestaurantBot(restaurantId) {
        try {
            const botInstance = this.restaurants.get(restaurantId);
            if (botInstance) {
                await botInstance.stop();
                this.restaurants.delete(restaurantId);
                await this.db.updateSessionStatus(restaurantId, false);
                console.log(`🛑 Bot parado para restaurante: ${restaurantId}`);
            }
        } catch (error) {
            console.error(`❌ Erro ao parar bot para ${restaurantId}:`, error);
            throw error;
        }
    }

    async shutdown() {
        console.log('🛑 Parando todos os bots...');
        
        for (const [restaurantId, botInstance] of this.restaurants) {
            try {
                await botInstance.stop();
                await this.db.updateSessionStatus(restaurantId, false);
            } catch (error) {
                console.error(`❌ Erro ao parar bot ${restaurantId}:`, error);
            }
        }

        this.db.close();
        this.server.close();
    }
}

class RestaurantBotInstance {
    constructor(restaurant, db, io) {
        this.restaurant = restaurant;
        this.db = db;
        this.io = io;
        this.client = null;
        this.state = 'stopped';
        this.processedMessages = new Set();
        this.setupClient();
    }

    setupClient() {
        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: `./session_data/restaurant_${this.restaurant.id}`
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
                    '--disable-plugins',
                    '--disable-default-apps',
                    '--disable-hang-monitor',
                    '--disable-prompt-on-repost',
                    '--disable-sync',
                    '--disable-translate',
                    '--metrics-recording-only',
                    '--no-default-browser-check',
                    '--safebrowsing-disable-auto-update',
                    '--mute-audio',
                    '--disable-component-extensions-with-background-pages',
                    '--disable-ipc-flooding-protection'
                ],
                timeout: 120000,
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
            }
        });

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.client.on('qr', async (qr) => {
            console.log('🔥 [QR DEBUG 1] QR Event triggered');
            console.log(`🔥 [QR DEBUG 2] Restaurant: ${this.restaurant.name}`);
            console.log(`🔥 [QR DEBUG 3] QR String length: ${qr.length}`);
            console.log(`🔥 [QR DEBUG 4] QR String preview: ${qr.substring(0, 50)}...`);
            console.log(`🔥 [QR DEBUG 5] IO instance exists: ${!!this.io}`);
            console.log(`🔥 [QR DEBUG 6] IO connected clients: ${this.io.engine.clientsCount}`);
            
            this.state = 'qr_ready';
            
            try {
                console.log('🔥 [QR DEBUG 7] Starting QRCode.toDataURL generation...');
                
                // Gera QR Code com configurações otimizadas para VPS
                const qrImage = await QRCode.toDataURL(qr, { 
                    width: 300, 
                    margin: 2,
                    errorCorrectionLevel: 'M',
                    type: 'image/png',
                    quality: 0.92,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                });
                
                console.log(`🔥 [QR DEBUG 8] QR Image generated successfully`);
                console.log(`🔥 [QR DEBUG 9] QR Image size: ${qrImage.length} chars`);
                console.log(`🔥 [QR DEBUG 10] QR Image starts with: ${qrImage.substring(0, 30)}`);
                
                const qrPayload = {
                    restaurantId: this.restaurant.id,
                    qrData: qrImage,
                    timestamp: Date.now(),
                    debug: 'VPS_QR_GENERATION'
                };
                
                console.log(`🔥 [QR DEBUG 11] Payload prepared:`, {
                    restaurantId: qrPayload.restaurantId,
                    qrDataLength: qrPayload.qrData.length,
                    timestamp: qrPayload.timestamp
                });
                
                // Emite QR para todos os clientes conectados (não apenas room específico)
                console.log('🔥 [QR DEBUG 12] Emitting to ALL clients...');
                this.io.emit('qr', qrPayload);
                
                // Também emite para room específico
                console.log(`🔥 [QR DEBUG 13] Emitting to room restaurant_${this.restaurant.id}...`);
                this.io.to(`restaurant_${this.restaurant.id}`).emit('qr', qrPayload);
                
                // Emite evento adicional para debug
                console.log('🔥 [QR DEBUG 14] Emitting debug event...');
                this.io.emit('qr_debug', {
                    restaurantId: this.restaurant.id,
                    message: 'QR generated successfully on server',
                    timestamp: Date.now(),
                    clientsCount: this.io.engine.clientsCount
                });
                
                console.log(`✅ [QR DEBUG 15] QR Code enviado via WebSocket para: ${this.restaurant.name}`);
                console.log(`✅ [QR DEBUG 16] Total clients notified: ${this.io.engine.clientsCount}`);
                
            } catch (error) {
                console.error('❌ [QR DEBUG ERROR 1] Erro ao gerar QR Code:', error);
                console.error('❌ [QR DEBUG ERROR 2] Error stack:', error.stack);
                
                // Fallback: tenta gerar QR mais simples
                try {
                    console.log('🔥 [QR DEBUG 17] Trying fallback QR generation...');
                    const fallbackQR = await QRCode.toDataURL(qr);
                    
                    console.log(`🔥 [QR DEBUG 18] Fallback QR generated: ${fallbackQR.length} chars`);
                    
                    const fallbackPayload = {
                        restaurantId: this.restaurant.id,
                        qrData: fallbackQR,
                        timestamp: Date.now(),
                        debug: 'VPS_QR_FALLBACK'
                    };
                    
                    this.io.emit('qr', fallbackPayload);
                    this.io.emit('qr_debug', {
                        restaurantId: this.restaurant.id,
                        message: 'Fallback QR generated successfully',
                        timestamp: Date.now()
                    });
                    
                    console.log('✅ [QR DEBUG 19] Fallback QR sent successfully');
                    
                } catch (fallbackError) {
                    console.error('❌ [QR DEBUG ERROR 3] Erro no fallback QR:', fallbackError);
                    console.error('❌ [QR DEBUG ERROR 4] Fallback error stack:', fallbackError.stack);
                    
                    // Último recurso: notificar erro para frontend
                    this.io.emit('qr_error', {
                        restaurantId: this.restaurant.id,
                        error: 'Failed to generate QR code',
                        timestamp: Date.now()
                    });
                }
            }
        });

        this.client.on('ready', () => {
            console.log(`✅ Bot conectado: ${this.restaurant.name}`);
            this.state = 'ready';
            
            this.io.to(`restaurant_${this.restaurant.id}`).emit('ready', {
                restaurantId: this.restaurant.id
            });
        });

        this.client.on('message', async (message) => {
            await this.handleMessage(message);
        });

        this.client.on('auth_failure', () => {
            console.error(`❌ Falha na autenticação: ${this.restaurant.name}`);
            this.state = 'auth_failed';
            
            this.io.to(`restaurant_${this.restaurant.id}`).emit('auth_failure', {
                restaurantId: this.restaurant.id
            });
        });

        this.client.on('disconnected', (reason) => {
            console.log(`🔌 Desconectado: ${this.restaurant.name} - ${reason}`);
            this.state = 'disconnected';
            
            this.io.to(`restaurant_${this.restaurant.id}`).emit('disconnected', {
                restaurantId: this.restaurant.id,
                reason
            });
        });
    }

    async handleMessage(message) {
        try {
            if (message.fromMe) return;

            const chat = await message.getChat();
            if (chat.isGroup) return;

            if (this.processedMessages.has(message.id._serialized)) return;
            this.processedMessages.add(message.id._serialized);

            // Verifica cooldown
            const clientId = message.from;
            const now = Date.now();
            const cooldownTime = 12 * 60 * 60 * 1000; // 12 horas

            const cooldownRecord = await this.db.getCooldown(this.restaurant.id, clientId);
            
            if (cooldownRecord && (now - cooldownRecord.last_message_time) < cooldownTime) {
                const contact = await message.getContact();
                const remainingTime = Math.ceil((cooldownTime - (now - cooldownRecord.last_message_time)) / (60 * 60 * 1000));
                console.log(`⏰ ${this.restaurant.name} - Cliente ${contact.name || 'Desconhecido'} em cooldown. Restam ${remainingTime}h`);
                return;
            }

            const contact = await message.getContact();
            console.log(`📩 ${this.restaurant.name} - Mensagem de ${contact.name || 'Cliente'}: ${message.body}`);

            await this.sendWelcomeMessage(message);
            await this.db.setCooldown(this.restaurant.id, clientId, now);

            console.log(`✅ ${this.restaurant.name} - Resposta enviada para ${contact.name || 'Cliente'}`);

        } catch (error) {
            console.error(`❌ ${this.restaurant.name} - Erro ao processar mensagem:`, error);
        }
    }

    async sendWelcomeMessage(message) {
        try {
            let welcomeText = this.restaurant.welcome_message
                .replace(/{{MENU_URL}}/g, this.restaurant.menu_url)
                .replace(/{{RESTAURANT_NAME}}/g, this.restaurant.name)
                .replace(/{{OPENING_HOURS}}/g, this.restaurant.opening_hours)
                .replace(/{{FOOD_EMOJI}}/g, this.restaurant.food_emoji);

            await message.reply(welcomeText);
        } catch (error) {
            console.error(`❌ ${this.restaurant.name} - Erro ao enviar mensagem:`, error);
        }
    }

    async start() {
        this.state = 'starting';
        await this.client.initialize();
    }

    async stop() {
        this.state = 'stopping';
        if (this.client) {
            await this.client.destroy();
        }
        this.state = 'stopped';
    }
}

// Inicialização
const multiBot = new MultiRestaurantBot();

// Tratamento de sinais
process.on('SIGINT', async () => {
    console.log('\n🛑 Recebido sinal de parada...');
    await multiBot.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Recebido sinal de término...');
    await multiBot.shutdown();
    process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Erro não tratado:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Exceção não capturada:', error);
    process.exit(1);
});

module.exports = MultiRestaurantBot;