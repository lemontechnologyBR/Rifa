/**
 * Modelo legado SQLite (deprecated). A aplicação usa services/rifaService.js (Prisma).
 * Mantido apenas para CRUD legado; sorteio e fluxos ativos estão no serviço.
 */

const { getDb, withTransaction } = require('./db');

const Rifa = {
  /** Lista todas as rifas ordenadas por data de criação */
  listarTodas() {
    const db = getDb();
    return db.prepare('SELECT * FROM rifas ORDER BY created_at DESC').all();
  },

  /** Lista rifas ativas para a área pública */
  listarAtivas() {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM rifas WHERE status = 'ativa' ORDER BY data_sorteio ASC
    `).all();
  },

  /** Busca rifa por ID */
  buscarPorId(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM rifas WHERE id = ?').get(id);
  },

  /** Conta números disponíveis de uma rifa */
  contarDisponiveis(rifaId) {
    const db = getDb();
    const row = db.prepare(`
      SELECT COUNT(*) as total FROM numeros
      WHERE rifa_id = ? AND status = 'disponivel'
    `).get(rifaId);
    return row.total;
  },

  /** Cria nova rifa e gera os números */
  criar(dados) {
    const db = getDb();
    const { titulo, descricao, imagem_url, valor_cota, total_numeros, data_sorteio, chave_pix } = dados;

    return withTransaction(() => {
      const result = db.prepare(`
        INSERT INTO rifas (titulo, descricao, imagem_url, valor_cota, total_numeros, data_sorteio, chave_pix)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(titulo, descricao, imagem_url, valor_cota, total_numeros, data_sorteio, chave_pix);

      const rifaId = result.lastInsertRowid;
      const insertNumero = db.prepare(`
        INSERT INTO numeros (rifa_id, numero, status) VALUES (?, ?, 'disponivel')
      `);

      for (let i = 1; i <= total_numeros; i++) {
        insertNumero.run(rifaId, i);
      }

      return rifaId;
    });
  },

  /** Atualiza dados da rifa (não altera quantidade de números) */
  atualizar(id, dados) {
    const db = getDb();
    const { titulo, descricao, imagem_url, valor_cota, data_sorteio, chave_pix } = dados;

    return db.prepare(`
      UPDATE rifas SET titulo = ?, descricao = ?, imagem_url = ?, valor_cota = ?,
      data_sorteio = ?, chave_pix = ? WHERE id = ?
    `).run(titulo, descricao, imagem_url, valor_cota, data_sorteio, chave_pix, id);
  },

  /** Exclui rifa e dados relacionados (CASCADE) */
  excluir(id) {
    const db = getDb();
    return db.prepare('DELETE FROM rifas WHERE id = ?').run(id);
  },

  /** Estatísticas para o dashboard */
  obterEstatisticas(rifaId) {
    const db = getDb();
    return db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'disponivel' THEN 1 ELSE 0 END) as disponiveis,
        SUM(CASE WHEN status = 'reservado' THEN 1 ELSE 0 END) as reservados,
        SUM(CASE WHEN status = 'vendido' THEN 1 ELSE 0 END) as vendidos
      FROM numeros WHERE rifa_id = ?
    `).get(rifaId);
  }
};

module.exports = Rifa;
