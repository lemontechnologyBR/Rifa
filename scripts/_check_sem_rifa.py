import os
import paramiko
import json

HOST = os.environ["VOURIFAR_SSH_HOST"]
PASS = os.environ["VOURIFAR_SSH_PASS"]
CONTAINER = "vourifar-rifas-1"

SCRIPT = r"""
const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
(async()=>{
  const orgs = await p.organizador.findMany({
    include: {
      tenant: {
        include: { _count: { select: { rifas: true } } }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const semRifa = orgs.filter(o => o.tenant._count.rifas === 0);
  const comRifa = orgs.filter(o => o.tenant._count.rifas > 0);

  const fmt = (d) => d ? new Date(d).toISOString().slice(0, 10) : '-';
  const dias = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

  const rows = semRifa.map(o => ({
    orgId: o.id,
    nome: o.nome,
    email: o.email,
    cadastro: fmt(o.createdAt),
    diasCadastro: dias(o.createdAt),
    tenantId: o.tenant.id,
    slug: o.tenant.slug,
    loja: o.tenant.nome,
    status: o.tenant.status,
    pix: !!o.tenant.pixChave,
    mp: !!o.tenant.mpAccessToken,
    google: !!o.googleId
  }));

  const resumo = {
    totalOrganizadores: orgs.length,
    comRifa: comRifa.length,
    semRifa: semRifa.length,
    percentualSemRifa: orgs.length ? Math.round(semRifa.length / orgs.length * 100) : 0,
    taxaConversaoRifa: orgs.length ? Math.round(comRifa.length / orgs.length * 100) : 0,
    comPixSemRifa: rows.filter(r => r.pix).length,
    comMpSemRifa: rows.filter(r => r.mp).length,
    comCarteiraSemRifa: rows.filter(r => r.pix || r.mp).length,
    semCarteiraSemRifa: rows.filter(r => !r.pix && !r.mp).length,
    cadastroUltimos7d: rows.filter(r => r.diasCadastro <= 7).length,
    cadastroUltimos30d: rows.filter(r => r.diasCadastro <= 30).length,
    comCarteiraMais5dSemRifa: rows.filter(r => (r.pix || r.mp) && r.diasCadastro >= 5).length
  };

  const carteiraPronta = rows.filter(r => r.pix || r.mp)
    .sort((a,b) => b.diasCadastro - a.diasCadastro)
    .slice(0, 20);

  console.log(JSON.stringify({ resumo, carteiraPronta, semRifa: rows }, null, 2));
  await p.$disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
"""


def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=PASS, timeout=20,
              look_for_keys=False, allow_agent=False)
    escaped = SCRIPT.replace("'", "'\\''")
    cmd = f"docker exec {CONTAINER} node -e '{escaped}'"
    _, o, e = c.exec_command(cmd, timeout=60)
    out = o.read().decode(errors="replace").strip()
    err = e.read().decode(errors="replace").strip()
    c.close()

    if err and "ExperimentalWarning" not in err and err not in out:
        print("[ERR]", err[:500])

    if not out:
        print("Sem resposta do banco.")
        return

    data = json.loads(out)
    resumo = data["resumo"]
    rows = data["semRifa"]

    print("=== RESUMO ===")
    for k, v in resumo.items():
        print(f"  {k}: {v}")

    print(f"\n=== CARTEIRA CONFIGURADA MAS SEM RIFA (top 20, mais antigos) ===")
    for r in data.get("carteiraPronta", []):
        extras = []
        if r["pix"]:
            extras.append("PIX")
        if r["mp"]:
            extras.append("MP")
        print(
            f"  #{r['orgId']} | {r['cadastro']} ({r['diasCadastro']}d) | "
            f"{r['nome']} <{r['email']}> | /{r['slug']} [{', '.join(extras)}]"
        )
    print(f"\n=== SEM RIFA ({len(rows)}) ===")
    for r in rows:
        extras = []
        if r["pix"]:
            extras.append("PIX")
        if r["mp"]:
            extras.append("MP")
        if r["google"]:
            extras.append("Google")
        extra = f" [{', '.join(extras)}]" if extras else ""
        print(
            f"  #{r['orgId']} | {r['cadastro']} ({r['diasCadastro']}d) | "
            f"{r['nome']} <{r['email']}> | /{r['slug']}{extra}"
        )


if __name__ == "__main__":
    main()
