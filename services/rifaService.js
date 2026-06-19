/**
 * Serviço de rifas — CRUD, sorteio, estatísticas e descontos.
 */

const prisma = require('../lib/prisma');

const RifaService = {
  /** Lista rifas com paginação e filtros */
  async listar({ tenantId, status, page = 1, limite = 9, busca = '' } = {}) {
    const where = {};
    if (tenantId) where.tenantId = Number(tenantId);
    if (status) where.status = status;
    if (busca) where.titulo = { contains: busca };

    const [rifas, total] = await Promise.all([
      prisma.rifa.findMany({
        where,
        include: { premios: { orderBy: { ordem: 'asc' } }, faixasDesconto: { orderBy: { quantidadeMin: 'asc' } } },
        orderBy: status === 'ativa' ? { dataSorteio: 'asc' } : { createdAt: 'desc' },
        skip: (page - 1) * limite,
        take: limite
      }),
      prisma.rifa.count({ where })
    ]);

    const rifasComStats = await Promise.all(rifas.map(async (rifa) => ({
      ...rifa,
      stats: await this.obterEstatisticas(rifa.id)
    })));

    return { rifas: rifasComStats, total, paginas: Math.ceil(total / limite), page };
  },

  async buscarPorId(id, tenantId = null) {
    const where = { id: Number(id) };
    if (tenantId) where.tenantId = Number(tenantId);
    return prisma.rifa.findFirst({
      where,
      include: {
        premios: { orderBy: { ordem: 'asc' } },
        faixasDesconto: { orderBy: { quantidadeMin: 'asc' } },
        comentarios: {
          include: { usuario: { select: { nome: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    });
  },

  async obterEstatisticas(rifaId) {
    const stats = await prisma.numero.groupBy({
      by: ['status'],
      where: { rifaId: Number(rifaId) },
      _count: true
    });

    const map = { disponivel: 0, reservado: 0, vendido: 0 };
    stats.forEach((s) => { map[s.status] = s._count; });

    return {
      total: map.disponivel + map.reservado + map.vendido,
      disponiveis: map.disponivel,
      reservados: map.reservado,
      vendidos: map.vendido
    };
  },

  /** Calcula valor total com faixas de desconto */
  calcularValor(faixas, valorCota, quantidade, bonusCotas = 0) {
    const qtdCobrada = Math.max(0, quantidade - bonusCotas);
    if (qtdCobrada === 0) return 0;

    const faixasOrdenadas = [...faixas].sort((a, b) => b.quantidadeMin - a.quantidadeMin);
    for (const faixa of faixasOrdenadas) {
      if (qtdCobrada >= faixa.quantidadeMin) return faixa.valorTotal;
    }
    return valorCota * qtdCobrada;
  },

  /** Cria rifa com números, prêmios e faixas de desconto */
  async criar(dados, adminUsuario, tenantId) {
    const {
      titulo, descricao, imagem_url, valor_cota, total_numeros,
      data_sorteio, chave_pix, meta_minima_pct, premios = [], faixas = [],
      cor_primaria, modalidade
    } = dados;

    const tenant = await prisma.tenant.findUnique({ where: { id: Number(tenantId) } });
    const pixFinal = chave_pix || tenant?.pixChave;
    if (!pixFinal) {
      throw new Error('Configure sua chave PIX na Carteira antes de criar rifas.');
    }
    const WooviService = require('./wooviService');
    if (!WooviService.isConfigured(tenant)) {
      throw new Error('Configure sua chave PIX na Carteira para receber pagamentos.');
    }

    const rifa = await prisma.$transaction(async (tx) => {
      const nova = await tx.rifa.create({
        data: {
          tenantId: Number(tenantId),
          titulo,
          descricao: descricao || '',
          imagemUrl: imagem_url || '',
          corPrimaria: cor_primaria || null,
          valorCota: parseFloat(valor_cota),
          totalNumeros: parseInt(total_numeros),
          modalidade: (modalidade === 'numeros' && parseInt(total_numeros) <= 100) ? 'numeros' : 'cotas',
          dataSorteio: new Date(data_sorteio),
          chavePix: pixFinal,
          metaMinimaPct: meta_minima_pct ? parseFloat(meta_minima_pct) : null
        }
      });

      const numerosData = Array.from({ length: parseInt(total_numeros) }, (_, i) => ({
        rifaId: nova.id,
        numero: i + 1,
        status: 'disponivel'
      }));
      await tx.numero.createMany({ data: numerosData });

      if (premios.length > 0) {
        await tx.premio.createMany({
          data: premios.map((p, i) => ({
            rifaId: nova.id,
            titulo: p.titulo,
            descricao: p.descricao || '',
            imagemUrl: p.imagem_url || '',
            ordem: i,
            principal: i === 0
          }))
        });
      } else {
        await tx.premio.create({
          data: { rifaId: nova.id, titulo: 'Prêmio Principal', principal: true, ordem: 0 }
        });
      }

      if (faixas.length > 0) {
        await tx.faixaDesconto.createMany({
          data: faixas.map((f) => ({
            rifaId: nova.id,
            quantidadeMin: parseInt(f.quantidade_min),
            valorTotal: parseFloat(f.valor_total)
          }))
        });
      }

      return nova;
    });

    const LogService = require('./logService');
    await LogService.registrar(adminUsuario, 'criar_rifa', `Rifa #${rifa.id}: ${titulo}`, tenantId);
    return rifa;
  },

  async atualizar(id, dados, adminUsuario, tenantId) {
    const rifa = await this.buscarPorId(id, tenantId);
    if (!rifa) throw new Error('Rifa não encontrada.');

    const atualizada = await prisma.rifa.update({
      where: { id: Number(id) },
      data: {
        titulo: dados.titulo,
        descricao: dados.descricao || '',
        imagemUrl: dados.imagem_url || '',
        corPrimaria: dados.cor_primaria || null,
        valorCota: parseFloat(dados.valor_cota),
        dataSorteio: new Date(dados.data_sorteio),
        chavePix: dados.chave_pix,
        metaMinimaPct: dados.meta_minima_pct ? parseFloat(dados.meta_minima_pct) : null
      }
    });

    const LogService = require('./logService');
    await LogService.registrar(adminUsuario, 'editar_rifa', `Rifa #${id}`, tenantId);
    return atualizada;
  },

  async excluir(id, adminUsuario, tenantId) {
    const rifa = await this.buscarPorId(id, tenantId);
    if (!rifa) throw new Error('Rifa não encontrada.');
    await prisma.rifa.delete({ where: { id: Number(id) } });
    await LogService.registrar(adminUsuario, 'excluir_rifa', `Rifa #${id} excluída`, tenantId);
  },

  /** Sorteio com múltiplos prêmios e verificação de meta mínima */
  async realizarSorteio(id, adminUsuario, tenantId) {
    const rifa = await this.buscarPorId(id, tenantId);
    if (!rifa) throw new Error('Rifa não encontrada.');
    if (rifa.status !== 'ativa') throw new Error('Esta rifa não está ativa.');
    if (new Date() < new Date(rifa.dataSorteio)) {
      throw new Error('O sorteio só pode ser realizado após a data definida.');
    }

    const stats = await this.obterEstatisticas(id);
    const pctVendido = (stats.vendidos / stats.total) * 100;

    // Verifica meta mínima — cancela e reembolsa se não atingiu
    if (rifa.metaMinimaPct && pctVendido < rifa.metaMinimaPct) {
      await this.cancelarPorMeta(id, adminUsuario, tenantId);
      throw new Error(
        `Meta mínima de ${rifa.metaMinimaPct}% não atingida (${pctVendido.toFixed(1)}% vendido). Rifa cancelada e pagamentos marcados para reembolso.`
      );
    }

    const numerosVendidos = await prisma.numero.findMany({
      where: { rifaId: Number(id), status: 'vendido' },
      include: { usuario: true }
    });

    if (numerosVendidos.length === 0) {
      throw new Error('Não há números vendidos para sortear.');
    }

    const embaralhados = [...numerosVendidos].sort(() => Math.random() - 0.5);
    const premios = rifa.premios.length > 0 ? rifa.premios : [{ id: null, titulo: 'Prêmio Principal' }];
    const resultados = [];

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < premios.length; i++) {
        if (i >= embaralhados.length) break;
        const sorteado = embaralhados[i];

        if (premios[i].id) {
          await tx.premio.update({
            where: { id: premios[i].id },
            data: { numeroSorteado: sorteado.numero, ganhadorNome: sorteado.usuario?.nome }
          });
        }

        resultados.push({
          premio: premios[i].titulo,
          numero: sorteado.numero,
          ganhador: sorteado.usuario?.nome
        });
      }

      const principal = resultados[0];
      await tx.rifa.update({
        where: { id: Number(id) },
        data: {
          status: 'finalizada',
          numeroSorteado: principal.numero,
          ganhadorNome: principal.ganhador
        }
      });
    });

    const LogService = require('./logService');
    await LogService.registrar(
      adminUsuario,
      'sorteio',
      `Rifa #${id} — ${resultados.map((r) => `${r.premio}: nº${r.numero} (${r.ganhador})`).join('; ')}`,
      tenantId
    );

    return resultados;
  },

  /** Cancela rifa por meta não atingida e marca reembolsos */
  async cancelarPorMeta(id, adminUsuario, tenantId) {
    await prisma.$transaction(async (tx) => {
      await tx.rifa.update({ where: { id: Number(id) }, data: { status: 'cancelada' } });
      await tx.reserva.updateMany({
        where: { rifaId: Number(id), statusPagamento: { in: ['pendente', 'confirmado'] } },
        data: { statusPagamento: 'reembolsado' }
      });
      await tx.numero.updateMany({
        where: { rifaId: Number(id) },
        data: { status: 'disponivel', usuarioId: null, reservadoAte: null }
      });
    });

    const LogService = require('./logService');
    await LogService.registrar(adminUsuario, 'cancelar_meta', `Rifa #${id} cancelada — meta não atingida`, tenantId);
  },

  async listarEncerradas(tenantId, page = 1, limite = 12) {
    return this.listar({ tenantId, status: 'finalizada', page, limite });
  },

  async obterMetricasDashboard(tenantId) {
    const tenantFilter = tenantId ? { rifa: { tenantId: Number(tenantId) } } : {};
    const tid = tenantId ? Number(tenantId) : null;

    const [receita, reservasPorDia, rifasPopulares, reservas, rifasAtivas, cotasVendidas, ultimosCompradores] = await Promise.all([
      prisma.reserva.aggregate({
        where: { statusPagamento: 'confirmado', ...tenantFilter },
        _sum: { valorTotal: true }
      }),
      tid
        ? prisma.$queryRaw`
            SELECT date(r.created_at) as dia, COUNT(*) as total, SUM(r.valor_total) as receita
            FROM reservas r JOIN rifas rf ON r.rifa_id = rf.id
            WHERE r.status_pagamento = 'confirmado' AND rf.tenant_id = ${tid}
            GROUP BY date(r.created_at) ORDER BY dia DESC LIMIT 30`
        : prisma.$queryRaw`
            SELECT date(created_at) as dia, COUNT(*) as total, SUM(valor_total) as receita
            FROM reservas WHERE status_pagamento = 'confirmado'
            GROUP BY date(created_at) ORDER BY dia DESC LIMIT 30`,
      prisma.reserva.groupBy({
        by: ['rifaId'],
        where: { statusPagamento: 'confirmado', ...tenantFilter },
        _count: true,
        _sum: { valorTotal: true },
        orderBy: { _count: { rifaId: 'desc' } },
        take: 5
      }),
      prisma.reserva.groupBy({
        by: ['statusPagamento'],
        where: tenantFilter,
        _count: true
      }),
      tid ? prisma.rifa.count({ where: { tenantId: tid, status: 'ativa' } }) : prisma.rifa.count({ where: { status: 'ativa' } }),
      tid
        ? prisma.numero.count({ where: { status: 'vendido', rifa: { tenantId: tid } } })
        : prisma.numero.count({ where: { status: 'vendido' } }),
      tid
        ? prisma.reserva.findMany({
            where: { statusPagamento: 'confirmado', rifa: { tenantId: tid } },
            include: {
              usuario: { select: { nome: true, telefone: true } },
              reservaNumeros: true,
              rifa: { select: { titulo: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: 6
          })
        : []
    ]);

    const rifaIds = rifasPopulares.map((r) => r.rifaId);
    const rifasMap = {};
    if (rifaIds.length) {
      const rifasWhere = { id: { in: rifaIds } };
      if (tenantId) rifasWhere.tenantId = Number(tenantId);
      const rifas = await prisma.rifa.findMany({ where: rifasWhere, select: { id: true, titulo: true } });
      rifas.forEach((r) => { rifasMap[r.id] = r.titulo; });
    }

    const pendentes = reservas.find((r) => r.statusPagamento === 'pendente')?._count || 0;
    const confirmados = reservas.find((r) => r.statusPagamento === 'confirmado')?._count || 0;
    const taxaConversao = pendentes + confirmados > 0
      ? ((confirmados / (pendentes + confirmados)) * 100).toFixed(1)
      : 0;

    const faturamentoBruto = Number(receita._sum.valorTotal || 0);
    const { TAXA_PLATAFORMA } = require('../lib/config');
    const taxaPlataformaCompradores = faturamentoBruto * TAXA_PLATAFORMA;
    const vendasPorDia = reservasPorDia.reverse().map((v) => ({
      dia: v.dia,
      total: Number(v.total || 0),
      receita: Number(v.receita || 0)
    }));

    const hoje = new Date();
    const vendasUltimos7Dias = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(hoje);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const found = vendasPorDia.find((v) => String(v.dia).slice(0, 10) === key);
      vendasUltimos7Dias.push({
        dia: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }),
        cotas: found ? found.total : 0,
        receita: found ? found.receita : 0
      });
    }

    return {
      receitaTotal: faturamentoBruto,
      faturamentoBruto,
      taxaPlataformaCompradores,
      rifasAtivas,
      totalCotasVendidas: cotasVendidas,
      vendasPorDia,
      vendasUltimos7Dias,
      rifasPopulares: rifasPopulares.map((r) => ({
        titulo: rifasMap[r.rifaId] || `Rifa #${r.rifaId}`,
        vendas: r._count,
        receita: r._sum.valorTotal
      })),
      ultimosCompradores: ultimosCompradores.map((r) => ({
        nome: r.usuario.nome,
        telefone: r.usuario.telefone,
        cotas: r.reservaNumeros.length,
        rifa: r.rifa.titulo,
        data: r.createdAt
      })),
      taxaConversao
    };
  },

  /** Exporta participantes para CSV */
  async exportarParticipantesCSV(rifaId, tenantId = null) {
    const rifa = await this.buscarPorId(rifaId, tenantId);
    if (!rifa) throw new Error('Rifa não encontrada.');

    const reservas = await prisma.reserva.findMany({
      where: { rifaId: Number(rifaId) },
      include: {
        usuario: true,
        reservaNumeros: { include: { numero: true } }
      },
      orderBy: { createdAt: 'asc' }
    });

    const linhas = ['Nome,CPF,Telefone,Email,Numeros,Valor,Status,Data'];
    for (const r of reservas) {
      const nums = r.reservaNumeros.map((rn) => rn.numero.numero).join(';');
      linhas.push([
        `"${r.usuario.nome}"`,
        r.usuario.cpf || '',
        r.usuario.telefone,
        r.usuario.email,
        `"${nums}"`,
        r.valorTotal.toFixed(2),
        r.statusPagamento,
        r.createdAt.toISOString()
      ].join(','));
    }
    return linhas.join('\n');
  }
};

module.exports = RifaService;
