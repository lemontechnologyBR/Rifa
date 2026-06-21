/**
 * Templates HTML para e-mails transacionais da plataforma VouRifar.
 * Design inspirado no visual dark/green da plataforma, adaptado para
 * máxima compatibilidade com clientes de e-mail (CSS inline).
 */

const APP_URL = process.env.APP_URL || 'https://vourifar.com.br';

const LOGO_URL = `${APP_URL}/img/vourifar-logo.svg`;

/** Layout base compartilhado por todos os e-mails */
function baseLayout({ titulo, conteudo, rodapeExtra = '' }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titulo}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr><td align="center">

      <!-- Card principal -->
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.12);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:28px 32px;text-align:center;">
            <img src="${LOGO_URL}" alt="VouRifar" width="140" height="33" style="display:inline-block;">
            <p style="margin:10px 0 0;color:#94a3b8;font-size:12px;letter-spacing:0.05em;text-transform:uppercase;">${titulo}</p>
          </td>
        </tr>

        <!-- Conteúdo -->
        <tr>
          <td style="background:#ffffff;padding:36px 40px;">
            ${conteudo}
          </td>
        </tr>

        <!-- Rodapé -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
            ${rodapeExtra ? `<p style="margin:0 0 10px;font-size:13px;color:#475569;">${rodapeExtra}</p>` : ''}
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              Você recebeu este e-mail porque realizou uma ação na plataforma <strong>VouRifar</strong>.<br>
              <a href="${APP_URL}" style="color:#10b981;text-decoration:none;">${APP_URL}</a>
            </p>
          </td>
        </tr>

      </table>
      <!-- /Card principal -->

    </td></tr>
  </table>
</body>
</html>`;
}

/** Botão CTA verde */
function btnVerde(texto, href) {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px auto;">
    <tr><td style="background:#10b981;border-radius:10px;padding:0;">
      <a href="${href}" style="display:inline-block;padding:14px 32px;color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:0.01em;">${texto}</a>
    </td></tr>
  </table>`;
}

/** Badge colorido */
function badge(texto, cor = '#10b981', fundo = 'rgba(16,185,129,0.1)') {
  return `<span style="display:inline-block;background:${fundo};color:${cor};border:1px solid ${cor}40;border-radius:9999px;padding:3px 12px;font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;">${texto}</span>`;
}

/** Linha de informação (label + valor) */
function infoRow(label, valor) {
  return `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;width:45%;">${label}</td>
    <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;font-weight:600;text-align:right;">${valor}</td>
  </tr>`;
}

/** Caixa de destaque */
function caixaDestaque(conteudo, bg = '#f0fdf4', borda = '#10b981') {
  return `<div style="background:${bg};border:1px solid ${borda}40;border-left:4px solid ${borda};border-radius:8px;padding:16px 20px;margin:20px 0;">
    ${conteudo}
  </div>`;
}

/* ================================================================
   TEMPLATE 1 — Reserva criada (PIX pendente)
   ================================================================ */
