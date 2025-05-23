require('dotenv').config();
const mysql = require('mysql2/promise');

// Cria pool de conexões MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

function normalizarTelefone(tel) {
  if (!tel) return '';
  return tel.toString().replace(/\D/g, '');
}

async function salvarContato(telefone, nome = null) {
  try {
    const telNorm = normalizarTelefone(telefone);

    const [result] = await pool.query(
      `INSERT INTO contatos (telefone, nome) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE 
         ultima_interacao = CURRENT_TIMESTAMP, 
         nome = IF(VALUES(nome) IS NOT NULL AND VALUES(nome) != '', VALUES(nome), nome)`,
      [telNorm, nome]
    );

    return result.insertId || null;
  } catch (err) {
    console.error('Erro salvarContato:', err);
    return null;
  }
}

async function salvarMensagem(telefone, mensagem, intencao = null) {
  try {
    const telNorm = normalizarTelefone(telefone);

    // Busca id do contato pelo telefone normalizado
    const [rows] = await pool.query('SELECT id FROM contatos WHERE telefone = ?', [telNorm]);
    let contato_id;

    if (rows.length === 0) {
      contato_id = await salvarContato(telNorm);
      if (!contato_id) {
        throw new Error('Não foi possível criar contato para salvar mensagem.');
      }
    } else {
      contato_id = rows[0].id;
    }

    // Insere a mensagem relacionada ao contato
    await pool.query(
      'INSERT INTO conversas (contato_id, mensagem, intencao) VALUES (?, ?, ?)',
      [contato_id, mensagem, intencao]
    );
  } catch (err) {
    console.error('Erro salvarMensagem:', err);
  }
}

// Verifica se a mensagem é repetida nos últimos 30 minutos
async function verificarRepeticao(telefone, texto) {
  try {
    const telNorm = normalizarTelefone(telefone);

    const [rows] = await pool.query(`
      SELECT mensagem, UNIX_TIMESTAMP(data_hora) AS ts FROM conversas c
      JOIN contatos ct ON c.contato_id = ct.id
      WHERE ct.telefone = ?
      ORDER BY c.data_hora DESC LIMIT 5
    `, [telNorm]);

    const agoraTs = Math.floor(Date.now() / 1000);
    const limiteSegundos = 30 * 60; // 30 minutos

    if (rows.length === 0) return false;

    for (const row of rows) {
      if (row.mensagem.trim() === texto.trim()) {
        const diferencaTempo = agoraTs - row.ts;
        if (diferencaTempo <= limiteSegundos) {
          console.log(`⚠️ Mensagem repetida detectada para ${telNorm}: "${texto}"`);
          return true;
        }
      }
    }

    return false;
  } catch (err) {
    console.error('Erro verificarRepeticao:', err);
    return false;
  }
}

// Verifica se o contato excedeu o limite de 10 mensagens/hora
async function verificarLimiteHorario(telefone) {
  try {
    const telNorm = normalizarTelefone(telefone);

    const [rows] = await pool.query(`
      SELECT COUNT(*) AS total FROM conversas c
      JOIN contatos ct ON c.contato_id = ct.id
      WHERE ct.telefone = ? AND c.data_hora >= NOW() - INTERVAL 1 HOUR
    `, [telNorm]);

    const limiteMensagensPorHora = 50;
    const totalMensagens = rows[0]?.total || 0;

    if (totalMensagens >= limiteMensagensPorHora) {
      console.log(`🚫 Limite de mensagens por hora atingido para ${telNorm}`);
      return true;
    }

    return false;
  } catch (err) {
    console.error('Erro verificarLimiteHorario:', err);
    return false;
  }
}

module.exports = {
  pool,
  salvarContato,
  salvarMensagem,
  verificarRepeticao,
  verificarLimiteHorario
};
