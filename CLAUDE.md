
# SigSushi Bot - Chatbot WhatsApp para Restaurantes

## Resumo Geral
Este é um chatbot automatizado para WhatsApp desenvolvido especificamente para restaurantes. O bot responde automaticamente a mensagens de clientes com informações do cardápio e dados do estabelecimento.

## Funcionalidades Principais
- **Resposta Automática**: Envia mensagem de boas-vindas personalizada com cardápio digital
- **Cooldown Inteligente**: Cada cliente recebe apenas uma resposta automática a cada 12 horas
- **Configuração Personalizável**: Fácil personalização para diferentes restaurantes
- **Prevenção de Spam**: Sistema para evitar mensagens duplicadas
- **Exclusão de Grupos**: Responde apenas mensagens privadas
- **Interface Web**: Página HTML para exibir QR Code de forma estável durante calls
- **Atualização em Tempo Real**: WebSocket para sincronizar status entre terminal e navegador

## Configurações Personalizáveis (CONFIG em bot.js)
- `MENU_URL`: Link do cardápio digital (atualmente: https://sigmenu.com/delivery/restaurante)
- `RESTAURANT_NAME`: Nome do restaurante
- `OPENING_HOURS`: Horário de funcionamento
- `FOOD_EMOJI`: Emoji representativo do tipo de comida
- `WELCOME_MESSAGE`: Template da mensagem de boas-vindas

## Tecnologias Utilizadas
- **Node.js**: Runtime JavaScript
- **whatsapp-web.js**: Biblioteca para integração com WhatsApp Web
- **qrcode-terminal**: Geração de QR Code no terminal para autenticação
- **Puppeteer**: Controle do navegador para WhatsApp Web
- **Express**: Servidor web para interface HTML
- **Socket.IO**: WebSocket para comunicação em tempo real
- **QRCode**: Geração de QR Code como imagem para interface web

## Scripts Disponíveis
- `npm start`: Inicia o bot em produção
- `npm run dev`: Inicia o bot em modo desenvolvimento (com nodemon)

## Como Funciona
1. Bot inicia servidor web na porta 3000 (http://localhost:3000)
2. Interface web exibe QR Code atualizado em tempo real
3. Usuário escaneia QR Code para conectar WhatsApp (terminal ou interface web)
4. Bot fica aguardando mensagens
5. Quando recebe mensagem privada de um cliente:
   - Verifica se não é do próprio bot
   - Verifica se não é de grupo
   - Verifica cooldown de 12h do cliente
   - Envia mensagem de boas-vindas personalizada
   - Registra timestamp para controle de cooldown

## Interface Web
- **URL**: http://localhost:3000
- **Função**: Exibe QR Code de forma estável durante videochamadas
- **Atualização**: Automática via WebSocket quando novo QR é gerado
- **Status**: Mostra estado da conexão (aguardando, conectado, erro)
- **Responsiva**: Funciona em desktop e mobile

## Arquivos Principais
- `bot.js`: Código principal do chatbot com servidor web integrado
- `package.json`: Dependências e configurações do projeto
- `public/index.html`: Interface web para exibição do QR Code
- `CLAUDE.md`: Documentação e instruções (este arquivo)