function templateReservaCriada({ usuario, rifa, reserva, copiaCola, qrCodeUrl, expiraEm, tenantSlug }) {
  const numeros = reserva.numeros || [];
  const numsDisplay = numeros.length <= 20
    ? numeros.join(', ')
    : `${numeros.slice(0, 18).join(', ')} … (+${numeros.length - 18})`;

  const expiraFmt = expiraEm
    ? new Date(expiraEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : '10 minutos';

  const comprovanteUrl = `${APP_URL}/${tenantSlug}/comprovante/${reserva.id}`;

  const conteudo = `
    <p style="margin:0 0 6px;font-size:22px;font-weight:800;color:#0f172a;">Olá, ${usuario.nome.split(' ')[0]}! 👋</p>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;">Sua reserva foi criada. Pague via PIX para garantir seus números.</p>

    ${badge('PIX PENDENTE', '#f59e0b', 'rgba(245,158,11,0.1)')}

    <!-- Info da rifa -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      ${infoRow('Rifa', `<strong>${rifa.titulo}</strong>`)}
      ${infoRow('Reserva', `#${reserva.id}`)}
      ${infoRow('Números', numeros.length > 20 ? `${numeros.length} cotas atribuídas` : numsDisplay)}
      ${infoRow('Valor total', `R$ ${Number(reserva.valorTotal).toFixed(2).replace('.', ',')}`)}
      ${infoRow('Pagar até', `<span style="color:#ef4444;font-weight:700;">${expiraFmt}</span>`)}
    </table>

    ${caixaDestaque(`
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#10b981;text-transform:uppercase;letter-spacing:0.05em;">📋 PIX Copia e Cola</p>
      <p style="margin:0;font-size:11px;color:#475569;word-break:break-all;font-family:monospace;background:#f8fafc;padding:10px;border-radius:6px;border:1px solid #e2e8f0;">${copiaCola || 'Disponível no link abaixo'}</p>
    `, '#f0fdf4', '#10b981')}

    ${qrCodeUrl ? `
    <div style="text-align:center;margin:20px 0;">
      <p style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 12px;font-weight:700;">Ou escaneie o QR Code</p>
      <img src="${qrCodeUrl}" alt="QR Code PIX" width="160" height="160" style="border-radius:12px;border:3px solid #e2e8f0;">
    </div>` : ''}

    ${btnVerde('Ver comprovante e QR Code', comprovanteUrl)}

    <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;text-align:center;">
      ⏱️ Sua reserva expira em <strong>${expiraFmt}</strong>. Após esse prazo os números são liberados.
    </p>
  `;

  return baseLayout({
    titulo: 'Pagamento PIX pendente',
    conteudo,
    rodapeExtra: `Dúvidas? Entre em contato com o organizador da rifa <strong>${rifa.titulo}</strong>.`
  });
}

/* ================================================================
   TEMPLATE 2 — Pagamento confirmado
   ================================================================ */
function templatePagamentoConfirmado({ usuario, rifa, reserva, tenantSlug }) {
  const numeros = reserva.numeros || [];
  const numsDisplay = numeros.length <= 20
    ? numeros.join(', ')
    : `${numeros.slice(0, 18).join(', ')} … (+${numeros.length - 18})`;

  const sorteioFmt = rifa.dataSorteio
    ? new Date(rifa.dataSorteio).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    : 'Em breve';

  const comprovanteUrl = `${APP_URL}/${tenantSlug}/comprovante/${reserva.id}`;
  const minhasReservasUrl = `${APP_URL}/${tenantSlug}/minhas-reservas`;

  const conteudo = `
    <p style="margin:0 0 6px;font-size:22px;font-weight:800;color:#0f172a;">Pagamento confirmado! 🎉</p>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;">Seus números estão garantidos. Boa sorte, ${usuario.nome.split(' ')[0]}!</p>

    ${badge('PAGO ✓', '#10b981', 'rgba(16,185,129,0.1)')}

    <!-- Destaque números -->
    ${caixaDestaque(`
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#10b981;text-transform:uppercase;letter-spacing:0.05em;">🎟️ Seus números</p>
      <p style="margin:0;font-size:${numeros.length <= 10 ? '20' : '14'}px;font-weight:900;color:#0f172a;letter-spacing:0.02em;">${numsDisplay}</p>
    `, '#f0fdf4', '#10b981')}

    <!-- Detalhes -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      ${infoRow('Rifa', `<strong>${rifa.titulo}</strong>`)}
      ${infoRow('Reserva', `#${reserva.id}`)}
      ${infoRow('Cotas', `${numeros.length} número(s)`)}
      ${infoRow('Valor pago', `R$ ${Number(reserva.valorTotal).toFixed(2).replace('.', ',')}`)}
      ${infoRow('Data do sorteio', sorteioFmt)}
    </table>

    ${btnVerde('Ver comprovante', comprovanteUrl)}

    <div style="text-align:center;margin-top:4px;">
      <a href="${minhasReservasUrl}" style="font-size:13px;color:#10b981;text-decoration:none;">Ver todas as minhas reservas →</a>
    </div>
  `;

  return baseLayout({
    titulo: 'Pagamento confirmado',
    conteudo,
    rodapeExtra: `Sorteio da rifa <strong>${rifa.titulo}</strong> em <strong>${sorteioFmt}</strong>.`
  });
}

/* ================================================================
   TEMPLATE 3 — Reserva expirada
   ================================================================ */
function templateReservaExpirada({ usuario, rifa, reserva, tenantSlug }) {
  const rifaUrl = `${APP_URL}/${tenantSlug}`;

  const conteudo = `
    <p style="margin:0 0 6px;font-size:22px;font-weight:800;color:#0f172a;">Sua reserva expirou ⏱️</p>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;">Olá, ${usuario.nome.split(' ')[0]}! O prazo para pagamento da sua reserva encerrou.</p>

    ${badge('EXPIRADO', '#ef4444', 'rgba(239,68,68,0.08)')}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      ${infoRow('Rifa', `<strong>${rifa.titulo}</strong>`)}
      ${infoRow('Reserva', `#${reserva.id}`)}
      ${infoRow('Cotas', `${(reserva.numeros || []).length} número(s)`)}
      ${infoRow('Valor', `R$ ${Number(reserva.valorTotal).toFixed(2).replace('.', ',')}`)}
    </table>

    ${caixaDestaque(`
      <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#f59e0b;">Ainda quer participar?</p>
      <p style="margin:0;font-size:13px;color:#475569;">Os números foram liberados e podem ser adquiridos novamente. Clique abaixo para acessar a rifa.</p>
    `, '#fffbeb', '#f59e0b')}

    ${btnVerde('Participar novamente', rifaUrl)}
  `;

  return baseLayout({
    titulo: 'Reserva expirada',
    conteudo
  });
}

/* ================================================================
   TEMPLATE 4 — Vencedor do sorteio
   ================================================================ */
function templateVencedor({ usuario, rifa, numeroSorteado, premio, tenantSlug }) {
  const comprovanteUrl = `${APP_URL}/${tenantSlug}/sorteio-resultado`;

  const conteudo = `
    <div style="text-align:center;margin-bottom:8px;font-size:48px;">🏆</div>
    <p style="margin:0 0 6px;font-size:24px;font-weight:800;color:#0f172a;text-align:center;">Parabéns, ${usuario.nome.split(' ')[0]}!</p>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;text-align:center;">Você ganhou o sorteio <strong>${rifa.titulo}</strong>!</p>

    ${badge('🏆 VENCEDOR', '#10b981', 'rgba(16,185,129,0.1)')}

    ${caixaDestaque(`
      <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#10b981;text-transform:uppercase;letter-spacing:0.05em;">Número sorteado</p>
      <p style="margin:0;font-size:40px;font-weight:900;color:#0f172a;text-align:center;">${String(numeroSorteado).padStart(2, '0')}</p>
    `, '#f0fdf4', '#10b981')}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      ${infoRow('Rifa', `<strong>${rifa.titulo}</strong>`)}
      ${infoRow('Prêmio', premio || 'Confira com o organizador')}
    </table>

    <p style="font-size:14px;color:#475569;text-align:center;margin:16px 0;">
      O organizador entrará em contato para a entrega do prêmio.<br>
      Guarde seu comprovante de compra.
    </p>

    ${btnVerde('Ver resultado do sorteio', comprovanteUrl)}
  `;

  return baseLayout({
    titulo: 'Você é o vencedor! 🏆',
    conteudo,
    rodapeExtra: 'Em caso de dúvidas, entre em contato com o organizador da rifa.'
  });
}

/* ================================================================
   TEMPLATE 5 — Recuperação de senha (organizador)
   ================================================================ */
function templateRecuperacaoSenha({ organizador, token, tenantSlug }) {
  const resetUrl = `${APP_URL}/${tenantSlug}/admin/resetar-senha?token=${token}`;

  const conteudo = `
    <p style="margin:0 0 6px;font-size:22px;font-weight:800;color:#0f172a;">Redefinir senha 🔐</p>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;">Olá, ${organizador.nome}! Recebemos uma solicitação para redefinir a senha da sua conta VouRifar.</p>

    ${caixaDestaque(`
      <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#0f172a;">Este link expira em <strong>2 horas</strong>.</p>
      <p style="margin:0;font-size:13px;color:#475569;">Se você não solicitou a redefinição de senha, ignore este e-mail. Sua senha permanece a mesma.</p>
    `, '#fafafa', '#e2e8f0')}

    ${btnVerde('Redefinir minha senha', resetUrl)}

    <p style="font-size:12px;color:#94a3b8;text-align:center;margin-top:16px;">
      Se o botão não funcionar, copie o link abaixo e cole no navegador:<br>
      <a href="${resetUrl}" style="color:#10b981;font-size:11px;word-break:break-all;">${resetUrl}</a>
    </p>
  `;

  return baseLayout({
    titulo: 'Recuperação de senha',
    conteudo,
    rodapeExtra: 'Se você não solicitou a recuperação de senha, ignore este e-mail.'
  });
}

/* ================================================================
   TEMPLATE 6 — Boas-vindas novo organizador
   ================================================================ */
function templateBoasVindas({ organizador, tenantSlug }) {
  const adminUrl = `${APP_URL}/${tenantSlug}/admin`;

  const conteudo = `
    <p style="margin:0 0 6px;font-size:22px;font-weight:800;color:#0f172a;">Bem-vindo à VouRifar! 🎉</p>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;">
      Olá, ${organizador.nome}! Sua conta de organizador foi criada com sucesso.
    </p>

    ${badge('CONTA ATIVA', '#10b981', 'rgba(16,185,129,0.1)')}

    ${caixaDestaque(`
      <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#0f172a;">🚀 Próximos passos</p>
      <ol style="margin:0;padding-left:20px;font-size:13px;color:#475569;line-height:1.8;">
        <li>Acesse seu painel de administração</li>
        <li>Configure sua carteira (conecte o Mercado Pago)</li>
        <li>Crie sua primeira rifa</li>
        <li>Compartilhe o link com seus clientes</li>
      </ol>
    `, '#f0fdf4', '#10b981')}

    ${btnVerde('Acessar meu painel', adminUrl)}
  `;

  return baseLayout({
    titulo: 'Bem-vindo à VouRifar',
    conteudo,
    rodapeExtra: 'Precisa de ajuda? Entre em contato pelo nosso suporte.'
  });
}

module.exports = {
  templateReservaCriada,
  templatePagamentoConfirmado,
  templateReservaExpirada,
  templateVencedor,
  templateRecuperacaoSenha,
  templateBoasVindas
};
