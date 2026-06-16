/**
 * Testes unitários — helpers e serviços principais.
 */

const { gerarCodigoIndicacao, gerarPayloadPix, limparTelefone } = require('../lib/helpers');
const { normalizarChavePix, chavesPixEquivalentes } = require('../lib/pixKey');
const RifaService = require('../services/rifaService');

describe('Helpers', () => {
  test('gerarCodigoIndicacao retorna 8 caracteres', () => {
    const codigo = gerarCodigoIndicacao();
    expect(codigo).toHaveLength(8);
  });

  test('limparTelefone remove caracteres não numéricos', () => {
    expect(limparTelefone('(11) 99999-8888')).toBe('11999998888');
  });

  test('gerarPayloadPix retorna string EMV', () => {
    const payload = gerarPayloadPix('teste@email.com', 25.0, 'Rifa Teste', 'SAO PAULO', 'PIX-123');
    expect(payload).toContain('000201');
    expect(payload).toContain('6304');
  });
});

describe('pixKey', () => {
  test('normaliza e-mail em minúsculas', () => {
    expect(normalizarChavePix('  Teste@Email.COM ')).toBe('teste@email.com');
  });

  test('detecta mesma chave com formatação diferente', () => {
    expect(chavesPixEquivalentes('11999998888', '+55 11 99999-8888')).toBe(true);
    expect(chavesPixEquivalentes('123.456.789-00', '12345678900')).toBe(true);
    expect(chavesPixEquivalentes('a@b.com', 'c@d.com')).toBe(false);
  });

  test('detecta chave aleatória (EVP) com ou sem hífens', () => {
    const comHifens = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const semHifens = 'a1b2c3d4e5f67890abcdef1234567890';
    const maiuscula = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';

    expect(normalizarChavePix(comHifens)).toBe(semHifens);
    expect(chavesPixEquivalentes(comHifens, semHifens)).toBe(true);
    expect(chavesPixEquivalentes(comHifens, maiuscula)).toBe(true);
    expect(chavesPixEquivalentes(comHifens, 'b2c3d4e5-f6a7-8901-bcde-f23456789012')).toBe(false);
  });

  test('CPF com 3º dígito 9 não confunde com telefone', () => {
    expect(normalizarChavePix('02929917628')).toBe('02929917628');
    expect(chavesPixEquivalentes('029.299.176-28', '02929917628')).toBe(true);
  });

  test('validarChavePixPorTipo rejeita tipo errado', () => {
    const { validarChavePixPorTipo } = require('../lib/pixKey');
    expect(() => validarChavePixPorTipo('cpf', '11999998888')).toThrow('CPF inválido');
    expect(validarChavePixPorTipo('cpf', '02929917628')).toBe('02929917628');
    expect(() => validarChavePixPorTipo('', '02929917628')).toThrow('Selecione o tipo');
  });
});

describe('RifaService.calcularValor', () => {
  const faixas = [
    { quantidadeMin: 10, valorTotal: 200 },
    { quantidadeMin: 5, valorTotal: 110 }
  ];
  const valorCota = 25;

  test('calcula valor sem desconto', () => {
    expect(RifaService.calcularValor([], valorCota, 3)).toBe(75);
  });

  test('aplica faixa de desconto para 5 cotas', () => {
    expect(RifaService.calcularValor(faixas, valorCota, 5)).toBe(110);
  });

  test('aplica faixa de desconto para 10 cotas', () => {
    expect(RifaService.calcularValor(faixas, valorCota, 10)).toBe(200);
  });

  test('aplica bônus de cotas grátis', () => {
    expect(RifaService.calcularValor(faixas, valorCota, 5, 2)).toBe(75);
  });
});

describe('GoogleAuthService state', () => {
  const GoogleAuthService = require('../services/googleAuthService');

  test('encodeState assina e verifyState valida o payload', () => {
    const state = GoogleAuthService.encodeState({ mode: 'acessar' });
    const payload = GoogleAuthService.verifyState(state);
    expect(payload.mode).toBe('acessar');
    expect(typeof payload.ts).toBe('number');
  });

  test('verifyState rejeita state adulterado', () => {
    const state = GoogleAuthService.encodeState({ mode: 'cadastro' });
    expect(() => GoogleAuthService.verifyState(`${state}x`)).toThrow();
  });
});
