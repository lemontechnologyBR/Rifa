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

  test('aplica desconto percentual', () => {
    const faixasPct = [{ quantidadeMin: 10, valorTotal: 0, percentualDesconto: 20 }];
    expect(RifaService.calcularValor(faixasPct, valorCota, 10)).toBe(200);
    expect(RifaService.calcularValor(faixasPct, valorCota, 5)).toBe(125);
  });
});

describe('rifaPremiosParse', () => {
  const { parsePremiosFromBody, premioModoFromCount } = require('../lib/rifaPremiosParse');

  test('premioModoFromCount distingue 1, 2 e 3', () => {
    expect(premioModoFromCount(1)).toBe('unico');
    expect(premioModoFromCount(2)).toBe('duplo');
    expect(premioModoFromCount(3)).toBe('podio');
  });

  test('parsePremiosFromBody modos unico, duplo e podio', () => {
    expect(parsePremiosFromBody({ premio_modo: 'unico', premio_1: 'Carro' })).toEqual([
      expect.objectContaining({ titulo: 'Carro', principal: true })
    ]);
    expect(parsePremiosFromBody({ premio_modo: 'duplo', premio_1: 'A', premio_2: 'B' })).toHaveLength(2);
    expect(parsePremiosFromBody({ premio_modo: 'podio', premio_1: 'A', premio_2: 'B', premio_3: 'C' })).toHaveLength(3);
    expect(() => parsePremiosFromBody({ premio_modo: 'duplo', premio_1: 'A' })).toThrow();
  });
});

describe('carteiraSaldo', () => {
  const {
    isLegacyMpPaymentRef,
    classificarReserva,
    isReservaSacavelWoovi,
    parteOrganizadorReserva
  } = require('../lib/carteiraSaldo');

  test('detecta refs legadas Mercado Pago (só dígitos)', () => {
    expect(isLegacyMpPaymentRef('1234567890')).toBe(true);
    expect(isLegacyMpPaymentRef('woovi-abc-123')).toBe(false);
    expect(isLegacyMpPaymentRef(null)).toBe(false);
  });

  test('classifica e marca sacável só plataforma', () => {
    expect(classificarReserva({ wooviCorrelationId: '999888' })).toBe('legado_mp');
    expect(classificarReserva({ wooviCorrelationId: 'corr-uuid-1' })).toBe('plataforma');
    expect(isReservaSacavelWoovi({ wooviCorrelationId: 'corr-uuid-1' })).toBe(true);
    expect(isReservaSacavelWoovi({ wooviCorrelationId: '12345' })).toBe(false);
  });

  test('parteOrganizadorReserva aplica 5% e taxa fixa pós-vigência', () => {
    const r = {
      valorTotal: 100,
      createdAt: new Date('2026-08-01'),
      _count: { reservaNumeros: 2 }
    };
    // 95 - 1.00 = 94
    expect(parteOrganizadorReserva(r)).toBe(94);
  });
});

describe('sorteioUtil', () => {
  const { embaralharLista, sortearPremiosDistinctos } = require('../lib/sorteioUtil');

  test('embaralharLista retorna permutação com os mesmos elementos', () => {
    const original = [1, 2, 3, 4, 5, 'a', 'b'];
    const embaralhado = embaralharLista(original);
    expect(embaralhado).toHaveLength(original.length);
    expect([...embaralhado].sort()).toEqual([...original].sort());
    expect(original).toEqual([1, 2, 3, 4, 5, 'a', 'b']);
  });

  test('sortearPremiosDistinctos retorna itens distintos com count min(qtd, pool)', () => {
    const pool = [10, 20, 30, 40, 50];
    const sorteados = sortearPremiosDistinctos(pool, 3);
    expect(sorteados).toHaveLength(3);
    expect(new Set(sorteados).size).toBe(3);
    sorteados.forEach((item) => expect(pool).toContain(item));

    expect(sortearPremiosDistinctos(pool, 10)).toHaveLength(pool.length);
    expect(sortearPremiosDistinctos(pool, 0)).toHaveLength(0);
    expect(sortearPremiosDistinctos([], 5)).toHaveLength(0);
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
