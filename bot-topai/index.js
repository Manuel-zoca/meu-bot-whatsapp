require('dotenv').config();
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { handleMessage } = require('./eventos');
const { callOpenRouter } = require('./openrouter');

const modelosFree = [
  'deepseek/deepseek-chat:free',
];

let modeloAtualIndex = 0;

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');

  const sock = makeWASocket({
    auth: state,
  });

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
        return; // Não reconectar automaticamente
      }

      if (statusCode === 409 || (lastDisconnect?.error?.output?.payload?.reason === 'replaced')) {
        console.log('⛔ Conflito detectado: sessão substituída em outro lugar. Não reconectando automaticamente.');
        return; // Evita loop de reconexão
      }

      console.log('⛔ Conexão encerrada inesperadamente. Tentando reconectar...');
      iniciarBot();

    } else if (connection === 'open') {
      console.log('✅ Bot conectado com sucesso!');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async (m) => {
    const mensagem = m.messages[0];

    // Ignora mensagens vazias, enviadas pelo próprio bot ou grupos
    if (!mensagem.message || mensagem.key.fromMe || mensagem.key.remoteJid.includes('@g.us')) return;

    const modeloAtual = modelosFree[modeloAtualIndex];
    console.log(`\n📩 Nova mensagem de ${mensagem.key.remoteJid}`);
    console.log(`🤖 Usando modelo: ${modeloAtual}`);

    try {
      await handleMessage(sock, mensagem, modeloAtual);
    } catch (err) {
      console.error('Erro ao processar mensagem:', err);
    }
  });
}

iniciarBot();
