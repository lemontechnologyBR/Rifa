/**
 * Modelo de Admin — autenticação.
 */

const bcrypt = require('bcrypt');
const { getDb } = require('./db');

const Admin = {
  /** Valida credenciais de login */
  autenticar(usuario, senha) {
    const db = getDb();
    const admin = db.prepare('SELECT * FROM admin WHERE usuario = ?').get(usuario);

    if (!admin) return false;

    return bcrypt.compareSync(senha, admin.senha_hash);
  },

  /** Garante que o admin padrão existe (chamado na inicialização) */
  garantirAdminPadrao() {
    const db = getDb();
    const existe = db.prepare('SELECT id FROM admin WHERE usuario = ?').get('admin');

    if (!existe) {
      const senhaHash = bcrypt.hashSync('admin123', 10);
      db.prepare('INSERT INTO admin (usuario, senha_hash) VALUES (?, ?)').run('admin', senhaHash);
      console.log('✅ Admin padrão criado (admin / admin123)');
    }
  }
};

module.exports = Admin;
