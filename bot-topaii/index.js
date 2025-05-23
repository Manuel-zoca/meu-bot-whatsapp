// Carrega as variáveis de ambiente do .env
require('dotenv').config();

// Módulos necessários
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { handleMessage } = require('./eventos');
const { callOpenRouter } = require('./openrouter');

// Modelos gratuitos que você quer usar
const modelosFree = [
  'deepseek/deepseek-chat:free',
  'mistralai/mistral-7b-instruct-v0.2',
  'google/gemma-7b-it'
];

let modeloAtualIndex = 0;

async function iniciarBot() {
  console.log('🔄 Iniciando bot...');

  // Configura persistência da sessão em pasta local
  const { state, saveCreds } = await useMultiFileAuthState('auth');

  // Cria o socket do WhatsApp
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false, // Deixa o QR só no terminal
    browser: ['Baileys', 'Chrome', '1.0.0'] // Navegador simulado
  });

  // Eventos principais do Baileys
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📲 Escaneie este QR code com o WhatsApp no celular:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;

      if (statusCode === DisconnectReason.loggedOut) {
        console.log('⛔ Sessão desconectada (logout). Você precisa escanear o QR novamente.');
        return;
      }

      if (statusCode === 409 || (lastDisconnect?.error?.output?.payload?.reason === 'replaced')) {
        console.log('⛔ Conflito detectado: sessão substituída em outro lugar. Não reconectando automaticamente.');
        return;
      }

      console.log('⚠️ Conexão encerrada inesperadamente. Tentando reconectar...');
      setTimeout(() => {
        iniciarBot(); // Tenta reconectar
      }, 5000);
    } else if (connection === 'open') {
      console.log('✅ Bot conectado com sucesso!');
    }
  });

  // Salva credenciais quando mudarem
  sock.ev.on('creds.update', saveCreds);

  // Evento de mensagens
  sock.ev.on('messages.upsert', async (m) => {
    const mensagem = m.messages[0];

    // Ignora mensagens vazias, do próprio bot ou de grupos
    if (!mensagem.message || mensagem.key.fromMe || mensagem.key.remoteJid.includes('@g.us')) return;

    const modeloAtual = modelosFree[modeloAtualIndex % modelosFree.length];
    console.log(`\n📩 Nova mensagem de ${mensagem.key.remoteJid}`);
    console.log(`🤖 Usando modelo: ${modeloAtual}`);

    try {
      await handleMessage(sock, mensagem, modeloAtual);
      modeloAtualIndex = (modeloAtualIndex + 1) % modelosFree.length;
    } catch (err) {
      console.error('❌ Erro ao processar mensagem:', err.message || err);
    }
  });
}

// Inicia o bot
iniciarBot();
