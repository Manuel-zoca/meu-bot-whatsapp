const axios = require('axios');
require('dotenv').config();

// Carrega múltiplas chaves do .env
const apiKeys = [
  process.env.OPENROUTER_API_KEY,
].filter(Boolean); // Remove valores vazios ou undefined

console.log('🔐 API keys carregadas:', apiKeys.map(k => k.slice(0, 10) + '...'));

if (apiKeys.length === 0) {
  throw new Error(
    '❌ Nenhuma API key encontrada no .env. Por favor, configure OPENROUTER_API_KEY_1, OPENROUTER_API_KEY_2, etc.'
  );
}

const MODEL_TO_USE = "deepseek/deepseek-chat:free"; // Mais confiável pra testes
const FALLBACK_MODEL = "deepseek/deepseek-chat:free";

async function callOpenRouter(userMessage) {
  for (let i = 0; i < apiKeys.length; i++) {
    const apiKey = apiKeys[i];

    try {
      console.log(`🟢 Tentando com a chave: ${apiKey.slice(0, 10)}...`);

      const response = await axios.post(
        process.env.MODEL_PROVIDER_URL || 'https://openrouter.ai/api/v1/chat/completions ',
        {
          model: MODEL_TO_USE,
          messages: [{ role: 'user', content: userMessage }],
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.HTTP_REFERER || 'http://localhost:3000',
            'X-Title': process.env.X_TITLE || 'Meu App Legal',
          },
          timeout: 15000,
        }
      );

      return response.data;

    } catch (err) {
      const status = err.response?.status;
      const apiKeyShort = apiKey.slice(0, 10);

      if (status === 401) {
        console.error(`❌ Chave inválida ou expirada: ${apiKeyShort}...`);
        continue;
      }

      if (status === 429) {
        console.warn(`🚫 Limite atingido para a chave: ${apiKeyShort}...`);
        continue;
      }

      if (err.code === 'ECONNABORTED') {
        console.warn(`⚠️ Timeout com a chave: ${apiKeyShort}...`);
        continue;
      }

      console.error(`❌ Erro desconhecido com a chave ${apiKeyShort}:`, err.message);
      continue;
    }
  }

  // Se todas as chaves falharem, tenta com modelo alternativo
  console.log('🔄 Todos os modelos principais falharam. Tentando com modelo alternativo...');
  try {
    const fallbackResponse = await axios.post(
      process.env.MODEL_PROVIDER_URL || 'https://openrouter.ai/api/v1/chat/completions ',
      {
        model: FALLBACK_MODEL,
        messages: [{ role: 'user', content: userMessage }],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKeys[0]}`, // Usa a primeira disponível
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.HTTP_REFERER || 'http://localhost:3000',
          'X-Title': process.env.X_TITLE || 'Meu App Legal',
        },
        timeout: 15000,
      }
    );

    return fallbackResponse.data;

  } catch (fallbackError) {
    console.error('❌ Falha também no modelo alternativo:', fallbackError.message);
    throw new Error('Todas as chaves e modelos falharam.');
  }
}

module.exports = { callOpenRouter };