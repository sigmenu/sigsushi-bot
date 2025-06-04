const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

class JsonDatabase {
    constructor() {
        this.dbPath = path.join(__dirname, 'restaurants-data.json');
        this.data = {
            restaurants: [],
            users: [],
            cooldowns: []
        };
        this.init();
    }

    async init() {
        try {
            await this.loadData();
            console.log('✅ Banco de dados JSON carregado');
            await this.createDefaultAdmin();
        } catch (error) {
            console.log('📄 Criando novo banco de dados JSON');
            await this.createDefaultAdmin();
            await this.saveData();
        }
    }

    async loadData() {
        try {
            const data = await fs.readFile(this.dbPath, 'utf8');
            this.data = JSON.parse(data);
        } catch (error) {
            // Arquivo não existe, usar dados padrão
            this.data = {
                restaurants: [],
                users: [],
                cooldowns: []
            };
        }
    }

    async saveData() {
        try {
            await fs.writeFile(this.dbPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('❌ Erro ao salvar dados:', error);
            throw error;
        }
    }

    async createDefaultAdmin() {
        const existingAdmin = this.data.users.find(u => u.username === 'admin');
        if (!existingAdmin) {
            const password = 'admin123';
            const hashedPassword = await bcrypt.hash(password, 10);
            
            this.data.users.push({
                id: uuidv4(),
                username: 'admin',
                password_hash: hashedPassword,
                email: null,
                role: 'admin',
                created_at: new Date().toISOString()
            });
            
            await this.saveData();
            console.log('👤 Admin padrão criado: admin/admin123');
        }
    }

    // Métodos para Restaurantes
    async createRestaurant(restaurantData) {
        try {
            const id = uuidv4();
            const restaurant = {
                id,
                name: restaurantData.name,
                menu_url: restaurantData.menu_url,
                opening_hours: restaurantData.opening_hours,
                food_emoji: restaurantData.food_emoji || '🍽️',
                welcome_message: restaurantData.welcome_message,
                phone_number: restaurantData.phone_number || null,
                session_active: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            this.data.restaurants.push(restaurant);
            await this.saveData();
            return restaurant;
        } catch (error) {
            throw error;
        }
    }

    async getAllRestaurants() {
        return [...this.data.restaurants].sort((a, b) => 
            new Date(b.created_at) - new Date(a.created_at)
        );
    }

    async getRestaurantById(id) {
        return this.data.restaurants.find(r => r.id === id) || null;
    }

    async updateRestaurant(id, updates) {
        const index = this.data.restaurants.findIndex(r => r.id === id);
        if (index === -1) {
            throw new Error('Restaurante não encontrado');
        }
        
        this.data.restaurants[index] = {
            ...this.data.restaurants[index],
            ...updates,
            updated_at: new Date().toISOString()
        };
        
        await this.saveData();
        return { changes: 1 };
    }

    async deleteRestaurant(id) {
        const index = this.data.restaurants.findIndex(r => r.id === id);
        if (index === -1) {
            throw new Error('Restaurante não encontrado');
        }
        
        this.data.restaurants.splice(index, 1);
        
        // Remove cooldowns relacionados
        this.data.cooldowns = this.data.cooldowns.filter(c => c.restaurant_id !== id);
        
        await this.saveData();
        return { changes: 1 };
    }

    // Métodos para Cooldown
    async setCooldown(restaurantId, clientPhone, timestamp) {
        // Remove cooldown existente
        this.data.cooldowns = this.data.cooldowns.filter(
            c => !(c.restaurant_id === restaurantId && c.client_phone === clientPhone)
        );
        
        // Adiciona novo cooldown
        this.data.cooldowns.push({
            id: uuidv4(),
            restaurant_id: restaurantId,
            client_phone: clientPhone,
            last_message_time: timestamp,
            created_at: new Date().toISOString()
        });
        
        await this.saveData();
        return { id: 'success' };
    }

    async getCooldown(restaurantId, clientPhone) {
        return this.data.cooldowns.find(
            c => c.restaurant_id === restaurantId && c.client_phone === clientPhone
        ) || null;
    }

    // Métodos para Autenticação
    async authenticateUser(username, password) {
        const user = this.data.users.find(u => u.username === username);
        if (!user) {
            return null;
        }
        
        const isValid = await bcrypt.compare(password, user.password_hash);
        return isValid ? user : null;
    }

    // Atualizar status da sessão
    async updateSessionStatus(restaurantId, isActive) {
        const index = this.data.restaurants.findIndex(r => r.id === restaurantId);
        if (index !== -1) {
            this.data.restaurants[index].session_active = isActive;
            this.data.restaurants[index].updated_at = new Date().toISOString();
            await this.saveData();
            return { changes: 1 };
        }
        return { changes: 0 };
    }

    // Limpeza de cooldowns antigos (opcional)
    async cleanupOldCooldowns() {
        const now = Date.now();
        const cooldownTime = 12 * 60 * 60 * 1000; // 12 horas
        
        const initialCount = this.data.cooldowns.length;
        this.data.cooldowns = this.data.cooldowns.filter(
            c => (now - c.last_message_time) < cooldownTime
        );
        
        const removedCount = initialCount - this.data.cooldowns.length;
        if (removedCount > 0) {
            await this.saveData();
            console.log(`🧹 Removidos ${removedCount} cooldowns expirados`);
        }
    }

    close() {
        console.log('✅ Banco de dados JSON fechado');
    }

    // Backup dos dados
    async createBackup() {
        const backupPath = path.join(__dirname, `restaurants-backup-${Date.now()}.json`);
        try {
            await fs.copyFile(this.dbPath, backupPath);
            console.log(`💾 Backup criado: ${backupPath}`);
            return backupPath;
        } catch (error) {
            console.error('❌ Erro ao criar backup:', error);
            throw error;
        }
    }
}

module.exports = JsonDatabase;