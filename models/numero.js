/**
 * Modelo de Números — reserva temporária, compra e liberação.
 */

const { getDb, withTransaction } = require('./db');

const Numero = {
  /** Lista todos os números de uma rifa */
  listarPorRifa(rifaId) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM numeros WHERE rifa_id = ? ORDER BY numero ASC
    `).all(rifaId);
  },

  /**
   * Libera reservas temporárias expiradas (sem reserva vinculada).
   * Chamado automaticamente antes de operações críticas.
   */
  limparReservasExpiradas(rifaId) {
    const db = getDb();

    // Números reservados temporariamente (com reservado_ate) que expiraram
    // e não estão vinculados a uma reserva confirmada
    db.prepare(`
      UPDATE numeros SET status = 'disponivel', reservado_ate = NULL, usuario_id = NULL
      WHERE rifa_id = ?
        AND status = 'reservado'
        AND reservado_ate IS NOT NULL
        AND datetime(reservado_ate) < datetime('now', 'localtime')
        AND id NOT IN (SELECT numero_id FROM reserva_numeros)
    `).run(rifaId);
  },

  /**
   * Reserva temporária de números (15 minutos) — usado no carrinho/modal.
   */
  reservarTemporario(rifaId, numeros) {
    const db = getDb();
    this.limparReservasExpiradas(rifaId);

    const reservadoAte = new Date(Date.now() + 15 * 60 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');

    return withTransaction(() => {
      const reservados = [];

      for (const num of numeros) {
        const registro = db.prepare(`
          SELECT * FROM numeros WHERE rifa_id = ? AND numero = ?
        `).get(rifaId, num);

        if (!registro) throw new Error(`Número ${num} não existe.`);
        if (registro.status !== 'disponivel') {
          // Permite renovar se já está reservado temporariamente (mesmo carrinho)
          if (registro.status === 'reservado' && registro.reservado_ate) {
            db.prepare(`
              UPDATE numeros SET reservado_ate = ? WHERE id = ?
            `).run(reservadoAte, registro.id);
            reservados.push(num);
            continue;
          }
          throw new Error(`Número ${num} não está disponível.`);
        }

        db.prepare(`
          UPDATE numeros SET status = 'reservado', reservado_ate = ? WHERE id = ?
        `).run(reservadoAte, registro.id);

        reservados.push(num);
      }

      return { numeros: reservados, expiraEm: reservadoAte };
    });
  },

  /** Renova o tempo de reserva temporária */
  renovarReserva(rifaId, numeros) {
    return this.reservarTemporario(rifaId, numeros);
  },

  /**
   * Libera números reservados temporariamente (usuário fechou modal ou expirou).
   */
  liberarTemporario(rifaId, numeros) {
    const db = getDb();

    withTransaction(() => {
      for (const num of numeros) {
        const registro = db.prepare(`
          SELECT n.* FROM numeros n
          LEFT JOIN reserva_numeros rn ON rn.numero_id = n.id
          WHERE n.rifa_id = ? AND n.numero = ? AND rn.id IS NULL
        `).get(rifaId, num);

        if (registro && registro.status === 'reservado' && registro.reservado_ate) {
          db.prepare(`
            UPDATE numeros SET status = 'disponivel', reservado_ate = NULL WHERE id = ?
          `).run(registro.id);
        }
      }
    });
  },

  /**
   * Confirma compra — cria reserva pendente e mantém números como reservados.
   */
  confirmarCompra(rifaId, numeros, usuarioId, valorTotal) {
    const db = getDb();
    this.limparReservasExpiradas(rifaId);

    return withTransaction(() => {
      // Verifica disponibilidade (devem estar reservados temporariamente ou disponíveis)
      const numeroIds = [];

      for (const num of numeros) {
        const registro = db.prepare(`
          SELECT * FROM numeros WHERE rifa_id = ? AND numero = ?
        `).get(rifaId, num);

        if (!registro) throw new Error(`Número ${num} não existe.`);

        const podeComprar =
          registro.status === 'disponivel' ||
          (registro.status === 'reservado' && registro.reservado_ate);

        if (!podeComprar) {
          throw new Error(`Número ${num} não está disponível para compra.`);
        }

        numeroIds.push(registro.id);
      }

      // Cria a reserva com pagamento pendente
      const reservaResult = db.prepare(`
        INSERT INTO reservas (usuario_id, rifa_id, valor_total, status_pagamento)
        VALUES (?, ?, ?, 'pendente')
      `).run(usuarioId, rifaId, valorTotal);

      const reservaId = reservaResult.lastInsertRowid;

      // Vincula números à reserva e mantém status reservado (aguardando pagamento)
      for (const numeroId of numeroIds) {
        db.prepare(`
          UPDATE numeros SET status = 'reservado', reservado_ate = NULL, usuario_id = ?
          WHERE id = ?
        `).run(usuarioId, numeroId);

        db.prepare(`
          INSERT INTO reserva_numeros (reserva_id, numero_id) VALUES (?, ?)
        `).run(reservaId, numeroId);
      }

      return reservaId;
    });
  }
};

module.exports = Numero;
