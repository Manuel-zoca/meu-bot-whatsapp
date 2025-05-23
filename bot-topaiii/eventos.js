require('dotenv').config();
const axios = require('axios');
const { salvarContato, salvarMensagem, verificarRepeticao, verificarLimiteHorario } = require('./db-handler');

const modelosFree = [
  'deepseek/deepseek-chat:free',
];

let modeloAtualIndex = 0;

const SYSTEM_PROMPT = `
Você é o Topai Bot 🤖, assistente inteligente e profissional do serviço de internet TOPAI NET_GIGAS.

Seu objetivo é ajudar o cliente a entender e comprar pacotes de internet, com respostas:
- Curtas, diretas e no estilo WhatsApp,
- Sempre úteis e focadas na solução do cliente,
- Sem exageros, emojis excessivos ou textos longos.

---

🔹 MENU DE OPÇÕES (responda com o número correspondente para orientar o cliente):

1️⃣ Tabela de Pacotes de Internet  
2️⃣ Pacotes de Netflix (informações básicas)  
3️⃣ Entrar no Grupo Oficial do TOPAI NET_GIGAS  
4️⃣ Obter Chatbot Assistente  
5️⃣ Falar com o Responsável / Meu Chefe  
`;

async function enviarParaLLM(pergunta, opcaoMenu = null) {
  let tentativas = 0;

  while (tentativas < modelosFree.length) {
    const modelo = modelosFree[modeloAtualIndex];
    console.log(`🤖 Modelo atual: ${modelo}`);

    try {
      const promptFinal = opcaoMenu
        ? `${opcaoMenu} - Cliente selecionou a opção ${opcaoMenu}`
        : pergunta;

      const resposta = await axios.post(
        process.env.MODEL_PROVIDER_URL,
        {
          model: modelo,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: promptFinal }
          ],
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return resposta.data.choices[0].message.content.trim();
    } catch (err) {
      const erroLimite = err.response?.status === 429;
      console.warn(`⚠️ Erro ao usar modelo ${modelo}: ${err.message}`);

      if (erroLimite) {
        modeloAtualIndex = (modeloAtualIndex + 1) % modelosFree.length;
        console.log(`🔁 Trocando para o próximo modelo: ${modelosFree[modeloAtualIndex]}`);
        tentativas++;
      } else {
        throw err;
      }
    }
  }

  return 'Desculpe, todos os modelos estão ocupados no momento. Tente novamente em breve.';
}

async function handleMessage(sock, mensagem) {
  const texto = mensagem.message?.conversation || mensagem.message?.extendedTextMessage?.text;
  const numero = mensagem.key.remoteJid;

  if (!texto || !numero) return;

  const telefone = numero.replace('@s.whatsapp.net', '');

  console.log(`📩 ${telefone} → ${texto}`);

  try {
    // Salvar contato primeiro
    await salvarContato(telefone);

    // Verificar limite de 10 mensagens/hora
    const limiteExcedido = await verificarLimiteHorario(telefone);
    if (limiteExcedido) {
      await sock.sendMessage(numero, {
        text: 'Você atingiu o limite de interações por hora. Tente novamente mais tarde.'
      });
      return;
    }

    // Verificar repetição nas últimas 30 minutos
    const repetida = await verificarRepeticao(telefone, texto);
    if (repetida) {
      await sock.sendMessage(numero, {
        text: 'Você já perguntou isso recentemente. Posso ajudar com outra coisa?'
      });
      return;
    }

    // Salvar a mensagem após todas as verificações
    await salvarMensagem(telefone, texto);

    // Mostrar "digitando"
    await sock.presenceSubscribe(numero);
    await sock.sendPresenceUpdate('composing', numero);
    await new Promise((r) => setTimeout(r, 3000));

    let resposta = '';
    const limpo = texto.trim().toLowerCase();

    switch (limpo) {
      case '1':
        resposta = await enviarParaLLM(null, '1');
        break;

      case '2':
        resposta = await enviarParaLLM(null, '2');
        break;

      case '3':
        resposta = await enviarParaLLM(null, '3');
        break;

      case '4':
        resposta = await enviarParaLLM(null, '4');
        break;

      case '5':
        resposta = await enviarParaLLM(null, '5');
        break;

      case 'já paguei':
      case 'paguei':
        resposta = `Envie o comprovante da transferência bancária com seu contacto para confirmação.`;
        break;

      default:
        resposta = await enviarParaLLM(texto);
        break;
    }

    await sock.sendMessage(numero, { text: resposta });
    await sock.sendPresenceUpdate('paused', numero);

  } catch (error) {
    console.error('❌ Erro ao responder mensagem:', error.message);
    await sock.sendMessage(numero, {
      text: 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente mais tarde.',
    });
  }
}

module.exports = { handleMessage };
