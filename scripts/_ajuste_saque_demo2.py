"""Ajusta saque #1 (tenant /demo) para cobrir exatamente as vendas Woovi
antigas (ja pagas de fato naquele saque), sem deixar divida nem
'ressuscitar' saldo ja recebido. Resultado esperado: saldoDisponivel
= apenas a venda nova (#410, R$10 -> R$9,50 liquido)."""
import os
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HOST = os.environ["VOURIFAR_SSH_HOST"]
PASS = os.environ["VOURIFAR_SSH_PASS"]
CONTAINER = "vourifar-rifas-1"

SCRIPT = r"""
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const org = await p.organizador.findFirst({ where: { email: 'elivemmo2@gmail.com' }, include: { tenant: true } });
  const t = org.tenant;

  const saque = await p.saque.findFirst({ where: { tenantId: t.id }, orderBy: { createdAt: 'asc' } });
  if (!saque) { console.log('NENHUM SAQUE ENCONTRADO'); return; }

  console.log('ANTES', JSON.stringify({
    id: saque.id, bruto: saque.valorBruto, taxa: saque.taxa, liquido: saque.valorLiquido
  }));

  // Vendas Woovi confirmadas ANTES do saque (#12 R$5 + #83 R$10 = R$15 bruto)
  const brutoVendasAntigas = 15;
  const parteOrganizadorAntiga = brutoVendasAntigas * 0.95; // 14.25 — ja recebida de fato no saque #1
  const taxaSaque = 5.50;
  const liquidoAntigo = parteOrganizadorAntiga - taxaSaque; // 8.75

  const nota = `[AJUSTE 13/07/2026] Valor original bruto R$ 51.15 / taxa R$ 5.50 / liquido R$ 45.65. ` +
    `Reduzido para cobrir exatamente as vendas Woovi confirmadas antes do saque ` +
    `(reservas #12 R$5 + #83 R$10 = R$15 bruto, 95% = R$ ${parteOrganizadorAntiga.toFixed(2)}), ` +
    `ja recebidas de fato pelo usuario. Excedente (adiantamento indevido) perdoado — ` +
    `nao volta a ser cobrado de vendas futuras.`;

  const atualizado = await p.saque.update({
    where: { id: saque.id },
    data: { valorBruto: parteOrganizadorAntiga, taxa: taxaSaque, valorLiquido: liquidoAntigo, erroMsg: nota }
  });

  console.log('DEPOIS', JSON.stringify({
    id: atualizado.id, bruto: atualizado.valorBruto, taxa: atualizado.taxa,
    liquido: atualizado.valorLiquido, nota: atualizado.erroMsg
  }));

  const CarteiraService = require('./services/carteiraService');
  const resumo = await CarteiraService.obterResumo(t.id, t);
  console.log('RESUMO_NOVO', JSON.stringify({
    saldoDisponivel: resumo.saldoDisponivel,
    totalSacado: resumo.totalSacado,
    parteOrganizador: resumo.woovi.parteOrganizador,
    bruto: resumo.woovi.bruto
  }));

  await p.$disconnect();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=PASS, timeout=20, look_for_keys=False, allow_agent=False)

escaped = SCRIPT.replace("'", "'\\''")
cmd = f"docker exec -w /app {CONTAINER} node -e '{escaped}'"
_, o, e = c.exec_command(cmd, timeout=60)
print(o.read().decode(errors="replace"))
err = e.read().decode(errors="replace")
if err.strip():
    print("ERR:", err[:2000])
c.close()
