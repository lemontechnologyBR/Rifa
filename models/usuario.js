/**
 * Modelo de Usuários (participantes das rifas).
 */

const { getDb } = require('./db');

const Usuario = {
  /** Busca ou cria usuário pelo telefone */
  buscarOuCriar(nome, telefone, chavePix = null) {
    const db = getDb();
    const telefoneLimpo = telefone.replace(/\D/g, '');

    let usuario = db.prepare('SELECT * FROM usuarios WHERE telefone = ?').get(telefoneLimpo);

    if (usuario) {
      // Atualiza nome se diferente
      if (usuario.nome !== nome) {
        db.prepare('UPDATE usuarios SET nome = ? WHERE id = ?').run(nome, usuario.id);
        usuario.nome = nome;
      }
      if (chavePix && usuario.chave_pix !== chavePix) {
        db.prepare('UPDATE usuarios SET chave_pix = ? WHERE id = ?').run(chavePix, usuario.id);
      }
      return usuario;
    }

    const result = db.prepare(`
      INSERT INTO usuarios (nome, telefone, chave_pix) VALUES (?, ?, ?)
    `).run(nome, telefoneLimpo, chavePix);

    return db.prepare('SELECT * FROM usuarios WHERE id = ?').get(result.lastInsertRowid);
  },

  /** Busca reservas de um usuário pelo telefone */
  buscarReservasPorTelefone(telefone) {
    const db = getDb();
    const telefoneLimpo = telefone.replace(/\D/g, '');

    const usuario = db.prepare('SELECT * FROM usuarios WHERE telefone = ?').get(telefoneLimpo);
    if (!usuario) return { usuario: null, reservas: [] };

    const reservas = db.prepare(`
      SELECT r.*, rf.titulo as rifa_titulo, rf.status as rifa_status,
             rf.numero_sorteado, rf.ganhador_nome, rf.chave_pix as rifa_chave_pix,
             rf.data_sorteio, rf.valor_cota
      FROM reservas r
      JOIN rifas rf ON r.rifa_id = rf.id
      WHERE r.usuario_id = ?
      ORDER BY r.created_at DESC
    `).all(usuario.id);

    // Adiciona números de cada reserva
    for (const reserva of reservas) {
      reserva.numeros = db.prepare(`
        SELECT n.numero FROM numeros n
        JOIN reserva_numeros rn ON rn.numero_id = n.id
        WHERE rn.reserva_id = ?
        ORDER BY n.numero ASC
      `).all(reserva.id).map((n) => n.numero);

      reserva.ganhou = reserva.rifa_status === 'finalizada' &&
        reserva.numeros.includes(reserva.numero_sorteado) &&
        reserva.status_pagamento === 'confirmado';
    }

    return { usuario, reservas };
  }
};

module.exports = Usuario;
