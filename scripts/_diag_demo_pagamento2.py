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
const PaymentService = require('./services/paymentService');

function gw(r, tenant) {
  return PaymentService.detectProviderFromRef(r.wooviCorrelationId) || 'woovi';
}

(async () => {
  const org = await p.organizador.findFirst({ where: { email: 'elivemmo2@gmail.com' }, include: { tenant: true } });
  const t = org.tenant;
  const rifas = await p.rifa.findMany({ where: { tenantId: t.id }, select: { id: true } });
  const rifaIds = rifas.map(r => r.id);

  const confirmadas = await p.reserva.findMany({
    where: { rifaId: { in: rifaIds }, statusPagamento: 'confirmado' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, valorTotal: true, wooviCorrelationId: true, createdAt: true }
  });

  const saques = await p.saque.findMany({ where: { tenantId: t.id }, orderBy: { createdAt: 'asc' } });

  console.log('=== CONFIRMADAS (todas, ordem cronologica) ===');
  let cumWoovi = 0, cumMp = 0;
  for (const r of confirmadas) {
    const g = gw(r, t);
    const v = Number(r.valorTotal || 0);
    if (g === 'mercadopago') cumMp += v; else cumWoovi += v;
    console.log(JSON.stringify({
      id: r.id, valor: v, gw: g, ref: r.wooviCorrelationId,
      em: r.createdAt, cumWooviBruto: cumWoovi, cumMpBruto: cumMp
    }));
  }

  console.log('=== SAQUES (ordem cronologica) ===');
  for (const s of saques) {
    console.log(JSON.stringify({
      id: s.id, status: s.status, bruto: s.valorBruto, taxa: s.taxa,
      liquido: s.valorLiquido, em: s.createdAt
    }));
  }

  console.log('=== TOTAIS ATUAIS ===');
  console.log('wooviBrutoTotal', cumWoovi, 'mpBrutoTotal', cumMp);

  // logs em torno do saque
  const saque1 = saques[0];
  if (saque1) {
    const antes = new Date(saque1.createdAt.getTime() - 5 * 60000);
    const depois = new Date(saque1.createdAt.getTime() + 5 * 60000);
    const logs = await p.logAdmin.findMany({
      where: { tenantId: t.id, createdAt: { gte: antes, lte: depois } },
      orderBy: { createdAt: 'asc' }
    });
    console.log('=== LOGS EM TORNO DO SAQUE #1 ===');
    console.log(JSON.stringify(logs.map(l => ({ acao: l.acao, det: l.detalhes, em: l.createdAt })), null, 2));
  }

  await p.$disconnect();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=PASS, timeout=20, look_for_keys=False, allow_agent=False)

escaped = SCRIPT.replace("'", "'\\''")
cmd = f"docker exec -w /app {CONTAINER} node -e '{escaped}'"
_, o, e = c.exec_command(cmd, timeout=90)
print(o.read().decode(errors="replace"))
err = e.read().decode(errors="replace")
if err.strip():
    print("ERR:", err[:2000])
c.close()
