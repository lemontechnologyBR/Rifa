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
  const TAXA_PLATAFORMA = 0.10;
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
    const taxa = subtotal * TAXA_PLATAFORMA;
    return { subtotal, taxa, total: subtotal + taxa };
  }

  function clampQtd(val) {
    const n = parseInt(val, 10);
    if (Number.isNaN(n) || n < 1) return 1;
    return Math.min(n, maxQtd);
  }

  function setQtd(val) {
    qtdCotas = clampQtd(val);
    if (inputQtd) inputQtd.value = qtdCotas;
    atualizarResumoPagina();
  }

  function atualizarResumoPagina() {
    const { subtotal, taxa, total } = calcularComTaxa(calcularSubtotal(qtdCotas));

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

      await reservarNumeros();
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
    if (!cpfValido(cpf)) {
      showToast('Informe um CPF válido.', 'error');
      document.getElementById('input-cpf')?.focus();
      return;
    }
    const payload = {
      numeros: numerosSelecionados,
      nome: fd.get('nome'),
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

      const pixBadge = '<p class="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 rounded-full px-3 py-1 inline-block mb-2">💳 PIX</p>';

      const expiraEm = data.expiraEm ? new Date(data.expiraEm).getTime() : Date.now() + minutosReserva * 60 * 1000;

      document.getElementById('sucesso-detalhes').innerHTML = `
        ${pixBadge}
        <p>Reserva <strong>#${data.reservaId}</strong></p>
        <p><strong>${nums.length}</strong> cota(s) — números: <strong>${numsDisplay}</strong></p>
        <p>Total PIX: <strong>R$ ${(data.valorTotal * 1.05).toFixed(2).replace('.', ',')}</strong></p>
        ${data.bonusUsado ? `<p class="text-green-600">${data.bonusUsado} cota(s) bônus aplicada(s)</p>` : ''}
        <div class="bg-amber-50 dark:bg-amber-900/30 rounded-xl p-3 mt-3 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-sm text-center">
          ⏱️ Pague em até <strong>${minutosReserva} min</strong> — expira em <strong id="pix-expira-timer">--:--</strong>
        </div>
        <div class="bg-gray-50 dark:bg-gray-700 rounded-xl p-3 mt-3 text-left text-sm">
          <p class="font-semibold mb-2">${data.instrucoes || 'PIX Copia e Cola:'}</p>
          <textarea readonly class="w-full text-xs p-2 rounded border dark:bg-gray-800 dark:text-white" rows="3" id="pix-copia-cola">${data.copiaCola || data.payloadPix}</textarea>
          <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('pix-copia-cola').value);showToast('PIX copiado!','success')"
            class="mt-2 w-full bg-blue-600 text-white text-xs py-2 rounded-lg">📋 Copiar PIX</button>
          <img src="${data.qrCodeUrl}" alt="QR Code PIX" class="mx-auto mt-2 rounded-lg max-w-[220px]">
          <p class="text-xs mt-2 text-gray-500">Código: ${data.codigoPagamento}</p>
          <p id="status-pagamento" class="text-xs mt-2 text-yellow-600 font-semibold">⏳ Aguardando pagamento...</p>
        </div>`;
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

  document.getElementById('btn-fechar-sucesso')?.addEventListener('click', () => {
    if (pollingInterval) clearInterval(pollingInterval);
    if (pixTimerInterval) clearInterval(pixTimerInterval);
    document.getElementById('modal-sucesso').classList.add('hidden');
    location.reload();
  });

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
          if (pixTimerInterval) clearInterval(pixTimerInterval);
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

  setQtd(qtdCotas);
})();
