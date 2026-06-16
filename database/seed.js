/**
 * Seed v2 — dados fake para testes com Prisma.
 * Execute: npm run seed
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');
const { gerarCodigoIndicacao, gerarCodigoPagamento } = require('../lib/helpers');

async function main() {
  console.log('🌱 Iniciando seed...\n');

  // Admin
  await prisma.admin.upsert({
    where: { usuario: 'admin' },
    update: {},
    create: { usuario: 'admin', senhaHash: bcrypt.hashSync('admin123', 10) }
  });
  console.log('✅ Admin: admin / admin123');

  // Usuários fake
  const usuariosData = [
    { nome: 'Maria Silva', email: 'maria@teste.com', telefone: '11999990001', senha: 'senha123' },
    { nome: 'João Santos', email: 'joao@teste.com', telefone: '11999990002', senha: 'senha123' },
    { nome: 'Ana Costa', email: 'ana@teste.com', telefone: '11999990003', senha: 'senha123' },
    { nome: 'Pedro Lima', email: 'pedro@teste.com', telefone: '11999990004', senha: 'senha123' }
  ];

  const usuarios = [];
  for (const u of usuariosData) {
    let codigo = gerarCodigoIndicacao();
    const usuario = await prisma.usuario.upsert({
      where: { email: u.email },
      update: {},
      create: {
        nome: u.nome,
        email: u.email,
        telefone: u.telefone,
        senhaHash: bcrypt.hashSync(u.senha, 10),
        codigoIndicacao: codigo,
        chavePix: `${u.email}`
      }
    });
    usuarios.push(usuario);
    console.log(`✅ Usuário: ${u.email} / ${u.senha}`);
  }

  // Tenant demo
  let tenant = await prisma.tenant.findUnique({ where: { slug: 'demo' } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { slug: 'demo', nome: 'VouRifar Demo', corPrimaria: '#6366f1' }
    });
    console.log('✅ Tenant demo criado');
  }

  // Rifa ativa
  let rifaAtiva = await prisma.rifa.findFirst({ where: { status: 'ativa' } });
  if (!rifaAtiva) {
    const dataSorteio = new Date();
    dataSorteio.setDate(dataSorteio.getDate() + 30);

    rifaAtiva = await prisma.rifa.create({
      data: {
        tenantId: tenant.id,
        titulo: 'iPhone 15 Pro Max 256GB',
        descricao: 'Rifa beneficente! Participe e concorra a prêmios incríveis.',
        imagemUrl: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&h=400&fit=crop',
        valorCota: 25,
        totalNumeros: 100,
        dataSorteio,
        chavePix: '11999887766@email.com',
        metaMinimaPct: 70,
        premios: {
          create: [
            { titulo: 'iPhone 15 Pro Max', principal: true, ordem: 0, descricao: 'Prêmio principal' },
            { titulo: 'AirPods Pro', ordem: 1, descricao: 'Segundo prêmio' }
          ]
        },
        faixasDesconto: {
          create: [
            { quantidadeMin: 5, valorTotal: 110 },
            { quantidadeMin: 10, valorTotal: 200 }
          ]
        }
      }
    });

    const numeros = Array.from({ length: 100 }, (_, i) => ({
      rifaId: rifaAtiva.id,
      numero: i + 1,
      status: 'disponivel'
    }));
    await prisma.numero.createMany({ data: numeros });
    console.log('✅ Rifa ativa criada (100 números, 2 prêmios, descontos)');
  }

  // Reservas fake
  const reservaExiste = await prisma.reserva.count();
  if (reservaExiste === 0 && rifaAtiva) {
    for (let i = 0; i < 2; i++) {
      const usuario = usuarios[i];
      const nums = [i * 3 + 1, i * 3 + 2];
      const codigo = gerarCodigoPagamento();

      const reserva = await prisma.reserva.create({
        data: {
          usuarioId: usuario.id,
          rifaId: rifaAtiva.id,
          valorTotal: 50,
          statusPagamento: i === 0 ? 'confirmado' : 'pendente',
          codigoPagamento: codigo
        }
      });

      for (const n of nums) {
        const numero = await prisma.numero.findUnique({
          where: { rifaId_numero: { rifaId: rifaAtiva.id, numero: n } }
        });
        await prisma.numero.update({
          where: { id: numero.id },
          data: { status: i === 0 ? 'vendido' : 'reservado', usuarioId: usuario.id }
        });
        await prisma.reservaNumero.create({ data: { reservaId: reserva.id, numeroId: numero.id } });
      }
    }
    console.log('✅ Reservas fake criadas');
  }

  // Rifa finalizada
  const rifaFinalizada = await prisma.rifa.findFirst({ where: { status: 'finalizada' } });
  if (!rifaFinalizada) {
    const dataPassada = new Date();
    dataPassada.setDate(dataPassada.getDate() - 10);

    await prisma.rifa.create({
      data: {
        tenantId: tenant.id,
        titulo: 'Smart TV 55" 4K',
        descricao: 'Rifa encerrada — confira o ganhador!',
        imagemUrl: 'https://images.unsplash.com/photo-1593359673509-a6bbda8ff920?w=600&h=400&fit=crop',
        valorCota: 15,
        totalNumeros: 50,
        dataSorteio: dataPassada,
        chavePix: 'rifas@pix.com',
        status: 'finalizada',
        numeroSorteado: 23,
        ganhadorNome: 'Maria Silva',
        premios: { create: [{ titulo: 'Smart TV 55"', principal: true, numeroSorteado: 23, ganhadorNome: 'Maria Silva' }] }
      }
    });
    console.log('✅ Rifa encerrada (galeria) criada');
  }

  // Comentários
  const comentarioExiste = await prisma.comentario.count();
  if (comentarioExiste === 0 && rifaAtiva) {
    await prisma.comentario.create({
      data: { rifaId: rifaAtiva.id, usuarioId: usuarios[0].id, texto: 'Rifa muito top! Já comprei meus números 🍀' }
    });
    console.log('✅ Comentário fake criado');
  }

  // Logs admin
  await prisma.logAdmin.create({
    data: { adminUsuario: 'admin', acao: 'seed', detalhes: 'Dados de teste populados' }
  });

  console.log('\n🎉 Seed concluído!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
