# 🚀 Configuração VPS Ubuntu - Sistema Multi-Restaurante

## 📋 Pré-requisitos
- VPS Ubuntu 20.04+ 
- Acesso root ou sudo
- Pelo menos 1GB RAM
- Node.js 16+

## 🔧 Instalação no Servidor

### 1. Atualizar Sistema
```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Instalar Node.js
```bash
# Usando NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verificar instalação
node --version
npm --version
```

### 3. Instalar dependências do sistema
```bash
# Para Puppeteer (WhatsApp Web)
sudo apt install -y gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget

# Instalar Chrome
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list'
sudo apt update
sudo apt install -y google-chrome-stable
```

### 4. Instalar PM2 (Gerenciador de processos)
```bash
sudo npm install -g pm2
```

### 5. Configurar Firewall
```bash
# Permitir porta 3000
sudo ufw allow 3000

# Verificar status
sudo ufw status
```

## 📁 Deploy da Aplicação

### 1. Clonar/Enviar código
```bash
# Criar diretório
sudo mkdir -p /opt/sigsushi-bot
sudo chown $USER:$USER /opt/sigsushi-bot

# Enviar código via SCP/SFTP ou Git
cd /opt/sigsushi-bot
```

### 2. Instalar dependências
```bash
npm install
```

### 3. Configurar permissões
```bash
# Criar diretório para sessões
mkdir -p session_data
chmod 755 session_data
```

## 🚀 Executar Aplicação

### Modo Desenvolvimento
```bash
npm run dev
```

### Modo Produção com PM2
```bash
# Iniciar aplicação
pm2 start multi-restaurant-bot.js --name "sigsushi-bot"

# Salvar configuração PM2
pm2 save

# Auto-start no boot
pm2 startup
# Executar o comando sugerido pelo PM2

# Verificar status
pm2 status
pm2 logs sigsushi-bot
```

## 🌐 Configurar Nginx (Opcional)

### 1. Instalar Nginx
```bash
sudo apt install -y nginx
```

### 2. Configurar virtual host
```bash
sudo nano /etc/nginx/sites-available/sigsushi-bot
```

```nginx
server {
    listen 80;
    server_name seu-dominio.com www.seu-dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. Ativar site
```bash
sudo ln -s /etc/nginx/sites-available/sigsushi-bot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 🔐 SSL com Certbot (Opcional)
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d seu-dominio.com -d www.seu-dominio.com
```

## 📊 Monitoramento

### Logs da aplicação
```bash
pm2 logs sigsushi-bot
pm2 logs sigsushi-bot --lines 100
```

### Status do sistema
```bash
pm2 status
pm2 monit
```

### Reiniciar aplicação
```bash
pm2 restart sigsushi-bot
```

### Parar aplicação
```bash
pm2 stop sigsushi-bot
```

## 🎯 Acessos

### Interface Principal
- **URL**: `http://SEU-IP:3000` ou `https://seu-dominio.com`
- **Dashboard**: `http://SEU-IP:3000/`
- **Admin**: `http://SEU-IP:3000/admin`

### Credenciais Padrão
- **Usuário**: `admin`
- **Senha**: `admin123`

## 🔧 Comandos Úteis

### Backup do banco de dados
```bash
cp restaurants.db restaurants.db.backup.$(date +%Y%m%d_%H%M%S)
```

### Ver processos ativos
```bash
ps aux | grep node
```

### Verificar porta em uso
```bash
sudo netstat -tlnp | grep :3000
```

### Limpar sessões antigas
```bash
rm -rf session_data/restaurant_*
```

## ⚠️ Solução de Problemas

### Erro de permissão
```bash
sudo chown -R $USER:$USER /opt/sigsushi-bot
chmod -R 755 /opt/sigsushi-bot
```

### Chrome não funciona
```bash
# Instalar dependências extras
sudo apt install -y libxss1 libgconf-2-4 libxrandr2 libasound2 libpangocairo-1.0-0 libatk1.0-0 libcairo-gobject2 libgtk-3-0 libgdk-pixbuf2.0-0
```

### Porta ocupada
```bash
sudo fuser -k 3000/tcp
```

### Verificar logs de erro
```bash
pm2 logs sigsushi-bot --err
tail -f ~/.pm2/logs/sigsushi-bot-error.log
```

## 📱 Configuração de Restaurantes

1. Acesse `http://SEU-IP:3000/admin`
2. Faça login com `admin/admin123`
3. Crie seus restaurantes
4. Inicie os bots no dashboard
5. Escaneie os QR Codes

## 🔄 Atualizações

```bash
# Parar aplicação
pm2 stop sigsushi-bot

# Atualizar código
git pull  # ou enviar novos arquivos

# Instalar novas dependências
npm install

# Reiniciar
pm2 start sigsushi-bot
```