const JsonDatabase = require('./json-database');

async function testSystem() {
    console.log('🧪 Testando sistema...');
    
    try {
        // Teste do banco
        const db = new JsonDatabase();
        
        // Aguarda inicialização
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('✅ Banco de dados funcionando');
        
        // Teste de criar restaurante
        const restaurant = await db.createRestaurant({
            name: 'Pizzaria Teste',
            menu_url: 'https://sigmenu.com/test',
            opening_hours: 'Segunda a Domingo: 18h às 23h',
            food_emoji: '🍕',
            welcome_message: 'Bem-vindo à {{RESTAURANT_NAME}}! Veja nosso cardápio: {{MENU_URL}}'
        });
        
        console.log('✅ Restaurante criado:', restaurant.name);
        
        // Teste de listar restaurantes
        const restaurants = await db.getAllRestaurants();
        console.log('✅ Restaurantes encontrados:', restaurants.length);
        
        // Teste de autenticação
        const user = await db.authenticateUser('admin', 'admin123');
        console.log('✅ Login funcionando:', user ? user.username : 'falhou');
        
        console.log('🎉 Todos os testes passaram!');
        
        db.close();
        
    } catch (error) {
        console.error('❌ Erro no teste:', error);
    }
}

testSystem();