/**
 * Script de inicialização do banco de dados SQLite.
 * Usa o módulo nativo node:sqlite (Node.js 22+).
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'rifas.db');

/**
 * Inicializa o banco e retorna a instância de conexão.
 */
function initDatabase() {
  // Garante que a pasta database existe
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const db = new DatabaseSync(DB_PATH);

  db.exec('PRAGMA foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS rifas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      descricao TEXT,
      imagem_url TEXT,
      valor_cota REAL NOT NULL,
      total_numeros INTEGER NOT NULL,
      data_sorteio TEXT NOT NULL,
      chave_pix TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ativa' CHECK(status IN ('ativa', 'finalizada', 'cancelada')),
      numero_sorteado INTEGER,
      ganhador_nome TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      telefone TEXT NOT NULL,
      chave_pix TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_telefone ON usuarios(telefone)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS numeros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rifa_id INTEGER NOT NULL,
      numero INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'disponivel' CHECK(status IN ('disponivel', 'reservado', 'vendido')),
      usuario_id INTEGER,
      reservado_ate TEXT,
      FOREIGN KEY (rifa_id) REFERENCES rifas(id) ON DELETE CASCADE,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      UNIQUE(rifa_id, numero)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS reservas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      rifa_id INTEGER NOT NULL,
      valor_total REAL NOT NULL,
      status_pagamento TEXT NOT NULL DEFAULT 'pendente' CHECK(status_pagamento IN ('pendente', 'confirmado', 'cancelado')),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      FOREIGN KEY (rifa_id) REFERENCES rifas(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS reserva_numeros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reserva_id INTEGER NOT NULL,
      numero_id INTEGER NOT NULL,
      FOREIGN KEY (reserva_id) REFERENCES reservas(id) ON DELETE CASCADE,
      FOREIGN KEY (numero_id) REFERENCES numeros(id) ON DELETE CASCADE,
      UNIQUE(reserva_id, numero_id)
    )
  `);

  return db;
}

module.exports = { initDatabase, DB_PATH };
