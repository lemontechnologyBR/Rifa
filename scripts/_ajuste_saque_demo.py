"""Zera o impacto contabil do saque #1 (tenant /demo) no ledger, mantendo
registro auditavel do valor original. Decisao de negocio: saque foi
reconhecido como recebido pelo usuario, mas a divida nao deve mais
bloquear vendas futuras dessa conta (perdao aprovado em 13/07/2026)."""
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
    id: saque.id, bruto: saque.valorBruto, taxa: saque.taxa, liquido: saque.valorLiquido, status: saque.status
  }));

  const nota = `[AJUSTE 13/07/2026] Valor original bruto R$ ${saque.valorBruto.toFixed(2)} / ` +
    `taxa R$ ${saque.taxa.toFixed(2)} / liquido R$ ${saque.valorLiquido.toFixed(2)} — ` +
    `perdoado (excedia saldo teorico Woovi da epoca). Recebido de fato pelo usuario, ` +
    `mas zerado no ledger para nao bloquear vendas futuras.`;

  const atualizado = await p.saque.update({
    where: { id: saque.id },
    data: { valorBruto: 0, taxa: 0, valorLiquido: 0, erroMsg: nota }
  });

  console.log('DEPOIS', JSON.stringify({
    id: atualizado.id, bruto: atualizado.valorBruto, taxa: atualizado.taxa,
    liquido: atualizado.valorLiquido, status: atualizado.status, nota: atualizado.erroMsg
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
