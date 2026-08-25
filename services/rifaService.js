/**
 * Serviço de rifas — CRUD, sorteio, estatísticas e descontos.
 */

const prisma = require('../lib/prisma');
const { calcularValorComFaixas } = require('../lib/rifaPricing');
const { parseImagensUrls } = require('../lib/rifaFormParse');
const { serializePacotesRapidos, parsePacotesRapidosFromBody } = require('../lib/rifaPacotes');
const { sortearPremiosDistinctos } = require('../lib/sorteioUtil');

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
        include: {
          premios: { orderBy: { ordem: 'asc' } },
          faixasDesconto: { orderBy: { quantidadeMin: 'asc' } },
          imagens: { orderBy: { ordem: 'asc' } }
        },
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
        imagens: { orderBy: { ordem: 'asc' } },
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
    return calcularValorComFaixas(faixas, valorCota, quantidade, bonusCotas);
  },

  async _syncImagens(tx, rifaId, urls) {
    const list = (urls || []).filter(Boolean).slice(0, 12);
    await tx.rifaImagem.deleteMany({ where: { rifaId: Number(rifaId) } });
    if (list.length) {
      await tx.rifaImagem.createMany({
        data: list.map((url, ordem) => ({ rifaId: Number(rifaId), url, ordem }))
      });
    }
    return list[0] || '';
  },

  async _syncFaixas(tx, rifaId, faixas) {
    await tx.faixaDesconto.deleteMany({ where: { rifaId: Number(rifaId) } });
    if (!faixas?.length) return;
    await tx.faixaDesconto.createMany({
      data: faixas.map((f) => ({
        rifaId: Number(rifaId),
        quantidadeMin: parseInt(f.quantidade_min, 10),
        valorTotal: f.percentual_desconto != null ? 0 : parseFloat(f.valor_total || 0),
        percentualDesconto: f.percentual_desconto != null ? parseFloat(f.percentual_desconto) : null
      }))
    });
  },

  /** Cria rifa com números, prêmios e faixas de desconto */
  async criar(dados, adminUsuario, tenantId) {
    const {
      titulo, descricao, imagem_url, valor_cota, total_numeros,
      data_sorteio, chave_pix, meta_minima_pct,       premios = [], faixas = [], imagens_urls,
      pacotes_rapidos,
      cor_primaria, modalidade
    } = dados;

    const imagensLista = Array.isArray(imagens_urls) && imagens_urls.length
      ? imagens_urls
      : parseImagensUrls(dados);
    const capaUrl = imagensLista[0] || imagem_url || '';
    const pacotesJson = pacotes_rapidos != null
      ? (typeof pacotes_rapidos === 'string' ? pacotes_rapidos : serializePacotesRapidos(pacotes_rapidos))
      : serializePacotesRapidos(parsePacotesRapidosFromBody(dados));

    const tenant = await prisma.tenant.findUnique({ where: { id: Number(tenantId) } });
    // PIX opcional na criação: vendas só liberam quando a Carteira estiver configurada.
    const pixFinal = String(chave_pix || tenant?.pixChave || '').trim();

    const rifa = await prisma.$transaction(async (tx) => {
      const nova = await tx.rifa.create({
        data: {
          tenant: { connect: { id: Number(tenantId) } },
          titulo,
          descricao: descricao || '',
          imagemUrl: capaUrl,
          corPrimaria: cor_primaria || null,
          valorCota: parseFloat(valor_cota),
          totalNumeros: parseInt(total_numeros),
          modalidade: (modalidade === 'numeros' && parseInt(total_numeros) <= 100) ? 'numeros' : 'cotas',
          dataSorteio: new Date(data_sorteio),
          chavePix: pixFinal,
          metaMinimaPct: meta_minima_pct ? parseFloat(meta_minima_pct) : null,
          pacotesRapidos: pacotesJson
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

      await this._syncImagens(tx, nova.id, imagensLista.length ? imagensLista : (capaUrl ? [capaUrl] : []));
      await this._syncFaixas(tx, nova.id, faixas);

      return nova;
    });

    const LogService = require('./logService');
    await LogService.registrar(adminUsuario, 'criar_rifa', `Rifa #${rifa.id}: ${titulo}`, tenantId);

    setImmediate(async () => {
      try {
        const { notificarOrganizadores } = require('../lib/organizadorEmail');
        const { templateRifaCriada } = require('../lib/emailTemplates');
        const orgs = await prisma.organizador.findMany({
          where: { tenantId: Number(tenantId) },
          select: { email: true, nome: true }
        });
        for (const org of orgs) {
          if (!org.email) continue;
          const { enviarEmail } = require('../lib/emailService');
          await enviarEmail({
            para: org.email,
            assunto: `Rifa criada: ${titulo} 🎟️`,
            html: templateRifaCriada({ organizador: org, rifa, tenantSlug: tenant.slug }),
            texto: `Olá ${org.nome}! Sua rifa "${titulo}" foi criada. Acesse: ${process.env.APP_URL || 'https://vourifar.com.br'}/${tenant.slug}/rifas/${rifa.id}`
          });
        }
      } catch (e) {
        console.error('[Email] Falha ao enviar email de rifa criada:', e.message);
      }
    });

    return rifa;
  },

  async atualizar(id, dados, adminUsuario, tenantId) {
    const rifa = await this.buscarPorId(id, tenantId);
    if (!rifa) throw new Error('Rifa não encontrada.');

    const imagensLista = Array.isArray(dados.imagens_urls) && dados.imagens_urls.length
      ? dados.imagens_urls
      : parseImagensUrls(dados);
    const capaUrl = imagensLista[0] || dados.imagem_url || '';
    const pacotesJson = dados.pacotes_rapidos != null
      ? (typeof dados.pacotes_rapidos === 'string'
        ? dados.pacotes_rapidos
        : serializePacotesRapidos(dados.pacotes_rapidos))
      : rifa.pacotesRapidos;

    const atualizada = await prisma.$transaction(async (tx) => {
      let totalNumeros = rifa.totalNumeros;
      if (rifa.status === 'ativa' && dados.total_numeros != null && String(dados.total_numeros).trim() !== '') {
        const novoTotal = parseInt(dados.total_numeros, 10);
        if (!Number.isFinite(novoTotal) || novoTotal < 1 || novoTotal > 10000) {
          throw new Error('Total de cotas inválido (1 a 10.000).');
        }
        if (novoTotal !== rifa.totalNumeros) {
          await this._sincronizarTotalNumeros(tx, Number(id), rifa.totalNumeros, novoTotal);
          totalNumeros = novoTotal;
        }
      }

      const updated = await tx.rifa.update({
        where: { id: Number(id) },
        data: {
          titulo: dados.titulo,
          descricao: dados.descricao || '',
          imagemUrl: capaUrl,
          corPrimaria: dados.cor_primaria || null,
          valorCota: parseFloat(dados.valor_cota),
          ...(totalNumeros !== rifa.totalNumeros ? { totalNumeros } : {}),
          dataSorteio: new Date(dados.data_sorteio),
          chavePix: dados.chave_pix || rifa.chavePix,
          metaMinimaPct: dados.meta_minima_pct ? parseFloat(dados.meta_minima_pct) : null,
          ...(rifa.status === 'ativa' ? { pacotesRapidos: pacotesJson } : {}),
          ...(dados.modalidade ? {
            modalidade: (dados.modalidade === 'numeros' && totalNumeros <= 100) ? 'numeros' : 'cotas'
          } : {})
        }
      });

      // Premios so podem ser redefinidos enquanto a rifa esta ativa
      if (rifa.status === 'ativa' && Array.isArray(dados.premios)) {
        await tx.premio.deleteMany({ where: { rifaId: Number(id) } });
        const lista = dados.premios.length > 0
          ? dados.premios
          : [{ titulo: 'Prêmio Principal', descricao: '', ordem: 0, principal: true }];
        await tx.premio.createMany({
          data: lista.map((p, i) => ({
            rifaId: Number(id),
            titulo: p.titulo,
            descricao: p.descricao || '',
            imagemUrl: p.imagem_url || '',
            ordem: typeof p.ordem === 'number' ? p.ordem : i,
            principal: p.principal === true || i === 0
          }))
        });
      }

      if (rifa.status === 'ativa') {
        const capaSync = await this._syncImagens(tx, id, imagensLista);
        if (capaSync && capaSync !== capaUrl) {
          await tx.rifa.update({ where: { id: Number(id) }, data: { imagemUrl: capaSync } });
        }
        if (Array.isArray(dados.faixas) && dados.faixa_descontos_configured === '1') {
          await this._syncFaixas(tx, id, dados.faixas);
        }
      }

      return updated;
    });

    const LogService = require('./logService');
    await LogService.registrar(adminUsuario, 'editar_rifa', `Rifa #${id}`, tenantId);
    return atualizada;
  },

  async excluir(id, adminUsuario, tenantId) {
    const LogService = require('./logService');
    const rifa = await this.buscarPorId(id, tenantId);
    if (!rifa) throw new Error('Rifa não encontrada.');

    const rifaId = Number(id);
    const [vendidos, confirmadas] = await Promise.all([
      prisma.numero.count({ where: { rifaId, status: 'vendido' } }),
      prisma.reserva.count({ where: { rifaId, statusPagamento: 'confirmado' } })
    ]);
    if (vendidos > 0 || confirmadas > 0) {
      throw new Error(
        'Não é possível excluir: já existem cotas pagas neste sorteio. Mantenha o histórico ou encerre o sorteio.'
      );
    }

    // Libera reservas pendentes antes do cascade
    await prisma.reserva.deleteMany({
      where: { rifaId, statusPagamento: { in: ['pendente', 'expirado', 'cancelado'] } }
    });
    await prisma.rifa.delete({ where: { id: rifaId } });
    await LogService.registrar(adminUsuario, 'excluir_rifa', `Rifa #${id} excluída`, tenantId);
  },

  /** Ajusta registros de Numero ao mudar o total de cotas (só rifa ativa). */
  async _sincronizarTotalNumeros(tx, rifaId, totalAtual, novoTotal) {
    if (novoTotal > totalAtual) {
      await tx.numero.createMany({
        data: Array.from({ length: novoTotal - totalAtual }, (_, i) => ({
          rifaId,
          numero: totalAtual + i + 1,
          status: 'disponivel'
        }))
      });
      return;
    }

    const ocupado = await tx.numero.findFirst({
      where: {
        rifaId,
        numero: { gt: novoTotal },
        status: { in: ['vendido', 'reservado'] }
      },
      orderBy: { numero: 'desc' },
      select: { numero: true, status: true }
    });
    if (ocupado) {
      throw new Error(
        `Não dá para reduzir para ${novoTotal} cotas: o número ${ocupado.numero} está ${ocupado.status}. ` +
        `O mínimo possível é ${ocupado.numero}.`
      );
    }

    await tx.numero.deleteMany({
      where: { rifaId, numero: { gt: novoTotal }, status: 'disponivel' }
    });

    const sobra = await tx.numero.count({ where: { rifaId, numero: { gt: novoTotal } } });
    if (sobra > 0) {
      throw new Error('Não foi possível reduzir as cotas: ainda há números acima do novo total.');
    }
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

    // Meta mínima: só permite sortear após atingir % vendido (sem cancelamento nem reembolso)
    if (rifa.metaMinimaPct && pctVendido < rifa.metaMinimaPct) {
      throw new Error(
        `Meta mínima de ${rifa.metaMinimaPct}% não atingida (${pctVendido.toFixed(1)}% vendido). Continue vendendo até bater a meta para realizar o sorteio.`
      );
    }

    const numerosVendidos = await prisma.numero.findMany({
      where: { rifaId: Number(id), status: 'vendido' },
      include: { usuario: true }
    });

    if (numerosVendidos.length === 0) {
      throw new Error('Não há números vendidos para sortear.');
    }

    const premios = rifa.premios.length > 0 ? rifa.premios : [{ id: null, titulo: 'Prêmio Principal' }];
    if (premios.length > numerosVendidos.length) {
      throw new Error(
        `Há ${premios.length} prêmio(s) cadastrado(s), mas apenas ${numerosVendidos.length} número(s) vendido(s). Não é possível sortear.`
      );
    }

    const embaralhados = sortearPremiosDistinctos(numerosVendidos, premios.length);
    const resultados = [];

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < premios.length; i++) {
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
      const finalized = await tx.rifa.updateMany({
        where: { id: Number(id), status: 'ativa' },
        data: {
          status: 'finalizada',
          numeroSorteado: principal.numero,
          ganhadorNome: principal.ganhador,
          sorteadoEm: new Date()
        }
      });
      if (finalized.count === 0) {
        throw new Error('Sorteio já realizado ou rifa não está ativa.');
      }
    });

    const LogService = require('./logService');
    await LogService.registrar(
      adminUsuario,
      'sorteio',
      `Rifa #${id} — ${resultados.map((r) => `${r.premio}: nº${r.numero} (${r.ganhador})`).join('; ')}`,
      tenantId
    );

    // Envio de emails em background
    setImmediate(async () => {
      try {
        const { enviarEmail } = require('../lib/emailService');
        const { templateVencedor } = require('../lib/emailTemplates');
        const { notificarOrganizadores } = require('../lib/organizadorEmail');
        const tenant = await prisma.tenant.findUnique({ where: { id: Number(tenantId) } });
        const tenantSlug = tenant?.slug || '';

        // Email para cada vencedor
        for (const resultado of resultados) {
          const numeroGanhador = await prisma.numero.findFirst({
            where: { rifaId: Number(id), numero: resultado.numero },
            include: { usuario: true }
          });
          if (numeroGanhador?.usuario?.email) {
            const html = templateVencedor({
              usuario: numeroGanhador.usuario,
              rifa,
              numeroSorteado: resultado.numero,
              premio: resultado.premio,
              tenantSlug
            });
            await enviarEmail({
              para: numeroGanhador.usuario.email,
              assunto: `🏆 Você ganhou! – ${rifa.titulo}`,
              html
            });
          }
        }

        // Notifica organizadores do resultado
        const linhaResultados = resultados
          .map((r) => `<li><strong>${r.premio}</strong>: nº ${String(r.numero).padStart(2,'0')} – ${r.ganhador || 'Desconhecido'}</li>`)
          .join('');
        await notificarOrganizadores(tenantId, {
          assunto: `Sorteio realizado: ${rifa.titulo}`,
          html: `<h2>Sorteio realizado!</h2><p>Os vencedores da rifa <strong>${rifa.titulo}</strong> foram:</p><ul>${linhaResultados}</ul>`,
          texto: `Sorteio realizado. Vencedores: ${resultados.map((r) => `${r.premio}: nº${r.numero} (${r.ganhador})`).join('; ')}`
        });
      } catch (err) {
        console.error('[rifaService] Erro ao enviar email de sorteio:', err);
      }
    });

    return resultados;
  },

  async listarEncerradas(tenantId, page = 1, limite = 12) {
    return this.listar({ tenantId, status: 'finalizada', page, limite });
  },

  async obterMetricasDashboard(tenantId) {
    const tenantFilter = tenantId ? { rifa: { tenantId: Number(tenantId) } } : {};
    const tid = tenantId ? Number(tenantId) : null;

    const [receita, reservasPorDia, rifasPopulares, reservas, rifasAtivas, cotasVendidas, ultimosCompradores, topCompradoresGrupos, topIndicacoes, compradoresUnicos] = await Promise.all([
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
        : [],
      tid
        ? prisma.reserva.groupBy({
            by: ['usuarioId'],
            where: { statusPagamento: 'confirmado', rifa: { tenantId: tid } },
            _sum: { valorTotal: true },
            _count: { id: true },
            orderBy: { _sum: { valorTotal: 'desc' } },
            take: 8
          })
        : [],
      tid
        ? prisma.reserva.groupBy({
            by: ['codigoIndicacaoUsado'],
            where: {
              statusPagamento: 'confirmado',
              rifa: { tenantId: tid },
              codigoIndicacaoUsado: { not: null }
            },
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 5
          })
        : [],
      tid
        ? prisma.reserva.groupBy({
            by: ['usuarioId'],
            where: { statusPagamento: 'confirmado', rifa: { tenantId: tid } }
          }).then((r) => r.length)
        : 0
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
    const expirados = reservas.find((r) => r.statusPagamento === 'expirado')?._count || 0;
    const taxaConversao = pendentes + confirmados > 0
      ? ((confirmados / (pendentes + confirmados)) * 100).toFixed(1)
      : 0;

    const faturamentoBruto = Number(receita._sum.valorTotal || 0);
    const ticketMedio = confirmados > 0 ? faturamentoBruto / confirmados : 0;

    let topCompradores = [];
    if (tid && topCompradoresGrupos.length) {
      const userIds = topCompradoresGrupos.map((g) => g.usuarioId);
      const [usuarios, reservasCotas] = await Promise.all([
        prisma.usuario.findMany({
          where: { id: { in: userIds } },
          select: { id: true, nome: true, telefone: true }
        }),
        prisma.reserva.findMany({
          where: {
            statusPagamento: 'confirmado',
            rifa: { tenantId: tid },
            usuarioId: { in: userIds }
          },
          select: { usuarioId: true, _count: { select: { reservaNumeros: true } } }
        })
      ]);
      const usuarioMap = Object.fromEntries(usuarios.map((u) => [u.id, u]));
      const cotasMap = {};
      for (const r of reservasCotas) {
        cotasMap[r.usuarioId] = (cotasMap[r.usuarioId] || 0) + r._count.reservaNumeros;
      }
      topCompradores = topCompradoresGrupos.map((g) => {
        const u = usuarioMap[g.usuarioId] || {};
        return {
          nome: u.nome || 'Comprador',
          telefone: u.telefone || '—',
          compras: g._count.id,
          cotas: cotasMap[g.usuarioId] || 0,
          total: Number(g._sum.valorTotal || 0)
        };
      });
    }
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
      topCompradores,
      topIndicacoes: (topIndicacoes || []).map((i) => ({
        codigo: i.codigoIndicacaoUsado,
        vendas: i._count.id
      })),
      reservasPendentes: pendentes,
      reservasConfirmadas: confirmados,
      reservasExpiradas: expirados,
      ticketMedio,
      compradoresUnicos,
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
