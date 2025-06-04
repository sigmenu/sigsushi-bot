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
        this.initializeRestaurants();
    }
    
    async initializeRestaurants() {
        // Wait for database to be fully initialized
        console.log('🔄 [INIT] Waiting for database initialization...');
        
        // Wait a bit for database init to complete
        setTimeout(async () => {
            console.log('🔄 [INIT] Starting restaurant loading...');
            await this.loadRestaurants();
        }, 1000);
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
        
        // Socket.IO configuração específica para VPS
        this.io = socketIo(this.server, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST'],
                allowedHeaders: ['Content-Type'],
                credentials: false
            },
            allowEIO3: true,
            transports: ['polling', 'websocket'], // Polling primeiro para VPS
            pingTimeout: 60000,
            pingInterval: 25000,
            upgradeTimeout: 30000,
            maxHttpBufferSize: 1e6,
            serveClient: true,
            path: '/socket.io/'
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
            console.log(`🔥 [WEBSOCKET DEBUG] Socket.IO config:`);
            console.log(`   - Transports: polling, websocket`);
            console.log(`   - CORS: enabled for all origins`);
            console.log(`   - Path: /socket.io/`);
            console.log(`   - Polling first for VPS compatibility`);
            console.log(`🔥 [SERVER DEBUG] Available routes:`);
            console.log(`   - GET /test-qr/[restaurantId] - Force QR generation`);
            console.log(`   - GET /test-websocket - Test WebSocket`);
            console.log(`   - GET /debug-full - Full debug info`);
            console.log(`   - GET /debug - Redirect to debug-full`);
            console.log(`   - GET /debug-dashboard - COMPREHENSIVE DEBUG DASHBOARD`);
            console.log(`   - GET /socket-test - Dedicated WebSocket test page`);
            console.log(`   - GET /health - Health check`);
            console.log(`   - POST /api/regenerate-qr/[restaurantId] - Regenerate QR Code`);
            console.log(`   - GET /api/regenerate-qr/[restaurantId] - Regenerate QR Code (browser friendly)`);
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
        this.app.get('/debug-full', async (req, res) => {
            console.log('🔥 [DEBUG-FULL] Route called');
            
            try {
                // Get restaurants from database (actual data)
                const dbRestaurants = await this.db.getAllRestaurants();
                console.log('🔥 [DEBUG-FULL] DB restaurants:', dbRestaurants.length);
                
                const debug = {
                    server: {
                        port: this.port,
                        clients: this.io.engine.clientsCount,
                        restaurants: dbRestaurants.length, // Use actual DB count
                        runningBots: this.restaurants.size, // Running bot instances
                        socketioConfig: {
                            transports: ['polling', 'websocket'],
                            cors: 'enabled',
                            path: '/socket.io/'
                        },
                        instanceId: this.instanceId || 'no-id'
                    },
                    restaurants: {},
                    database: {
                        restaurantsInDB: dbRestaurants.length,
                        restaurantsLoaded: this.restaurantsLoaded || false,
                        lastLoadTime: this.lastLoadTime || 'never'
                    },
                    environment: {
                        nodeVersion: process.version,
                        platform: process.platform,
                        uptime: process.uptime(),
                        memory: process.memoryUsage(),
                        pid: process.pid
                    },
                    network: {
                        ip: req.ip,
                        host: req.get('host'),
                        userAgent: req.get('user-agent'),
                        origin: req.get('origin')
                    }
                };
                
                // Add database restaurants (actual data)
                dbRestaurants.forEach((restaurant, index) => {
                    const botInstance = this.restaurants.get(restaurant.id);
                    debug.restaurants[restaurant.id] = {
                        name: restaurant.name,
                        menu_url: restaurant.menu_url,
                        session_active: restaurant.session_active,
                        created_at: restaurant.created_at,
                        state: botInstance ? botInstance.state : 'not-running',
                        connected: botInstance && botInstance.client.info ? true : false,
                        source: 'database'
                    };
                });
                
                // Add any additional running bots not in database
                this.restaurants.forEach((bot, id) => {
                    if (!debug.restaurants[id]) {
                        debug.restaurants[id] = {
                            name: bot.restaurant?.name || 'unknown',
                            state: bot.state,
                            connected: bot.client.info ? true : false,
                            source: 'memory-only'
                        };
                    }
                });
                
                console.log('🔥 [DEBUG-FULL] Returning debug data with', Object.keys(debug.restaurants).length, 'restaurants');
                res.json(debug);
                
            } catch (error) {
                console.error('🔥 [DEBUG-FULL] Error:', error);
                res.status(500).json({
                    error: 'Failed to get debug data',
                    message: error.message,
                    server: {
                        port: this.port,
                        clients: this.io.engine.clientsCount,
                        restaurants: this.restaurants.size
                    }
                });
            }
        });

        // ROTA /debug (redirecionamento para compatibilidade)
        this.app.get('/debug', (req, res) => {
            res.redirect('/debug-full');
        });

        // HEALTH CHECK SIMPLES
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                timestamp: Date.now(),
                uptime: process.uptime(),
                clients: this.io.engine.clientsCount,
                message: 'Server is running'
            });
        });

        // API REGENERATE QR CODE (MISSING ENDPOINT FIXED)
        this.app.post('/api/regenerate-qr/:restaurantId?', async (req, res) => {
            console.log('🔥 [REGENERATE QR] API called');
            const restaurantId = req.params.restaurantId || req.body.restaurantId;
            
            try {
                console.log(`🔥 [REGENERATE QR] Restaurant ID: ${restaurantId}`);
                
                if (restaurantId) {
                    // Regenerate QR for specific restaurant
                    const botInstance = this.restaurants.get(restaurantId);
                    if (botInstance) {
                        console.log(`🔥 [REGENERATE QR] Stopping bot for restaurant: ${restaurantId}`);
                        
                        // Stop the current bot
                        await this.stopRestaurantBot(restaurantId);
                        
                        // Wait a moment before restarting
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        
                        console.log(`🔥 [REGENERATE QR] Restarting bot for restaurant: ${restaurantId}`);
                        
                        // Restart the bot (this will generate a new QR)
                        await this.startRestaurantBot(restaurantId);
                        
                        res.json({
                            success: true,
                            message: `QR Code regeneration initiated for restaurant ${restaurantId}`,
                            restaurantId: restaurantId,
                            timestamp: Date.now()
                        });
                        
                        console.log(`🔥 [REGENERATE QR] ✅ QR regeneration completed for: ${restaurantId}`);
                        
                    } else {
                        console.log(`🔥 [REGENERATE QR] ❌ Restaurant not found: ${restaurantId}`);
                        res.status(404).json({
                            success: false,
                            error: `Restaurant ${restaurantId} not found or not running`,
                            restaurantId: restaurantId
                        });
                    }
                } else {
                    // No specific restaurant - regenerate for all active restaurants
                    console.log('🔥 [REGENERATE QR] Regenerating for all active restaurants');
                    
                    const activeRestaurants = Array.from(this.restaurants.keys());
                    let regenerated = 0;
                    
                    for (const restId of activeRestaurants) {
                        try {
                            console.log(`🔥 [REGENERATE QR] Processing restaurant: ${restId}`);
                            await this.stopRestaurantBot(restId);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            await this.startRestaurantBot(restId);
                            regenerated++;
                            console.log(`🔥 [REGENERATE QR] ✅ Regenerated for: ${restId}`);
                        } catch (error) {
                            console.error(`🔥 [REGENERATE QR] ❌ Failed for ${restId}:`, error);
                        }
                    }
                    
                    res.json({
                        success: true,
                        message: `QR Code regeneration initiated for ${regenerated} restaurants`,
                        regeneratedCount: regenerated,
                        totalRestaurants: activeRestaurants.length,
                        timestamp: Date.now()
                    });
                }
                
            } catch (error) {
                console.error('🔥 [REGENERATE QR] ❌ Error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
                    timestamp: Date.now()
                });
            }
        });

        // API REGENERATE QR CODE - GET METHOD (for easy browser testing)
        this.app.get('/api/regenerate-qr/:restaurantId?', async (req, res) => {
            console.log('🔥 [REGENERATE QR] GET method called - redirecting to POST');
            
            // For GET requests, we'll process directly (easier for testing)
            req.body = { restaurantId: req.params.restaurantId };
            
            // Call the POST handler
            try {
                const restaurantId = req.params.restaurantId;
                
                if (restaurantId) {
                    const botInstance = this.restaurants.get(restaurantId);
                    if (botInstance) {
                        await this.stopRestaurantBot(restaurantId);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        await this.startRestaurantBot(restaurantId);
                        
                        res.json({
                            success: true,
                            message: `QR Code regeneration completed for restaurant ${restaurantId}`,
                            method: 'GET',
                            restaurantId: restaurantId,
                            timestamp: Date.now()
                        });
                    } else {
                        res.status(404).json({
                            success: false,
                            error: `Restaurant ${restaurantId} not found`
                        });
                    }
                } else {
                    res.json({
                        success: false,
                        error: 'Restaurant ID required for GET method',
                        usage: 'GET /api/regenerate-qr/:restaurantId'
                    });
                }
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // DEBUG DASHBOARD COMPLETO
        this.app.get('/debug-dashboard', (req, res) => {
            res.send(`
                <!DOCTYPE html>
                <html lang="pt-BR">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>🔥 Debug Dashboard - VPS Diagnostics</title>
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body { 
                            font-family: 'Courier New', monospace; 
                            background: #1a1a1a; 
                            color: #00ff00; 
                            padding: 20px;
                            font-size: 14px;
                        }
                        .header { 
                            text-align: center; 
                            margin-bottom: 30px; 
                            border-bottom: 2px solid #00ff00; 
                            padding-bottom: 20px;
                        }
                        .title { 
                            font-size: 2rem; 
                            margin-bottom: 10px; 
                            text-shadow: 0 0 10px #00ff00;
                        }
                        .subtitle { 
                            color: #ffff00; 
                            font-size: 1rem;
                        }
                        .dashboard { 
                            display: grid; 
                            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); 
                            gap: 20px; 
                            margin-bottom: 30px;
                        }
                        .card { 
                            background: #2a2a2a; 
                            border: 1px solid #00ff00; 
                            border-radius: 8px; 
                            padding: 20px;
                            box-shadow: 0 0 15px rgba(0, 255, 0, 0.3);
                        }
                        .card-title { 
                            color: #00ffff; 
                            font-size: 1.2rem; 
                            margin-bottom: 15px; 
                            border-bottom: 1px solid #00ffff;
                            padding-bottom: 5px;
                        }
                        .status-item { 
                            display: flex; 
                            justify-content: space-between; 
                            margin: 8px 0; 
                            padding: 5px;
                            background: #333;
                            border-radius: 4px;
                        }
                        .status-label { color: #ffff00; }
                        .status-value { color: #00ff00; font-weight: bold; }
                        .status-error { color: #ff0000; }
                        .status-warning { color: #ffa500; }
                        .btn { 
                            background: #00ff00; 
                            color: #000; 
                            border: none; 
                            padding: 8px 15px; 
                            margin: 5px; 
                            border-radius: 4px; 
                            cursor: pointer; 
                            font-family: inherit;
                            font-weight: bold;
                        }
                        .btn:hover { 
                            background: #00cc00; 
                            box-shadow: 0 0 10px #00ff00;
                        }
                        .btn-danger { background: #ff0000; color: white; }
                        .btn-warning { background: #ffa500; color: black; }
                        .btn-info { background: #00ffff; color: black; }
                        .console { 
                            background: #000; 
                            border: 2px solid #00ff00; 
                            border-radius: 8px; 
                            padding: 15px; 
                            height: 400px; 
                            overflow-y: auto;
                            font-family: 'Courier New', monospace;
                            font-size: 12px;
                        }
                        .console-title { 
                            color: #00ffff; 
                            margin-bottom: 10px; 
                            font-size: 1.1rem;
                        }
                        .log-entry { 
                            margin: 2px 0; 
                            padding: 2px 5px;
                            border-radius: 3px;
                        }
                        .log-info { color: #00ff00; }
                        .log-warning { color: #ffa500; background: #332200; }
                        .log-error { color: #ff0000; background: #330000; }
                        .log-qr { color: #ff00ff; background: #220022; }
                        .log-ws { color: #00ffff; background: #002222; }
                        .auto-refresh { 
                            color: #ffff00; 
                            text-align: center; 
                            margin: 20px 0;
                            font-size: 12px;
                        }
                        .timestamp { color: #888; font-size: 11px; }
                        .refresh-indicator { 
                            display: inline-block; 
                            animation: pulse 1s infinite;
                        }
                        @keyframes pulse { 
                            0% { opacity: 1; } 
                            50% { opacity: 0.5; } 
                            100% { opacity: 1; } 
                        }
                        .grid-2 { 
                            display: grid; 
                            grid-template-columns: 1fr 1fr; 
                            gap: 20px;
                        }
                        @media (max-width: 768px) { 
                            .dashboard { grid-template-columns: 1fr; }
                            .grid-2 { grid-template-columns: 1fr; }
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="title">🔥 DEBUG DASHBOARD</div>
                        <div class="subtitle">VPS Server Diagnostics - ${req.get('host')}</div>
                        <div class="auto-refresh">
                            <span class="refresh-indicator">●</span> Auto-refresh ativo (2s)
                        </div>
                    </div>

                    <div class="dashboard">
                        <!-- Server Status -->
                        <div class="card">
                            <div class="card-title">🖥️ SERVER STATUS</div>
                            <div id="server-status">
                                <div class="status-item">
                                    <span class="status-label">Status:</span>
                                    <span class="status-value" id="server-online">LOADING...</span>
                                </div>
                                <div class="status-item">
                                    <span class="status-label">Porta:</span>
                                    <span class="status-value">${this.port}</span>
                                </div>
                                <div class="status-item">
                                    <span class="status-label">Uptime:</span>
                                    <span class="status-value" id="server-uptime">LOADING...</span>
                                </div>
                                <div class="status-item">
                                    <span class="status-label">Memória:</span>
                                    <span class="status-value" id="server-memory">LOADING...</span>
                                </div>
                                <div class="status-item">
                                    <span class="status-label">Node.js:</span>
                                    <span class="status-value">${process.version}</span>
                                </div>
                            </div>
                        </div>

                        <!-- WebSocket Status -->
                        <div class="card">
                            <div class="card-title">📡 WEBSOCKET STATUS</div>
                            <div id="websocket-status">
                                <div class="status-item">
                                    <span class="status-label">Clientes Conectados:</span>
                                    <span class="status-value" id="ws-clients">LOADING...</span>
                                </div>
                                <div class="status-item">
                                    <span class="status-label">Transports:</span>
                                    <span class="status-value">polling, websocket</span>
                                </div>
                                <div class="status-item">
                                    <span class="status-label">CORS:</span>
                                    <span class="status-value">enabled (*)</span>
                                </div>
                                <div class="status-item">
                                    <span class="status-label">Path:</span>
                                    <span class="status-value">/socket.io/</span>
                                </div>
                                <div class="status-item">
                                    <span class="status-label">Status:</span>
                                    <span class="status-value" id="ws-status">LOADING...</span>
                                </div>
                            </div>
                        </div>

                        <!-- WhatsApp Clients -->
                        <div class="card">
                            <div class="card-title">📱 WHATSAPP CLIENTS</div>
                            <div id="whatsapp-status">
                                <div class="status-item">
                                    <span class="status-label">Total Restaurantes:</span>
                                    <span class="status-value" id="total-restaurants">LOADING...</span>
                                </div>
                                <div class="status-item">
                                    <span class="status-label">Clients Ativos:</span>
                                    <span class="status-value" id="active-clients">LOADING...</span>
                                </div>
                                <div class="status-item">
                                    <span class="status-label">QR Pendentes:</span>
                                    <span class="status-value" id="pending-qr">LOADING...</span>
                                </div>
                                <div id="clients-detail"></div>
                            </div>
                        </div>

                        <!-- Test Tools -->
                        <div class="card">
                            <div class="card-title">🧪 TEST TOOLS</div>
                            <button class="btn" onclick="testWebSocketConnection()">📡 Test WebSocket</button>
                            <button class="btn" onclick="forceQRGeneration()">📱 Force QR Generation</button>
                            <button class="btn btn-warning" onclick="regenerateAllQR()">🔄 Regenerate All QR</button>
                            <button class="btn btn-danger" onclick="clearAllSessions()">🗑️ Clear Sessions</button>
                            <br><br>
                            <button class="btn btn-info" onclick="downloadLogs()">📥 Download Logs</button>
                            <button class="btn btn-info" onclick="exportDebugData()">📊 Export Debug Data</button>
                        </div>

                        <!-- Network Info -->
                        <div class="card">
                            <div class="card-title">🌐 NETWORK INFO</div>
                            <div id="network-info">
                                <div class="status-item">
                                    <span class="status-label">Client IP:</span>
                                    <span class="status-value">${req.ip}</span>
                                </div>
                                <div class="status-item">
                                    <span class="status-label">Host:</span>
                                    <span class="status-value">${req.get('host')}</span>
                                </div>
                                <div class="status-item">
                                    <span class="status-label">User-Agent:</span>
                                    <span class="status-value" style="font-size: 11px;">${req.get('user-agent')?.substring(0, 30)}...</span>
                                </div>
                                <div class="status-item">
                                    <span class="status-label">Protocol:</span>
                                    <span class="status-value">${req.protocol}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Quick Actions -->
                        <div class="card">
                            <div class="card-title">⚡ QUICK ACTIONS</div>
                            <div class="status-item">
                                <button class="btn" onclick="window.open('/debug-full', '_blank')">📊 Full Debug JSON</button>
                                <button class="btn" onclick="window.open('/socket-test', '_blank')">🔧 Socket Test Page</button>
                            </div>
                            <div class="status-item">
                                <button class="btn" onclick="window.open('/health', '_blank')">❤️ Health Check</button>
                                <button class="btn" onclick="window.open('/', '_blank')">🏠 Main Dashboard</button>
                            </div>
                        </div>
                    </div>

                    <!-- Real-time Console -->
                    <div class="card">
                        <div class="console-title">📋 REAL-TIME DEBUG CONSOLE</div>
                        <div class="console" id="debug-console">
                            <div class="log-entry log-info">🔥 Debug Dashboard initialized...</div>
                            <div class="log-entry log-info">📡 Starting real-time monitoring...</div>
                        </div>
                        <div style="margin-top: 10px;">
                            <button class="btn" onclick="clearConsole()">🗑️ Clear Console</button>
                            <button class="btn" onclick="toggleAutoScroll()">📜 Toggle Auto-scroll</button>
                            <select id="log-filter" onchange="filterLogs()">
                                <option value="all">All Logs</option>
                                <option value="qr">QR Logs Only</option>
                                <option value="ws">WebSocket Logs Only</option>
                                <option value="error">Errors Only</option>
                            </select>
                        </div>
                    </div>

                    <script src="/socket.io/socket.io.js"></script>
                    <script>
                        let socket;
                        let autoScroll = true;
                        let logFilter = 'all';
                        let logs = [];

                        // Initialize debug dashboard
                        document.addEventListener('DOMContentLoaded', function() {
                            addLog('info', '🔥 Debug Dashboard loaded');
                            connectWebSocket();
                            startPeriodicUpdates();
                        });

                        function connectWebSocket() {
                            addLog('info', '📡 Connecting to WebSocket...');
                            
                            socket = io({
                                transports: ['polling', 'websocket'],
                                timeout: 20000
                            });

                            socket.on('connect', () => {
                                addLog('ws', '✅ WebSocket connected: ' + socket.id);
                                document.getElementById('ws-status').textContent = 'CONNECTED';
                                document.getElementById('ws-status').className = 'status-value';
                            });

                            socket.on('qr', (data) => {
                                addLog('qr', '📱 QR received: ' + data.restaurantId + ' (Length: ' + data.qrData?.length + ')');
                            });

                            socket.on('qr_debug', (data) => {
                                addLog('qr', '🐛 QR Debug: ' + data.message);
                            });

                            socket.on('connection_confirmed', (data) => {
                                addLog('ws', '✅ Connection confirmed by server');
                            });

                            socket.on('disconnect', (reason) => {
                                addLog('error', '❌ WebSocket disconnected: ' + reason);
                                document.getElementById('ws-status').textContent = 'DISCONNECTED';
                                document.getElementById('ws-status').className = 'status-error';
                            });

                            socket.on('connect_error', (error) => {
                                addLog('error', '❌ WebSocket connection error: ' + error.message);
                                document.getElementById('ws-status').textContent = 'ERROR';
                                document.getElementById('ws-status').className = 'status-error';
                            });
                        }

                        function addLog(type, message) {
                            const timestamp = new Date().toLocaleTimeString();
                            const logEntry = {
                                type: type,
                                message: message,
                                timestamp: timestamp
                            };
                            
                            logs.unshift(logEntry);
                            if (logs.length > 100) logs = logs.slice(0, 100); // Keep last 100 logs
                            
                            updateConsole();
                        }

                        function updateConsole() {
                            const console = document.getElementById('debug-console');
                            const filteredLogs = logs.filter(log => {
                                if (logFilter === 'all') return true;
                                return log.type === logFilter;
                            });
                            
                            console.innerHTML = filteredLogs.map(log => 
                                '<div class="log-entry log-' + log.type + '">' +
                                '<span class="timestamp">[' + log.timestamp + ']</span> ' +
                                log.message + '</div>'
                            ).join('');
                            
                            if (autoScroll) {
                                console.scrollTop = 0;
                            }
                        }

                        function startPeriodicUpdates() {
                            updateServerStats();
                            setInterval(updateServerStats, 2000);
                        }

                        async function updateServerStats() {
                            try {
                                const response = await fetch('/debug-full');
                                const data = await response.json();
                                
                                // Update server status
                                document.getElementById('server-online').textContent = 'ONLINE';
                                document.getElementById('server-uptime').textContent = Math.floor(data.environment.uptime / 60) + 'm';
                                document.getElementById('server-memory').textContent = Math.floor(data.environment.memory.used / 1024 / 1024) + 'MB';
                                
                                // Update WebSocket status
                                document.getElementById('ws-clients').textContent = data.server.clients;
                                
                                // Update WhatsApp status
                                document.getElementById('total-restaurants').textContent = data.server.restaurants;
                                
                                let activeClients = 0;
                                let pendingQR = 0;
                                let detailHTML = '';
                                
                                Object.keys(data.restaurants).forEach(id => {
                                    const rest = data.restaurants[id];
                                    if (rest.connected) activeClients++;
                                    if (rest.state === 'qr_ready') pendingQR++;
                                    
                                    detailHTML += '<div class="status-item" style="font-size: 11px;">' +
                                        '<span class="status-label">' + rest.name + ':</span>' +
                                        '<span class="' + (rest.connected ? 'status-value' : 'status-error') + '">' + 
                                        rest.state + '</span></div>';
                                });
                                
                                document.getElementById('active-clients').textContent = activeClients;
                                document.getElementById('pending-qr').textContent = pendingQR;
                                document.getElementById('clients-detail').innerHTML = detailHTML;
                                
                                addLog('info', '📊 Stats updated - Clients: ' + data.server.clients + ', Restaurants: ' + data.server.restaurants);
                                
                            } catch (error) {
                                addLog('error', '❌ Failed to update stats: ' + error.message);
                                document.getElementById('server-online').textContent = 'ERROR';
                                document.getElementById('server-online').className = 'status-error';
                            }
                        }

                        // Test Functions
                        async function testWebSocketConnection() {
                            addLog('info', '🧪 Testing WebSocket connection...');
                            socket.emit('ping_test', { message: 'Debug dashboard test', timestamp: Date.now() });
                        }

                        async function forceQRGeneration() {
                            addLog('info', '🧪 Forcing QR generation...');
                            try {
                                const response = await fetch('/test-qr/debug-test');
                                const result = await response.json();
                                addLog('qr', '✅ QR generation result: ' + result.message);
                            } catch (error) {
                                addLog('error', '❌ QR generation failed: ' + error.message);
                            }
                        }

                        async function regenerateAllQR() {
                            addLog('warning', '🔄 Regenerating all QR codes...');
                            try {
                                const response = await fetch('/api/regenerate-qr', { method: 'POST' });
                                const result = await response.json();
                                addLog('qr', '✅ QR regeneration: ' + result.message);
                            } catch (error) {
                                addLog('error', '❌ QR regeneration failed: ' + error.message);
                            }
                        }

                        function clearAllSessions() {
                            addLog('warning', '🗑️ Clear sessions not implemented yet');
                        }

                        function clearConsole() {
                            logs = [];
                            updateConsole();
                            addLog('info', '🗑️ Console cleared');
                        }

                        function toggleAutoScroll() {
                            autoScroll = !autoScroll;
                            addLog('info', '📜 Auto-scroll: ' + (autoScroll ? 'ON' : 'OFF'));
                        }

                        function filterLogs() {
                            logFilter = document.getElementById('log-filter').value;
                            updateConsole();
                            addLog('info', '🔍 Filter changed to: ' + logFilter);
                        }

                        function downloadLogs() {
                            try {
                                const logsText = logs.map(log => {
                                    const timestamp = log.timestamp || 'no-time';
                                    const type = (log.type || 'info').toUpperCase();
                                    const message = log.message || 'no-message';
                                    return '[' + timestamp + '] [' + type + '] ' + message;
                                }).join('\\n');
                                
                                const blob = new Blob([logsText], { type: 'text/plain' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = 'debug-logs-' + new Date().toISOString().slice(0, 19) + '.txt';
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                                addLog('info', '📥 Logs downloaded successfully');
                            } catch (error) {
                                console.error('Error downloading logs:', error);
                                addLog('error', '❌ Failed to download logs: ' + error.message);
                            }
                        }

                        function exportDebugData() {
                            try {
                                addLog('info', '📊 Exporting debug data...');
                                fetch('/debug-full')
                                    .then(response => {
                                        if (!response.ok) {
                                            throw new Error('Network response was not ok');
                                        }
                                        return response.json();
                                    })
                                    .then(data => {
                                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = 'debug-data-' + new Date().toISOString().slice(0, 19) + '.json';
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                        URL.revokeObjectURL(url);
                                        addLog('info', '📊 Debug data exported successfully');
                                    })
                                    .catch(error => {
                                        console.error('Error exporting debug data:', error);
                                        addLog('error', '❌ Failed to export debug data: ' + error.message);
                                    });
                            } catch (error) {
                                console.error('Error in exportDebugData:', error);
                                addLog('error', '❌ Error in export function: ' + error.message);
                            }
                        }
                    </script>
                </body>
                </html>
            `);
        });

        // ROTA PARA TESTAR CONECTIVIDADE WEBSOCKET ESPECÍFICA
        this.app.get('/socket-test', (req, res) => {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>WebSocket Test - VPS</title>
                    <style>
                        body { font-family: Arial; padding: 20px; }
                        .log { background: #f0f0f0; padding: 10px; margin: 10px 0; border-radius: 5px; }
                        .error { background: #ffe6e6; }
                        .success { background: #e6ffe6; }
                        button { padding: 10px 20px; margin: 5px; border: none; border-radius: 5px; cursor: pointer; }
                        .test-btn { background: #007bff; color: white; }
                    </style>
                </head>
                <body>
                    <h1>🔥 WebSocket Test - VPS (${req.get('host')})</h1>
                    <div id="logs"></div>
                    <button class="test-btn" onclick="testConnection()">🧪 Test Connection</button>
                    <button class="test-btn" onclick="clearLogs()">🗑️ Clear Logs</button>
                    
                    <script src="/socket.io/socket.io.js"></script>
                    <script>
                        let socket;
                        
                        function log(message, type = 'log') {
                            const div = document.createElement('div');
                            div.className = 'log ' + type;
                            div.innerHTML = new Date().toLocaleTimeString() + ' - ' + message;
                            document.getElementById('logs').appendChild(div);
                            console.log(message);
                        }
                        
                        function clearLogs() {
                            document.getElementById('logs').innerHTML = '';
                        }
                        
                        function testConnection() {
                            log('🔄 Iniciando teste de conexão WebSocket...');
                            
                            socket = io({
                                transports: ['polling', 'websocket'],
                                timeout: 20000,
                                forceNew: true
                            });
                            
                            socket.on('connect', () => {
                                log('✅ WebSocket conectado! ID: ' + socket.id, 'success');
                                log('🔗 Transport: ' + socket.io.engine.transport.name, 'success');
                                
                                // Teste ping
                                socket.emit('ping_test', { message: 'Test from socket-test page' });
                            });
                            
                            socket.on('connect_error', (error) => {
                                log('❌ Erro de conexão: ' + error.message, 'error');
                            });
                            
                            socket.on('disconnect', (reason) => {
                                log('🔌 Desconectado: ' + reason, 'error');
                            });
                            
                            socket.on('pong_test', (data) => {
                                log('🏓 Pong recebido: ' + JSON.stringify(data), 'success');
                            });
                            
                            socket.on('connection_confirmed', (data) => {
                                log('✅ Conexão confirmada: ' + JSON.stringify(data), 'success');
                            });
                        }
                        
                        // Auto-teste na abertura da página
                        window.onload = () => {
                            setTimeout(testConnection, 1000);
                        };
                    </script>
                </body>
                </html>
            `);
        });
    }

    setupWebSocket() {
        console.log('🔥 [WEBSOCKET INIT] Setting up Socket.IO event handlers...');
        
        this.io.engine.on('initial_headers', (headers, req) => {
            console.log('🔥 [WEBSOCKET] Initial headers received from:', req.headers.host);
        });

        this.io.engine.on('headers', (headers, req) => {
            console.log('🔥 [WEBSOCKET] Headers processed for:', req.headers.host);
        });

        this.io.on('connection', (socket) => {
            console.log('🔥 [WS DEBUG 1] ✅ CLIENTE CONECTADO!');
            console.log(`🔥 [WS DEBUG 2] Total clients: ${this.io.engine.clientsCount}`);
            console.log(`🔥 [WS DEBUG 3] Socket ID: ${socket.id}`);
            console.log(`🔥 [WS DEBUG 4] Client IP: ${socket.handshake.address}`);
            console.log(`🔥 [WS DEBUG 5] Transport: ${socket.conn.transport.name}`);
            console.log(`🔥 [WS DEBUG 6] Client headers:`, socket.handshake.headers.host);
            console.log(`🔥 [WS DEBUG 7] Origin: ${socket.handshake.headers.origin || 'no-origin'}`);
            console.log(`🔥 [WS DEBUG 8] User-Agent: ${socket.handshake.headers['user-agent']?.substring(0, 50)}...`);

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
            console.log('🔄 [LOAD] Iniciando carregamento de restaurantes...');
            console.log('🔄 [LOAD] Database instance exists:', !!this.db);
            console.log('🔄 [LOAD] Database getAllRestaurants method exists:', typeof this.db.getAllRestaurants);
            
            const restaurants = await this.db.getAllRestaurants();
            console.log(`🔄 [LOAD] Database returned:`, restaurants);
            console.log(`📋 Carregados ${restaurants.length} restaurantes`);
            
            if (restaurants.length > 0) {
                console.log('🔄 [LOAD] Restaurant details:');
                restaurants.forEach((restaurant, index) => {
                    console.log(`  ${index + 1}. ID: ${restaurant.id}`);
                    console.log(`     Nome: ${restaurant.name}`);
                    console.log(`     Menu: ${restaurant.menu_url}`);
                    console.log(`     Ativo: ${restaurant.session_active}`);
                });
                
                // Auto-start restaurantes que estavam ativos
                for (const restaurant of restaurants) {
                    if (restaurant.session_active) {
                        console.log(`🔄 Auto-iniciando bot: ${restaurant.name}`);
                        await this.startRestaurantBot(restaurant.id);
                    }
                }
            } else {
                console.log('⚠️ [LOAD] Nenhum restaurante encontrado no banco de dados');
                console.log('⚠️ [LOAD] Verificando se dados existem no arquivo...');
                
                // Try to manually check the file
                const fs = require('fs');
                const path = require('path');
                const dbPath = path.join(__dirname, 'restaurants-data.json');
                
                try {
                    const fileContent = fs.readFileSync(dbPath, 'utf8');
                    console.log('⚠️ [LOAD] Arquivo restaurants-data.json existe');
                    console.log('⚠️ [LOAD] Tamanho do arquivo:', fileContent.length, 'bytes');
                    console.log('⚠️ [LOAD] Conteúdo preview:', fileContent.substring(0, 200));
                    
                    const parsed = JSON.parse(fileContent);
                    console.log('⚠️ [LOAD] Dados parseados:', parsed);
                    console.log('⚠️ [LOAD] Restaurantes no arquivo:', parsed.restaurants?.length || 0);
                } catch (fileError) {
                    console.error('⚠️ [LOAD] Erro ao ler arquivo diretamente:', fileError);
                }
            }
            
            console.log('✅ [LOAD] Carregamento de restaurantes concluído');
            
        } catch (error) {
            console.error('❌ [LOAD] Erro ao carregar restaurantes:', error);
            console.error('❌ [LOAD] Stack trace:', error.stack);
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