// Servidor simples usando apenas módulos nativos do Node.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 3000;

// HTML da página com QR Code inline
const htmlContent = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SigSushi Bot - Conectar WhatsApp</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #333;
        }

        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
            text-align: center;
            max-width: 500px;
            width: 90%;
        }

        .logo {
            font-size: 2.5rem;
            font-weight: bold;
            color: #25D366;
            margin-bottom: 10px;
        }

        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 1.1rem;
        }

        .status {
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 30px;
            font-weight: 500;
            background: #fff3cd;
            color: #856404;
            border: 2px solid #ffeaa7;
        }

        .qr-container {
            background: #f8f9fa;
            border-radius: 15px;
            padding: 30px;
            margin: 30px 0;
            border: 3px dashed #25D366;
        }

        #qrcode {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 200px;
        }

        .instructions {
            background: #e3f2fd;
            border-radius: 10px;
            padding: 20px;
            margin-top: 20px;
            text-align: left;
        }

        .instructions h3 {
            color: #1976d2;
            margin-bottom: 15px;
            text-align: center;
        }

        .instructions ol {
            margin-left: 20px;
        }

        .instructions li {
            margin-bottom: 8px;
            line-height: 1.5;
        }

        .footer {
            margin-top: 30px;
            color: #666;
            font-size: 0.9rem;
        }

        .refresh-btn {
            background: #25D366;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1rem;
            margin-top: 20px;
        }

        .refresh-btn:hover {
            background: #1fa851;
        }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
</head>
<body>
    <div class="container">
        <div class="logo">🍣 SigSushi Bot</div>
        <div class="subtitle">Conectar WhatsApp</div>
        
        <div class="status">
            📱 Execute o bot.js e o QR Code aparecerá aqui
        </div>

        <div class="qr-container">
            <div id="qrcode">
                <canvas id="qr-canvas"></canvas>
            </div>
        </div>

        <button class="refresh-btn" onclick="generateTestQR()">
            🔄 Gerar QR Code de Teste
        </button>

        <div class="instructions">
            <h3>📱 Como conectar:</h3>
            <ol>
                <li>Execute <strong>npm start</strong> no terminal</li>
                <li>Abra o <strong>WhatsApp</strong> no seu celular</li>
                <li>Toque no menu <strong>(⋮)</strong> ou <strong>Configurações</strong></li>
                <li>Selecione <strong>"Aparelhos conectados"</strong></li>
                <li>Toque em <strong>"Conectar um aparelho"</strong></li>
                <li>Aponte a câmera para o <strong>QR Code acima</strong></li>
            </ol>
        </div>

        <div class="footer">
            Para usar com o bot real, execute: npm start<br>
            Esta página se conectará automaticamente ao bot
        </div>
    </div>

    <script>
        function generateTestQR() {
            const canvas = document.getElementById('qr-canvas');
            const testData = 'Test QR Code - ' + new Date().toLocaleString();
            
            QRCode.toCanvas(canvas, testData, {
                width: 256,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            }, function (error) {
                if (error) {
                    console.error(error);
                    document.getElementById('qrcode').innerHTML = 'Erro ao gerar QR Code';
                } else {
                    console.log('QR Code gerado com sucesso!');
                }
            });
        }

        // Gera QR de teste automaticamente
        window.onload = function() {
            generateTestQR();
        };

        // Tenta conectar com WebSocket se disponível
        let socket;
        try {
            if (typeof io !== 'undefined') {
                socket = io();
                
                socket.on('qr', (qrData) => {
                    const img = document.createElement('img');
                    img.src = qrData;
                    img.style.maxWidth = '100%';
                    img.style.height = 'auto';
                    document.getElementById('qrcode').innerHTML = '';
                    document.getElementById('qrcode').appendChild(img);
                });

                socket.on('ready', () => {
                    document.querySelector('.status').innerHTML = '✅ Bot conectado e funcionando!';
                    document.querySelector('.status').style.background = '#d4edda';
                    document.querySelector('.status').style.color = '#155724';
                });
            }
        } catch (e) {
            console.log('WebSocket não disponível, usando modo standalone');
        }
    </script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(htmlContent);
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
    }
});

server.listen(port, () => {
    console.log(`🌐 Servidor rodando em: http://localhost:${port}`);
    console.log('📱 Página com QR Code de teste disponível');
    console.log('💡 Para usar com WhatsApp real, execute: npm start');
});

process.on('SIGINT', () => {
    console.log('\n🛑 Parando servidor...');
    process.exit(0);
});