"""Restaura saque #1 (tenant /demo) para os valores reais historicos."""
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
  if (!saque) { console.log('NENHUM SAQUE'); return; }

  const nota = '[NOTA 13/07/2026] Saque real de R$ 51,15 bruto / R$ 45,65 liquido, feito quando o app ' +
    'ainda nao separava Woovi/Mercado Pago por OAuth split (fundos de ambos os canais estavam ' +
    'sob custodia da plataforma). Formula de saldo disponivel foi corrigida em carteiraService ' +
    'para nao considerar esse saque como divida eterna contra vendas Woovi futuras.';

  const atualizado = await p.saque.update({
    where: { id: saque.id },
    data: { valorBruto: 51.15, taxa: 5.50, valorLiquido: 45.65, erroMsg: nota }
  });

  console.log('RESTAURADO', JSON.stringify({
    id: atualizado.id, bruto: atualizado.valorBruto, taxa: atualizado.taxa, liquido: atualizado.valorLiquido
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
