/**
 * Listagem pública — modal de compra por quantidade + PIX real
 */
(function () {
  const TAXA = 0;
  const modal = document.getElementById('modal-participar');
  if (!modal) return;

  const apiBase = typeof PUBLIC_API_BASE !== 'undefined' ? PUBLIC_API_BASE : '/api';
  const tenantBase = typeof PUBLIC_TENANT_BASE !== 'undefined' ? PUBLIC_TENANT_BASE : '';

  let rifaAtual = null;
  let qtdCotas = 1;
  let maxQtd = 1;
  let faixas = [];
  let numerosReservados = [];
  let reservaAtiva = false;
  let comprando = false;

  const els = {
    titulo: document.getElementById('modal-rifa-titulo'),
    inputQtd: document.getElementById('modal-input-qtd'),
    qtd: document.getElementById('modal-qtd'),
    subtotal: document.getElementById('modal-subtotal'),
    taxa: document.getElementById('modal-taxa'),
    valorTotal: document.getElementById('modal-valor-total'),
    disponiveis: document.getElementById('modal-label-disponiveis'),
    nome: document.getElementById('modal-nome'),
    email: document.getElementById('modal-email'),
    cpf: document.getElementById('modal-cpf'),
    telefone: document.getElementById('modal-telefone'),
    verDetalhe: document.getElementById('modal-ver-detalhe'),
    btnPix: document.getElementById('modal-pagar-pix'),
    btnMenos: document.getElementById('modal-qtd-menos'),
    btnMais: document.getElementById('modal-qtd-mais')
  };

  function emailValido(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  }

  function fmt(v) {
    return (v || 0).toFixed(2).replace('.', ',');
  }

  function limparCpf(v) {
    return String(v || '').replace(/\D/g, '');
  }

  function cpfValido(cpf) {
    const n = limparCpf(cpf);
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

  function calcularSubtotal(qtd) {
    if (!qtd || !rifaAtual) return 0;
    if (faixas.length) {
      const sorted = [...faixas].sort((a, b) => b.quantidadeMin - a.quantidadeMin);
      for (const f of sorted) if (qtd >= f.quantidadeMin) return f.valorTotal;
    }
    return qtd * rifaAtual.valorCota;
  }

  function calcularComTaxa(subtotal) {
    return { subtotal, taxa: 0, total: subtotal };
  }

  const COMPRA_MIN_REAIS = 5.00;

  function qtdMinima() {
    if (!rifaAtual || rifaAtual.valorCota <= 0) return 1;
    return Math.ceil(COMPRA_MIN_REAIS / rifaAtual.valorCota);
  }

  function clampQtd(val) {
    const n = parseInt(val, 10);
    const min = qtdMinima();
    if (Number.isNaN(n) || n < min) return min;
    return Math.min(n, maxQtd);
  }

  function setQtd(val) {
    qtdCotas = clampQtd(val);
    if (els.inputQtd) els.inputQtd.value = qtdCotas;
    atualizarResumo();
  }

  function atualizarResumo() {
    const { subtotal, taxa, total } = calcularComTaxa(calcularSubtotal(qtdCotas));
    if (els.qtd) els.qtd.textContent = String(qtdCotas);
    if (els.subtotal) els.subtotal.textContent = 'R$ ' + fmt(subtotal);
    if (els.taxa) {
      const taxaRow = els.taxa.closest('li, tr, .taxa-row') || els.taxa.parentElement;
      if (taxaRow) taxaRow.classList.toggle('hidden', taxa === 0);
      els.taxa.textContent = 'R$ ' + fmt(taxa);
    }
    if (els.valorTotal) els.valorTotal.textContent = 'R$ ' + fmt(total);
    const min = qtdMinima();
    if (els.btnMenos) els.btnMenos.disabled = qtdCotas <= min;
    if (els.btnMais) els.btnMais.disabled = qtdCotas >= maxQtd;
    const abaixoMin = subtotal < COMPRA_MIN_REAIS - 0.001;
    if (els.btnPix) els.btnPix.disabled = maxQtd === 0 || comprando || abaixoMin;

    const avisoEl = document.getElementById('modal-aviso-compra-minima');
    if (avisoEl) {
      if (abaixoMin && maxQtd > 0) {
        const falta = COMPRA_MIN_REAIS - subtotal;
        avisoEl.textContent = `Mínimo R$ ${COMPRA_MIN_REAIS.toFixed(2).replace('.', ',')} — faltam R$ ${falta.toFixed(2).replace('.', ',')}`;
        avisoEl.classList.remove('hidden');
      } else {
        avisoEl.classList.add('hidden');
      }
    }
  }

  function parseFaixas(raw) {
    if (!raw) return [];
    try {
      return JSON.parse(decodeURIComponent(raw));
    } catch (e) {
      return [];
    }
  }

  async function liberarReserva() {
    if (!reservaAtiva || !numerosReservados.length || !rifaAtual) return;
    try {
      await fetchApi(apiBase + '/rifas/' + rifaAtual.id + '/liberar', {
        method: 'DELETE',
        body: JSON.stringify({ numeros: numerosReservados })
      });
    } catch (e) { /* ignore */ }
    reservaAtiva = false;
    numerosReservados = [];
  }

  async function abrirModal(dados) {
    rifaAtual = dados;
    faixas = dados.faixas || [];
    maxQtd = Math.min(5000, dados.disponiveis || 0);
    qtdCotas = maxQtd > 0 ? 1 : 0;
    numerosReservados = [];
    reservaAtiva = false;

    if (els.titulo) els.titulo.textContent = dados.titulo;
    if (els.disponiveis) els.disponiveis.textContent = String(dados.disponiveis || 0);
    if (els.verDetalhe) els.verDetalhe.href = tenantBase + '/rifas/' + dados.id;
    if (els.nome) els.nome.value = '';
    if (els.cpf) els.cpf.value = '';
    if (els.telefone) els.telefone.value = '';

    setQtd(qtdCotas);
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    if (window.initInputMasks) window.initInputMasks(modal);
    if (window.lucide) lucide.createIcons();
  }

  async function fecharModal() {
    await liberarReserva();
    modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
    rifaAtual = null;
    comprando = false;
  }

  document.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-abrir-modal]');
    if (!btn) return;
    abrirModal({
      id: parseInt(btn.dataset.rifaId, 10),
      titulo: btn.dataset.rifaTitulo,
      valorCota: parseFloat(btn.dataset.valorCota),
      disponiveis: parseInt(btn.dataset.disponiveis, 10) || 0,
      faixas: parseFaixas(btn.dataset.faixas)
    });
  });

  document.getElementById('modal-fechar')?.addEventListener('click', fecharModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) fecharModal(); });

  els.btnMenos?.addEventListener('click', function () { setQtd(qtdCotas - 1); });
  els.btnMais?.addEventListener('click', function () { setQtd(qtdCotas + 1); });
  els.inputQtd?.addEventListener('change', function () { setQtd(els.inputQtd.value); });
  els.inputQtd?.addEventListener('blur', function () { setQtd(els.inputQtd.value); });

  document.querySelectorAll('[data-modal-add]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setQtd(qtdCotas + parseInt(btn.dataset.modalAdd, 10));
    });
  });

  els.btnPix?.addEventListener('click', async function () {
    if (!rifaAtual || comprando || maxQtd === 0) return;

    const nome = els.nome?.value?.trim();
    const email = els.email?.value?.trim();
    const cpf = els.cpf?.value?.trim();
    const telefone = els.telefone?.value?.trim();
    if (!nome || nome.length < 2) {
      showToast('Informe seu nome completo.', 'error');
      els.nome?.focus();
      return;
    }
    if (!emailValido(email)) {
      showToast('Informe um e-mail válido.', 'error');
      els.email?.focus();
      return;
    }
    if (!cpfValido(cpf)) {
      showToast('Informe um CPF válido.', 'error');
      els.cpf?.focus();
      return;
    }
    if (!telefone || telefone.replace(/\D/g, '').length < 10) {
      showToast('Informe um WhatsApp válido.', 'error');
      els.telefone?.focus();
      return;
    }

    comprando = true;
    atualizarResumo();

    try {
      const aleatorio = await fetchApi(apiBase + '/rifas/' + rifaAtual.id + '/aleatorio', {
        method: 'POST',
        body: JSON.stringify({ quantidade: qtdCotas })
      });
      numerosReservados = aleatorio.numeros || [];

      await fetchApi(apiBase + '/rifas/' + rifaAtual.id + '/reservar', {
        method: 'POST',
        body: JSON.stringify({ numeros: numerosReservados })
      });
      reservaAtiva = true;

      const data = await fetchApi(apiBase + '/rifas/' + rifaAtual.id + '/comprar', {
        method: 'POST',
        body: JSON.stringify({ numeros: numerosReservados, nome, email: email.toLowerCase(), cpf, telefone })
      });

      reservaAtiva = false;
      numerosReservados = [];
      modal.classList.add('hidden');
      document.body.classList.remove('modal-open');

      // Mostrar modal de sucesso com QR Code em vez de redirecionar
      exibirModalSucesso(data);
    } catch (err) {
      await liberarReserva();
      showToast(err.message, 'error');
    } finally {
      comprando = false;
      atualizarResumo();
    }
  });
  function exibirModalSucesso(data) {
    const ms = document.getElementById('modal-sucesso-index');
    if (!ms) { window.location.href = tenantBase + '/comprovante/' + data.reservaId; return; }

    const nums = data.numeros || [];
    const numsDisplay = nums.length <= 18
      ? nums.join(', ')
      : nums.slice(0, 16).join(', ') + '… (+' + (nums.length - 16) + ')';

    const expiraEm = data.expiraEm ? new Date(data.expiraEm).getTime() : Date.now() + 10 * 60 * 1000;

    ms.querySelector('#ms-nums').textContent = numsDisplay;
    ms.querySelector('#ms-total').textContent = 'R$ ' + (data.valorTotal || 0).toFixed(2).replace('.', ',');
    ms.querySelector('#ms-qtd').textContent = nums.length;
    ms.querySelector('#ms-id').textContent = '#' + data.reservaId;

    const qrImg = ms.querySelector('#ms-qrcode');
    if (qrImg && data.qrCodeUrl) { qrImg.src = data.qrCodeUrl; qrImg.classList.remove('hidden'); }

    const pixData = data.copiaCola || data.payloadPix || '';
    const copyBtn = ms.querySelector('#ms-copiar');
    if (copyBtn) {
      copyBtn.onclick = function () {
        copiarPix(pixData, copyBtn);
      };
    }

    const linkComp = ms.querySelector('#ms-ver-comprovante');
    if (linkComp) linkComp.href = tenantBase + '/comprovante/' + data.reservaId;

    ms.classList.remove('hidden');
    document.body.classList.add('modal-open');

    // Countdown expiração
    const timerEl = ms.querySelector('#ms-timer');
    if (timerEl) {
      const iv = setInterval(function() {
        const diff = expiraEm - Date.now();
        if (diff <= 0) { timerEl.textContent = '00:00'; clearInterval(iv); return; }
        const min = Math.floor(diff / 60000);
        const seg = Math.floor((diff % 60000) / 1000);
        timerEl.textContent = String(min).padStart(2, '0') + ':' + String(seg).padStart(2, '0');
      }, 1000);
    }

    // Polling status
    let poll = 0;
    const statusEl = ms.querySelector('#ms-status-pix');
    const pollIv = setInterval(function() {
      poll++;
      if (poll > 60) { clearInterval(pollIv); return; }
      fetch(tenantBase + '/api/reservas/' + data.reservaId + '/status', {
        credentials: 'same-origin',
        headers: { 'ngrok-skip-browser-warning': 'true', 'X-Requested-With': 'XMLHttpRequest' }
      }).then(function(r){ return r.json(); }).then(function(d) {
        if (d.status === 'confirmado') {
          clearInterval(pollIv);
          if (statusEl) { statusEl.textContent = '✅ Pagamento confirmado!'; statusEl.className = 'text-sm font-bold text-emerald-600 text-center mt-2'; }
          setTimeout(function() {
            ms.classList.add('hidden');
            document.body.classList.remove('modal-open');
            window.location.href = tenantBase + '/comprovante/' + data.reservaId;
          }, 1500);
        }
        if (d.status === 'expirado') { clearInterval(pollIv); location.reload(); }
      }).catch(function(){});
    }, 5000);

    ms.querySelector('#ms-fechar')?.addEventListener('click', function() {
      clearInterval(pollIv);
      ms.classList.add('hidden');
      document.body.classList.remove('modal-open');
      location.reload();
    });
  }
})();
