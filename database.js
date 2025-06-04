const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

class Database {
    constructor() {
        this.dbPath = path.join(__dirname, 'restaurants.db');
        this.db = null;
        this.init();
    }

    init() {
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                console.error('❌ Erro ao conectar banco de dados:', err);
            } else {
                console.log('✅ Banco de dados conectado');
                this.createTables();
            }
        });
    }

    createTables() {
        const createRestaurantsTable = `
            CREATE TABLE IF NOT EXISTS restaurants (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                menu_url TEXT NOT NULL,
                opening_hours TEXT NOT NULL,
                food_emoji TEXT DEFAULT '🍽️',
                welcome_message TEXT NOT NULL,
                phone_number TEXT UNIQUE,
                session_active BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

        const createUsersTable = `
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                email TEXT,
                role TEXT DEFAULT 'admin',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

        const createCooldownsTable = `
            CREATE TABLE IF NOT EXISTS cooldowns (
                id TEXT PRIMARY KEY,
                restaurant_id TEXT NOT NULL,
                client_phone TEXT NOT NULL,
                last_message_time INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (restaurant_id) REFERENCES restaurants (id),
                UNIQUE(restaurant_id, client_phone)
            )
        `;

        this.db.run(createRestaurantsTable);
        this.db.run(createUsersTable);
        this.db.run(createCooldownsTable);

        // Cria usuário admin padrão se não existir
        this.createDefaultAdmin();
    }

    async createDefaultAdmin() {
        const password = 'admin123';
        const hashedPassword = await bcrypt.hash(password, 10);
        
        this.db.run(
            `INSERT OR IGNORE INTO users (id, username, password_hash, role) 
             VALUES (?, ?, ?, ?)`,
            [uuidv4(), 'admin', hashedPassword, 'admin'],
            (err) => {
                if (err) {
                    console.error('❌ Erro ao criar admin padrão:', err);
                } else {
                    console.log('👤 Admin padrão criado: admin/admin123');
                }
            }
        );
    }

    // Métodos para Restaurantes
    createRestaurant(restaurantData) {
        return new Promise((resolve, reject) => {
            const id = uuidv4();
            const { name, menu_url, opening_hours, food_emoji, welcome_message, phone_number } = restaurantData;
            
            this.db.run(
                `INSERT INTO restaurants (id, name, menu_url, opening_hours, food_emoji, welcome_message, phone_number)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [id, name, menu_url, opening_hours, food_emoji || '🍽️', welcome_message, phone_number],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ id, ...restaurantData });
                    }
                }
            );
        });
    }

    getAllRestaurants() {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM restaurants ORDER BY created_at DESC`,
                [],
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                }
            );
        });
    }

    getRestaurantById(id) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT * FROM restaurants WHERE id = ?`,
                [id],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                }
            );
        });
    }

    updateRestaurant(id, updates) {
        return new Promise((resolve, reject) => {
            const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(updates);
            values.push(id);

            this.db.run(
                `UPDATE restaurants SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                values,
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ changes: this.changes });
                    }
                }
            );
        });
    }

    deleteRestaurant(id) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `DELETE FROM restaurants WHERE id = ?`,
                [id],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ changes: this.changes });
                    }
                }
            );
        });
    }

    // Métodos para Cooldown
    setCooldown(restaurantId, clientPhone, timestamp) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT OR REPLACE INTO cooldowns (id, restaurant_id, client_phone, last_message_time)
                 VALUES (?, ?, ?, ?)`,
                [uuidv4(), restaurantId, clientPhone, timestamp],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ id: this.lastID });
                    }
                }
            );
        });
    }

    getCooldown(restaurantId, clientPhone) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT * FROM cooldowns WHERE restaurant_id = ? AND client_phone = ?`,
                [restaurantId, clientPhone],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                }
            );
        });
    }

    // Métodos para Autenticação
    async authenticateUser(username, password) {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT * FROM users WHERE username = ?`,
                [username],
                async (err, user) => {
                    if (err) {
                        reject(err);
                    } else if (!user) {
                        resolve(null);
                    } else {
                        const isValid = await bcrypt.compare(password, user.password_hash);
                        resolve(isValid ? user : null);
                    }
                }
            );
        });
    }

    // Atualizar status da sessão
    updateSessionStatus(restaurantId, isActive) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `UPDATE restaurants SET session_active = ? WHERE id = ?`,
                [isActive ? 1 : 0, restaurantId],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ changes: this.changes });
                    }
                }
            );
        });
    }

    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('❌ Erro ao fechar banco:', err);
                } else {
                    console.log('✅ Banco de dados fechado');
                }
            });
        }
    }
}

module.exports = Database;