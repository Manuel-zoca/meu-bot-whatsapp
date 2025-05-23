// Carrega variáveis de ambiente
require('dotenv').config();

// Módulos necessários
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcodeTerminal = require('qrcode-terminal'); // Mostra QR no terminal
const fs = require('fs'); // Pra salvar o QR como imagem
const qrcode = require('qrcode'); // Gera QR em Base64
const { handleMessage } = require('./eventos');

// Modelos gratuitos da OpenRouter
const modelosFree = [
  'deepseek/deepseek-chat:free',
  'mistralai/mistral-7b-instruct-v0.2',
  'google/gemma-7b-it'
];

let modeloAtualIndex = 0;

async function iniciarBot() {
  console.log('🔄 Iniciando bot...');

  const { state, saveCreds } = await useMultiFileAuthState('auth');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false, // Vamos gerar o QR manualmente
    browser: ['Baileys', 'Chrome', '1.0.0']
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📷 QR CODE RECEBIDO - Cole no site para escanear:\n');

      try {
        const qrBase64 = await qrcode.toDataURL(qr);
        console.log('🖼️ Cole isso no site: https://codebeautify.org/dataurlviewer  ou https://whatzapp.com.br/whatsapp-qr-code-reader \n');
        console.log(qrBase64); // Isso aparece no log do Render
      } catch (err) {
        console.error('❌ Erro ao gerar QR:', err.message);
      }

      console.log('\n📲 Escaneando o QR no terminal também:\n');
      qrcodeTerminal.generate(qr, { small: true });
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
        iniciarBot(); // Reconecta após delay
      }, 5000);
    } else if (connection === 'open') {
      console.log('✅ Bot conectado com sucesso!');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async (m) => {
    const mensagem = m.messages[0];

    // Ignora mensagens vazias, do próprio bot ou grupos
    if (!mensagem.message || mensagem.key.fromMe || mensagem.key.remoteJid.includes('@g.us')) return;

    const modeloAtual = modelosFree[modeloAtualIndex % modelosFree.length];
    console.log(`\n📩 Nova mensagem de ${mensagem.key.remoteJid}`);
    console.log(`🤖 Modelo atual: ${modeloAtual}`);

    try {
      await handleMessage(sock, mensagem, modeloAtual);
      modeloAtualIndex++;
    } catch (err) {
      console.error('❌ Erro ao responder:', err.message || err);
    }
  });
}

iniciarBot();