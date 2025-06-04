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
        this.io = socketIo(this.server);
        this.port = process.env.PORT || 3000;

        // Middleware
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.static(path.join(__dirname, 'public')));

        this.setupRoutes();
        this.setupWebSocket();

        this.server.listen(this.port, '0.0.0.0', () => {
            console.log(`🌐 Sistema Multi-Restaurante ativo em: http://0.0.0.0:${this.port}`);
            console.log(`👤 Admin: http://0.0.0.0:${this.port}/admin`);
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
    }

    setupWebSocket() {
        this.io.on('connection', (socket) => {
            console.log('🌐 Cliente conectado ao dashboard');

            socket.on('subscribe_restaurant', (restaurantId) => {
                socket.join(`restaurant_${restaurantId}`);
                console.log(`📱 Cliente inscrito no restaurante: ${restaurantId}`);
            });
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
                    '--disable-features=VizDisplayCompositor'
                ],
                timeout: 60000
            }
        });

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.client.on('qr', async (qr) => {
            console.log(`📱 QR Code gerado para: ${this.restaurant.name}`);
            this.state = 'qr_ready';
            
            try {
                const qrImage = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
                this.io.to(`restaurant_${this.restaurant.id}`).emit('qr', {
                    restaurantId: this.restaurant.id,
                    qrData: qrImage
                });
            } catch (error) {
                console.error('❌ Erro ao gerar QR Code:', error);
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