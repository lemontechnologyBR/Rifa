/**
 * Regras de validação reutilizáveis (express-validator).
 */

const { body, param, query } = require('express-validator');

const validarCadastro = [
  body('nome').trim().isLength({ min: 2, max: 100 }).withMessage('Nome deve ter entre 2 e 100 caracteres.'),
  body('email').isEmail().normalizeEmail().withMessage('E-mail inválido.'),
  body('telefone').trim().isLength({ min: 10, max: 15 }).withMessage('Telefone inválido.'),
  body('senha').isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres.'),
  body('confirmar_senha').custom((val, { req }) => {
    if (val !== req.body.senha) throw new Error('As senhas não coincidem.');
    return true;
  })
];

const validarLogin = [
  body('email').isEmail().normalizeEmail().withMessage('E-mail inválido.'),
  body('senha').notEmpty().withMessage('Senha obrigatória.')
];

const validarRecuperarSenha = [
  body('email').isEmail().normalizeEmail().withMessage('E-mail inválido.')
];

const validarNovaSenha = [
  body('senha').isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres.'),
  body('confirmar_senha').custom((val, { req }) => {
    if (val !== req.body.senha) throw new Error('As senhas não coincidem.');
    return true;
  })
];

const validarPerfil = [
  body('nome').trim().isLength({ min: 2, max: 100 }).withMessage('Nome inválido.'),
  body('telefone').trim().isLength({ min: 10, max: 15 }).withMessage('Telefone inválido.'),
  body('chave_pix').optional({ checkFalsy: true }).isLength({ max: 200 })
];

const validarRifa = [
  body('titulo').trim().isLength({ min: 3, max: 200 }).withMessage('Título inválido.'),
  body('valor_cota').isFloat({ min: 0.01 }).withMessage('Valor da cota inválido.'),
  body('total_numeros').optional().isInt({ min: 1, max: 10000 }).withMessage('Total de números inválido.'),
  body('data_sorteio').notEmpty().withMessage('Data do sorteio obrigatória.'),
  body('chave_pix').optional({ checkFalsy: true }).isLength({ max: 200 }).withMessage('Chave PIX inválida.'),
  body('meta_minima_pct').optional({ checkFalsy: true }).isFloat({ min: 0, max: 100 })
];

const validarCompra = [
  param('id').isInt({ min: 1 }).withMessage('ID da rifa inválido.'),
  body('numeros').isArray({ min: 1 }).withMessage('Selecione pelo menos um número.'),
  body('numeros.*').isInt({ min: 1 }).withMessage('Número inválido.'),
  body('nome').optional().trim().isLength({ min: 2 }).withMessage('Nome inválido.'),
  body('email').trim().isEmail().withMessage('E-mail inválido.'),
  body('cpf').optional().trim().isLength({ min: 11, max: 14 }).withMessage('CPF inválido.'),
  body('telefone').optional().trim().isLength({ min: 10 }).withMessage('Telefone inválido.')
];

const validarReservar = [
  param('id').isInt({ min: 1 }),
  body('numeros').isArray({ min: 1 }).withMessage('Selecione números.'),
  body('numeros.*').isInt({ min: 1 })
];

const validarComentario = [
  param('id').isInt({ min: 1 }),
  body('cpf').trim().notEmpty().withMessage('Informe seu CPF.'),
  body('texto').trim().isLength({ min: 3, max: 500 }).withMessage('Depoimento deve ter entre 3 e 500 caracteres.')
];

const validarWebhook = [
  body('codigo_pagamento').notEmpty().withMessage('codigo_pagamento obrigatório.')
];

const validarBuscaRifas = [
  query('status').optional().isIn(['ativa', 'finalizada', 'cancelada']),
  query('page').optional().isInt({ min: 1 }),
  query('busca').optional().trim().isLength({ max: 100 })
];

module.exports = {
  validarCadastro,
  validarLogin,
  validarRecuperarSenha,
  validarNovaSenha,
  validarPerfil,
  validarRifa,
  validarCompra,
  validarReservar,
  validarComentario,
  validarWebhook,
  validarBuscaRifas
};
