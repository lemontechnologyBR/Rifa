/**
 * Página da rifa — compra por quantidade, números aleatórios, checkout PIX.
 */
(function () {
  if (typeof RIFA_ID === 'undefined') return;

  const api = typeof API_BASE !== 'undefined' ? API_BASE : '/api';

  function cpfValido(cpf) {
    const n = String(cpf || '').replace(/\D/g, '');
    if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
    let soma = 0;
    for (let i = 0; i < 9; i++) soma += parseInt(n.charAt(i), 10) * (10 - i);
    let resto = (soma * 10) % 11;
    if (resto === 10) resto = 0;
    if (resto !== parseInt(n.charAt(9), 10)) return false;
    soma = 0;
    for (let i = 0; i < 10; i++) soma += parseInt(n.charAt(i), 10) * (11 - i);
    resto = (soma * 10) % 11;
    if (resto === 10) resto = 0;
    return resto === parseInt(n.charAt(10), 10);
  }

  function emailValido(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  }

  function initDepoimentos() {
    const form = document.getElementById('form-depoimento');
    if (!form || typeof fetchApi !== 'function') return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const cpf = fd.get('cpf');
      const texto = String(fd.get('texto') || '').trim();
      if (!cpfValido(cpf)) {
        showToast('Informe um CPF válido.', 'error');
        document.getElementById('depoimento-cpf')?.focus();
        return;
      }
      try {
        const data = await fetchApi(`${api}/rifas/${RIFA_ID}/comentarios`, {
          method: 'POST',
          body: JSON.stringify({ cpf, texto })
        });
        const c = data.comentario;
        const lista = document.getElementById('lista-comentarios');
        const vazio = document.getElementById('depoimentos-vazio');
        if (vazio) vazio.remove();

        const el = document.createElement('div');
        el.className = 'depoimento-item flex gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700/50';
        const inicial = (c.usuario.nome || '?').charAt(0).toUpperCase();
        const dataFmt = new Date(c.createdAt).toLocaleDateString('pt-BR');
        el.innerHTML = `
          <div class="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">${inicial}</div>
          <div>
            <p class="text-sm dark:text-gray-200 depoimento-texto"></p>
            <p class="text-xs text-gray-400 mt-1">${c.usuario.nome} · ${dataFmt}</p>
          </div>`;
        el.querySelector('.depoimento-texto').textContent = c.texto;
        lista?.prepend(el);

        form.reset();
        form.classList.add('hidden');
        showToast('Depoimento publicado!', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  initDepoimentos();

  if (!RIFA_ATIVA) return;

  const tenantPath = typeof TENANT_SLUG !== 'undefined' ? `/${TENANT_SLUG}` : '';
  const maxQtd = typeof QTD_MAX !== 'undefined' ? QTD_MAX : (typeof COTAS_DISPONIVEIS !== 'undefined' ? COTAS_DISPONIVEIS : 5000);
  const TAXA_PLATAFORMA = 0;
  const minutosReserva = typeof TEMPO_RESERVA_MIN !== 'undefined' ? TEMPO_RESERVA_MIN : 10;

  let qtdCotas = maxQtd > 0 ? Math.min(1, maxQtd) : 0;
  let numerosSelecionados = [];
  let timerInterval = null;
  let expiraEm = null;
  let reservaAtiva = false;
  let pollingInterval = null;
  let pixTimerInterval = null;
  let compraEmAndamento = false;

  const modalCompra = document.getElementById('modal-compra');
  const modalSucesso = document.getElementById('modal-sucesso');

  function syncScrollLock() {
    const anyOpen = (modalCompra && !modalCompra.classList.contains('hidden')) ||
      (modalSucesso && !modalSucesso.classList.contains('hidden'));
    document.body.classList.toggle('modal-open', !!anyOpen);
  }

  const inputQtd = document.getElementById('input-qtd-cotas');
  const btnIniciar = document.getElementById('btn-iniciar-compra');
  const btnMobile = document.getElementById('btn-comprar-mobile');
  const avisoLimite = document.getElementById('aviso-limite-qtd');

  const fmt = (v) => v.toFixed(2).replace('.', ',');

  function calcularSubtotal(qtd) {
    if (!qtd) return 0;
    if (typeof FAIXAS !== 'undefined' && FAIXAS.length) {
      const sorted = [...FAIXAS].sort((a, b) => b.quantidadeMin - a.quantidadeMin);
      for (const f of sorted) if (qtd >= f.quantidadeMin) return f.valorTotal;
    }
    return qtd * VALOR_COTA;
  }

  function calcularComTaxa(subtotal) {
    return { subtotal, taxa: 0, total: subtotal };
  }

  const COMPRA_MIN_REAIS = 5.00;
  const QTD_MIN_COMPRA = VALOR_COTA > 0 ? Math.ceil(COMPRA_MIN_REAIS / VALOR_COTA) : 1;

  function clampQtd(val) {
    const n = parseInt(val, 10);
    if (Number.isNaN(n) || n < 1) return QTD_MIN_COMPRA;
    return Math.min(Math.max(n, QTD_MIN_COMPRA), maxQtd);
  }

  function setQtd(val) {
    qtdCotas = clampQtd(val);
    if (inputQtd) inputQtd.value = qtdCotas;
    atualizarResumoPagina();
  }

  function atualizarResumoPagina() {
    const { subtotal, taxa, total } = calcularComTaxa(calcularSubtotal(qtdCotas));

    const avisoMin = document.getElementById('aviso-compra-minima');
    if (avisoMin) avisoMin.classList.toggle('hidden', subtotal >= COMPRA_MIN_REAIS);
    if (btnIniciar) btnIniciar.disabled = subtotal < COMPRA_MIN_REAIS;
    if (btnMobile) btnMobile.disabled = subtotal < COMPRA_MIN_REAIS;

    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    set('label-qtd-cotas', String(qtdCotas));
    set('page-res-qtd', String(qtdCotas));
    set('page-res-subtotal', `R$ ${fmt(subtotal)}`);
    set('page-res-taxa', `R$ ${fmt(taxa)}`);
    set('page-res-total', `R$ ${fmt(total)}`);
    set('sticky-qtd', String(qtdCotas));
    set('sticky-total', `R$ ${fmt(total)}`);

    const btnMenos = document.getElementById('qtd-menos');
    const btnMais = document.getElementById('qtd-mais');
    if (btnMenos) btnMenos.disabled = qtdCotas <= 1;
    if (btnMais) btnMais.disabled = qtdCotas >= maxQtd;
    if (btnIniciar) btnIniciar.disabled = maxQtd === 0 || compraEmAndamento;
    if (btnMobile) btnMobile.disabled = maxQtd === 0 || compraEmAndamento;

    if (avisoLimite) {
      if (maxQtd === 0) {
        avisoLimite.textContent = 'Não há cotas disponíveis no momento.';
        avisoLimite.classList.remove('hidden');
      } else if (qtdCotas >= maxQtd && maxQtd < 5000) {
        avisoLimite.textContent = `Máximo disponível: ${maxQtd} cota(s).`;
        avisoLimite.classList.remove('hidden');
      } else {
        avisoLimite.classList.add('hidden');
      }
    }
  }

  function formatNumerosResumo(numeros) {
    const sorted = [...numeros].sort((a, b) => a - b);
    if (sorted.length <= 15) {
      return `<strong>${sorted.length}</strong> cota(s) — números: <strong>${sorted.join(', ')}</strong>`;
    }
    const preview = sorted.slice(0, 12).join(', ');
    return `<strong>${sorted.length}</strong> cota(s) atribuídas automaticamente<br><span class="text-xs text-gray-500">${preview}… e mais ${sorted.length - 12}</span>`;
  }

  function atualizarModalCheckout() {
    const container = document.getElementById('numeros-selecionados');
    const btn = document.getElementById('btn-confirmar');
    const resumo = document.getElementById('checkout-resumo');

    if (!numerosSelecionados.length) {
      if (container) container.innerHTML = '<span class="text-gray-400">Aguardando reserva…</span>';
      if (btn) btn.disabled = true;
      resumo?.classList.add('hidden');
      return;
    }

    if (container) container.innerHTML = formatNumerosResumo(numerosSelecionados);
    resumo?.classList.remove('hidden');
    if (btn) btn.disabled = false;

    const subtotal = calcularSubtotal(numerosSelecionados.length);
    const { taxa, total } = calcularComTaxa(subtotal);
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    set('checkout-subtotal', `R$ ${fmt(subtotal)}`);
    set('checkout-taxa', `R$ ${fmt(taxa)}`);
    set('valor-total', `R$ ${fmt(total)}`);
  }

  document.getElementById('qtd-menos')?.addEventListener('click', () => setQtd(qtdCotas - 1));
  document.getElementById('qtd-mais')?.addEventListener('click', () => setQtd(qtdCotas + 1));

  inputQtd?.addEventListener('change', () => setQtd(inputQtd.value));
  inputQtd?.addEventListener('blur', () => setQtd(inputQtd.value));

  document.querySelectorAll('[data-add-qtd]').forEach((btn) => {
    btn.addEventListener('click', () => setQtd(qtdCotas + parseInt(btn.dataset.addQtd, 10)));
  });

  async function iniciarCompra() {
    if (compraEmAndamento || maxQtd === 0) return;
    if (qtdCotas < 1) return showToast('Informe a quantidade de cotas.', 'error');

    compraEmAndamento = true;
    btnIniciar && (btnIniciar.disabled = true);
    btnMobile && (btnMobile.disabled = true);

    try {
      const aleatorio = await fetchApi(`${api}/rifas/${RIFA_ID}/aleatorio`, {
        method: 'POST',
        body: JSON.stringify({ quantidade: qtdCotas })
      });
      numerosSelecionados = aleatorio.numeros || [];

      modalCompra.classList.remove('hidden');
      syncScrollLock();
      atualizarModalCheckout();
      if (window.lucide) lucide.createIcons();

      if (aleatorio.reservado && aleatorio.expiraEm) {
        reservaAtiva = true;
        expiraEm = new Date(aleatorio.expiraEm);
        iniciarTimer();
      } else {
        await reservarNumeros();
      }
      atualizarModalCheckout();
    } catch (err) {
      numerosSelecionados = [];
      showToast(err.message, 'error');
    } finally {
      compraEmAndamento = false;
      atualizarResumoPagina();
    }
  }

  btnIniciar?.addEventListener('click', iniciarCompra);
  btnMobile?.addEventListener('click', () => {
    if (typeof MODALIDADE !== 'undefined' && MODALIDADE === 'numeros') {
      document.getElementById('comprar-grade')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    document.getElementById('comprar-cotas')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    iniciarCompra();
  });

  document.getElementById('btn-fechar-modal')?.addEventListener('click', fecharModal);
  modalCompra?.addEventListener('click', (e) => { if (e.target === modalCompra) fecharModal(); });

  async function reservarNumeros() {
    const data = await fetchApi(`${api}/rifas/${RIFA_ID}/reservar`, {
      method: 'POST',
      body: JSON.stringify({ numeros: numerosSelecionados })
    });
    reservaAtiva = true;
    expiraEm = new Date(data.expiraEm);
    iniciarTimer();
  }

  async function fecharModal() {
    if (reservaAtiva && numerosSelecionados.length) {
      try {
        await fetchApi(`${api}/rifas/${RIFA_ID}/liberar`, {
          method: 'DELETE',
          body: JSON.stringify({ numeros: numerosSelecionados })
        });
      } catch (e) { /* ignore */ }
    }
    modalCompra.classList.add('hidden');
    syncScrollLock();
    pararTimer();
    reservaAtiva = false;
    numerosSelecionados = [];
  }

  function iniciarTimer() {
    pararTimer();
    document.getElementById('timer-reserva')?.classList.remove('hidden');
    timerInterval = setInterval(async () => {
      const diff = expiraEm - new Date();
      if (diff <= 0) {
        showToast(`Reserva expirada (${minutosReserva} min).`, 'error');
        await fecharModal();
        return;
      }
      const min = Math.floor(diff / 60000);
      const seg = Math.floor((diff % 60000) / 1000);
      const el = document.getElementById('timer-texto');
      if (el) el.textContent = `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
    }, 1000);
  }

  function pararTimer() {
    if (timerInterval) clearInterval(timerInterval);
    document.getElementById('timer-reserva')?.classList.add('hidden');
  }

  document.getElementById('form-compra')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!numerosSelecionados.length) return showToast('Nenhuma cota reservada.', 'error');

    const fd = new FormData(e.target);
    const cpf = fd.get('cpf');
    const email = fd.get('email');
    if (!emailValido(email)) {
      showToast('Informe um e-mail válido.', 'error');
      document.getElementById('input-email')?.focus();
      return;
    }
    if (!cpfValido(cpf)) {
      showToast('Informe um CPF válido.', 'error');
      document.getElementById('input-cpf')?.focus();
      return;
    }
    const payload = {
      numeros: numerosSelecionados,
      nome: fd.get('nome'),
      email: String(email).trim().toLowerCase(),
      cpf: fd.get('cpf'),
      telefone: fd.get('telefone'),
      codigo_indicacao: typeof CODIGO_INDICACAO !== 'undefined' ? CODIGO_INDICACAO : ''
    };

    try {
      const data = await fetchApi(`${api}/rifas/${RIFA_ID}/comprar`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      pararTimer();
      reservaAtiva = false;
      modalCompra.classList.add('hidden');
      syncScrollLock();

      const nums = data.numeros || numerosSelecionados;
      const numsDisplay = nums.length <= 20 ? nums.join(', ') : `${nums.slice(0, 18).join(', ')}… (+${nums.length - 18})`;

      const expiraEm = data.expiraEm ? new Date(data.expiraEm).getTime() : Date.now() + minutosReserva * 60 * 1000;

      document.getElementById('sucesso-detalhes').innerHTML = `
        <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px;margin-bottom:16px;font-size:13px;color:#d1d5db;">
          <div style="display:inline-flex;align-items:center;gap:4px;background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.3);color:#22c55e;border-radius:9999px;padding:3px 10px;font-size:11px;font-weight:800;margin-bottom:10px;">💳 PIX</div>
          <div style="margin-bottom:4px;">Reserva <strong style="color:#fff;">#${data.reservaId}</strong></div>
          <div style="margin-bottom:4px;"><strong style="color:#fff;">${nums.length}</strong> cota(s) — <span style="color:#22c55e;font-weight:700;">${numsDisplay}</span></div>
          <div style="margin-bottom:10px;">Total: <strong style="color:#fff;">R$ ${(data.valorTotal || 0).toFixed(2).replace('.', ',')}</strong></div>
          ${data.bonusUsado ? `<div style="color:#22c55e;margin-bottom:8px;">${data.bonusUsado} cota(s) bônus aplicada(s)</div>` : ''}
          <div style="background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.2);border-radius:10px;padding:10px;text-align:center;font-size:12px;color:#fbbf24;">
            ⏱️ Pague em até <strong>${minutosReserva} min</strong> — expira em <strong id="pix-expira-timer">--:--</strong>
          </div>
        </div>
        <div style="text-align:center;">
          <p style="font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px;">Escaneie o QR Code</p>
          ${data.qrCodeUrl ? `<img src="${data.qrCodeUrl}" alt="QR Code PIX" style="max-width:180px;width:100%;border-radius:12px;border:3px solid rgba(255,255,255,.1);margin:0 auto 12px;display:block;">` : ''}
          <div style="display:flex;align-items:center;gap:10px;margin:12px 0;">
            <div style="flex:1;height:1px;background:rgba(255,255,255,.08);"></div>
            <span style="font-size:11px;color:#6b7280;">ou</span>
            <div style="flex:1;height:1px;background:rgba(255,255,255,.08);"></div>
          </div>
          <textarea readonly id="pix-copia-cola" aria-hidden="true" tabindex="-1" style="position:absolute;width:1px;height:1px;padding:0;border:0;opacity:0;pointer-events:none;"></textarea>
          <button type="button" id="btn-copiar-pix" class="imp-btn-green" style="font-size:14px;padding:14px;">📋 Copiar código PIX</button>
          <p id="status-pagamento" style="font-size:12px;color:#fbbf24;font-weight:700;margin-top:10px;">⏳ Aguardando pagamento PIX…</p>
        </div>`;

      const pixCode = data.copiaCola || data.payloadPix || '';
      const pixInput = document.getElementById('pix-copia-cola');
      if (pixInput) pixInput.value = pixCode;

      const copyBtn = document.getElementById('btn-copiar-pix');
      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          copiarPix(pixInput ? pixInput.value : pixCode, copyBtn);
        });
      }

      document.getElementById('link-comprovante').href = `${tenantPath}/comprovante/${data.reservaId}`;
      document.getElementById('modal-sucesso').classList.remove('hidden');
      syncScrollLock();
      numerosSelecionados = [];

      iniciarCountdownPix(expiraEm);
      if (data.pollingUrl) iniciarPollingPagamento(data.pollingUrl);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  function fecharModalSucesso(recarregar = true) {
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
    if (pixTimerInterval) { clearInterval(pixTimerInterval); pixTimerInterval = null; }
    document.getElementById('modal-sucesso')?.classList.add('hidden');
    syncScrollLock();
    if (recarregar) location.reload();
  }

  document.getElementById('btn-fechar-sucesso')?.addEventListener('click', () => fecharModalSucesso(true));

  function iniciarCountdownPix(expiraEm) {
    if (pixTimerInterval) clearInterval(pixTimerInterval);
    const el = document.getElementById('pix-expira-timer');
    const statusEl = document.getElementById('status-pagamento');

    function tick() {
      const diff = expiraEm - Date.now();
      if (diff <= 0) {
        if (el) el.textContent = '00:00';
        if (statusEl) {
          statusEl.textContent = '⏱️ Reserva expirada — prazo de pagamento encerrado.';
          statusEl.className = 'text-xs mt-2 text-red-600 font-bold';
        }
        clearInterval(pixTimerInterval);
        if (pollingInterval) clearInterval(pollingInterval);
        return;
      }
      const min = Math.floor(diff / 60000);
      const seg = Math.floor((diff % 60000) / 1000);
      if (el) el.textContent = `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
    }

    tick();
    pixTimerInterval = setInterval(tick, 1000);
  }

  function iniciarPollingPagamento(url) {
    let tentativas = 0;
    pollingInterval = setInterval(async () => {
      tentativas++;
      if (tentativas > 60) { clearInterval(pollingInterval); return; }
      try {
        const resp = await fetch(url, {
          credentials: 'same-origin',
          headers: { 'ngrok-skip-browser-warning': 'true', 'X-Requested-With': 'XMLHttpRequest' }
        });
        const data = await resp.json();
        const el = document.getElementById('status-pagamento');
        if (data.status === 'confirmado') {
          if (el) { el.textContent = '✅ Pagamento confirmado!'; el.className = 'text-xs mt-2 text-green-600 font-bold'; }
          showToast('Pagamento confirmado!', 'success');
          clearInterval(pollingInterval);
          pollingInterval = null;
          if (pixTimerInterval) { clearInterval(pixTimerInterval); pixTimerInterval = null; }
          setTimeout(() => fecharModalSucesso(true), 1500);
        } else if (data.status === 'expirado') {
          if (el) { el.textContent = '⏱️ Reserva expirada — prazo de pagamento encerrado.'; el.className = 'text-xs mt-2 text-red-600 font-bold'; }
          clearInterval(pollingInterval);
          if (pixTimerInterval) clearInterval(pixTimerInterval);
          const timerEl = document.getElementById('pix-expira-timer');
          if (timerEl) timerEl.textContent = '00:00';
        } else if (el) {
          const timerEl = document.getElementById('pix-expira-timer');
          const restante = timerEl ? ` · ${timerEl.textContent}` : '';
          el.textContent = `⏳ Aguardando pagamento PIX${restante}`;
        }
      } catch (e) { /* ignore */ }
    }, 5000);
  }

  if (typeof MODALIDADE === 'undefined' || MODALIDADE !== 'numeros') {
    setQtd(qtdCotas);
  }

  /* ═══════════════════════════════════════════════════════
     GRADE DE NÚMEROS — modalidade "numeros"
  ═══════════════════════════════════════════════════════ */
  if (typeof MODALIDADE !== 'undefined' && MODALIDADE === 'numeros') {
    let numerosGrade = [];
    const selecionadosGrade = new Set();
    const COMPRA_MIN_GRADE = 5.00;
    const QTD_MIN_GRADE = VALOR_COTA > 0 ? Math.ceil(COMPRA_MIN_GRADE / VALOR_COTA) : 1;

    function statusNumero(num) {
      const entry = numerosGrade.find(n => n.numero === num);
      if (!entry) return 'disponivel';
      return entry.status === 'vendido' ? 'vendido' : entry.status === 'reservado' ? 'reservado' : 'disponivel';
    }

    function renderizarGrade() {
      document.querySelectorAll('.grade-num-btn').forEach(btn => {
        const num = parseInt(btn.dataset.num, 10);
        const st = statusNumero(num);
        const bloqueado = st === 'vendido' || st === 'reservado';
        btn.disabled = bloqueado;
        btn.removeAttribute('style');
        if (selecionadosGrade.has(num)) {
          btn.className = 'grade-num-btn selecionado';
          btn.setAttribute('aria-label', `Número ${String(num - 1).padStart(2, '0')} — selecionado`);
        } else {
          btn.className = `grade-num-btn ${st}`;
          const label = String(num - 1).padStart(2, '0');
          if (st === 'vendido') {
            btn.setAttribute('aria-label', `Número ${label} — pago`);
            btn.title = 'Pago';
          } else if (st === 'reservado') {
            btn.setAttribute('aria-label', `Número ${label} — reservado`);
            btn.title = 'Reservado';
          } else {
            btn.setAttribute('aria-label', `Número ${label} — livre`);
            btn.removeAttribute('title');
          }
        }
      });
    }

    function atualizarStatsGrade() {
      const livres     = numerosGrade.filter(n => n.status === 'disponivel').length;
      const reservados = numerosGrade.filter(n => n.status === 'reservado').length;
      const pagos      = numerosGrade.filter(n => n.status === 'vendido').length;
      const set = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
      set('grade-stat-livres',     `${livres} Livres`);
      set('grade-stat-reservados', `${reservados} Reservados`);
      set('grade-stat-pagos',      `${pagos} Pagos`);
    }

    function atualizarBotaoGrade() {
      const qtd   = selecionadosGrade.size;
      const total = qtd * VALOR_COTA;
      const set   = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
      set('grade-selecionados-qtd', String(qtd));
      set('grade-total-label',      `R$ ${fmt(total)}`);
      set('btn-grade-total-label',  `R$ ${fmt(total)}`);
      set('sticky-qtd',             `${qtd} número(s)`);
      set('sticky-total',           `R$ ${fmt(total)}`);

      const abaixoMin = total < COMPRA_MIN_GRADE;
      const avisoMin  = document.getElementById('aviso-grade-minima');
      const qtdMinEl  = document.getElementById('grade-minimo-qtd');
      if (avisoMin)  avisoMin.classList.toggle('hidden', !(abaixoMin && qtd > 0));
      if (qtdMinEl)  qtdMinEl.textContent = String(QTD_MIN_GRADE);
      const btn = document.getElementById('btn-iniciar-compra-grade');
      if (btn) btn.disabled = qtd === 0 || abaixoMin || compraEmAndamento;
      if (btnMobile) btnMobile.disabled = qtd === 0 || abaixoMin || compraEmAndamento;
    }

    document.querySelectorAll('.grade-num-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const num = parseInt(btn.dataset.num, 10);
        if (statusNumero(num) !== 'disponivel' && !selecionadosGrade.has(num)) return;
        if (selecionadosGrade.has(num)) {
          selecionadosGrade.delete(num);
        } else {
          selecionadosGrade.add(num);
        }
        renderizarGrade();
        atualizarBotaoGrade();
      });
    });

    async function iniciarCompraGrade() {
      if (compraEmAndamento || selecionadosGrade.size === 0) return;
      compraEmAndamento = true;
      atualizarBotaoGrade();

      try {
        numerosSelecionados = [...selecionadosGrade];

        modalCompra.classList.remove('hidden');
        syncScrollLock();
        atualizarModalCheckout();
        if (window.lucide) lucide.createIcons();

        await reservarNumeros();
        atualizarModalCheckout();
      } catch (err) {
        numerosSelecionados = [];
        showToast(err.message, 'error');
      } finally {
        compraEmAndamento = false;
        atualizarBotaoGrade();
      }
    }

    document.getElementById('btn-iniciar-compra-grade')?.addEventListener('click', iniciarCompraGrade);

    async function carregarGrade() {
      try {
        const data = await fetchApi(`${api}/rifas/${RIFA_ID}/numeros`);
        numerosGrade = data.numeros || [];
        renderizarGrade();
        atualizarStatsGrade();
      } catch (e) {
        console.error('Erro ao carregar grade:', e);
      }
    }

    carregarGrade();
    atualizarBotaoGrade();

    setInterval(async () => {
      try {
        const data = await fetchApi(`${api}/rifas/${RIFA_ID}/numeros`);
        numerosGrade = data.numeros || [];
        renderizarGrade();
        atualizarStatsGrade();
      } catch (e) { /* ignore */ }
    }, 20000);
  }
})();
