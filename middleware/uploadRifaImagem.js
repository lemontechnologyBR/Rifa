/**
 * Upload de imagens de rifa — multer, max 5MB, JPG/PNG/WebP/GIF.
 */
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const UPLOAD_ROOT = path.join(__dirname, '..', 'public', 'uploads', 'rifas');
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(UPLOAD_ROOT, String(req.tenant.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${safeExt}`);
  }
});

const uploadRifaImagem = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(new Error('Formato inválido. Use JPG, PNG, WebP ou GIF.'));
    }
    cb(null, true);
  }
}).single('imagem');

function handleUploadRifaImagem(req, res, next) {
  uploadRifaImagem(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ erro: 'Imagem muito grande. Máximo 5 MB.' });
    }
    res.status(400).json({ erro: err.message || 'Falha no upload.' });
  });
}

module.exports = { handleUploadRifaImagem, UPLOAD_ROOT };
