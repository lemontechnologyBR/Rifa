/**
 * Singleton de conexão com o banco de dados SQLite.
 * Inclui helper de transação compatível com node:sqlite.
 */

const { initDatabase } = require('../database/init');

let db = null;

function getDb() {
  if (!db) {
    db = initDatabase();
  }
  return db;
}

/**
 * Executa uma função dentro de uma transação SQL (BEGIN/COMMIT/ROLLBACK).
 */
function withTransaction(fn) {
  const database = getDb();
  database.exec('BEGIN');
  try {
    const result = fn(database);
    database.exec('COMMIT');
    return result;
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { getDb, withTransaction };
