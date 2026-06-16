/**
 * Modelo de Reservas — gerenciamento de pagamentos e participantes.
 */

const { getDb, withTransaction } = require('./db');

const Reserva = {
  /** Busca reserva por ID com dados completos */
  buscarPorId(id) {
    const db = getDb();
    const reserva = db.prepare(`
      SELECT r.*, u.nome as usuario_nome, u.telefone, u.chave_pix as usuario_chave_pix,
             rf.titulo as rifa_titulo, rf.chave_pix as rifa_chave_pix, rf.valor_cota
      FROM reservas r
      JOIN usuarios u ON r.usuario_id = u.id
      JOIN rifas rf ON r.rifa_id = rf.id
      WHERE r.id = ?
    `).get(id);

    if (!reserva) return null;

    reserva.numeros = db.prepare(`
      SELECT n.numero FROM numeros n
      JOIN reserva_numeros rn ON rn.numero_id = n.id
      WHERE rn.reserva_id = ?
      ORDER BY n.numero ASC
    `).all(id).map((n) => n.numero);

    return reserva;
  },

  /** Lista todas as reservas de uma rifa (para o painel admin) */
  listarPorRifa(rifaId) {
    const db = getDb();
    const reservas = db.prepare(`
      SELECT r.*, u.nome as usuario_nome, u.telefone, u.chave_pix as usuario_chave_pix
      FROM reservas r
      JOIN usuarios u ON r.usuario_id = u.id
      WHERE r.rifa_id = ?
      ORDER BY r.created_at DESC
    `).all(rifaId);

    for (const reserva of reservas) {
      reserva.numeros = db.prepare(`
        SELECT n.numero FROM numeros n
        JOIN reserva_numeros rn ON rn.numero_id = n.id
        WHERE rn.reserva_id = ?
        ORDER BY n.numero ASC
      `).all(reserva.id).map((n) => n.numero);
    }

    return reservas;
  },

  /** Confirma pagamento — números passam para status 'vendido' */
  confirmarPagamento(reservaId) {
    const db = getDb();

    withTransaction(() => {
      const reserva = db.prepare('SELECT * FROM reservas WHERE id = ?').get(reservaId);
      if (!reserva) throw new Error('Reserva não encontrada.');
      if (reserva.status_pagamento !== 'pendente') {
        throw new Error('Esta reserva não está pendente.');
      }

      db.prepare(`
        UPDATE reservas SET status_pagamento = 'confirmado' WHERE id = ?
      `).run(reservaId);

      // Atualiza números para vendido
      const numeroIds = db.prepare(`
        SELECT numero_id FROM reserva_numeros WHERE reserva_id = ?
      `).all(reservaId);

      for (const { numero_id } of numeroIds) {
        db.prepare(`
          UPDATE numeros SET status = 'vendido' WHERE id = ?
        `).run(numero_id);
      }
    });
  },

  /** Cancela reserva — libera os números */
  cancelar(reservaId) {
    const db = getDb();

    withTransaction(() => {
      const reserva = db.prepare('SELECT * FROM reservas WHERE id = ?').get(reservaId);
      if (!reserva) throw new Error('Reserva não encontrada.');

      db.prepare(`
        UPDATE reservas SET status_pagamento = 'cancelado' WHERE id = ?
      `).run(reservaId);

      const numeroIds = db.prepare(`
        SELECT numero_id FROM reserva_numeros WHERE reserva_id = ?
      `).all(reservaId);

      for (const { numero_id } of numeroIds) {
        db.prepare(`
          UPDATE numeros SET status = 'disponivel', usuario_id = NULL, reservado_ate = NULL
          WHERE id = ?
        `).run(numero_id);
      }
    });
  }
};

module.exports = Reserva;
