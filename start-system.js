const MultiRestaurantBot = require('./multi-restaurant-bot');

console.log('🚀 Iniciando Sistema Multi-Restaurante...');
console.log('📱 WhatsApp Bot para múltiplos restaurantes');
console.log('🌐 Interface web será disponível em: http://localhost:3000');
console.log('👨‍💼 Admin: http://localhost:3000/admin');
console.log('🔑 Login: admin / admin123');
console.log('─'.repeat(50));

// Verifica dependências críticas
try {
    require('express');
    require('socket.io');
    require('whatsapp-web.js');
    console.log('✅ Todas as dependências encontradas');
} catch (error) {
    console.error('❌ Dependência faltando:', error.message);
    console.log('💡 Execute: npm install');
    process.exit(1);
}

// Inicia o sistema
const system = new MultiRestaurantBot();

console.log('✅ Sistema iniciado com sucesso!');
console.log('🔗 Aguardando conexões...');