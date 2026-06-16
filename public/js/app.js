/** App global — Notyf, CSRF helper, infinite scroll */
const notyf = new Notyf({ duration: 4000, position: { x: 'right', y: 'top' }, dismissible: true });

function showToast(msg, tipo = 'info') {
  if (tipo === 'success') notyf.success(msg);
  else if (tipo === 'error') notyf.error(msg);
  else notyf.open({ type: 'info', message: msg });
}

function getCsrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content || '';
}

async function fetchApi(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-CSRF-Token': getCsrfToken(),
    'ngrok-skip-browser-warning': 'true',
    'X-Requested-With': 'XMLHttpRequest',
    ...(options.headers || {})
  };
  const resp = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  let data;
  try {
    data = await resp.json();
  } catch (e) {
    throw new Error('Resposta inválida do servidor. Recarregue a página (ngrok pode ter bloqueado a requisição).');
  }
  if (!resp.ok) throw new Error(data.erro || 'Erro na requisição');
  return data;
}

// Paginação infinita na home
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('rifas-container');
  const loader = document.getElementById('load-more');
  if (!container || !loader) return;

  let page = parseInt(container.dataset.page) || 1;
  const paginas = parseInt(container.dataset.paginas) || 1;
  const slug = container.dataset.slug || '';
  const organizadorNome = container.dataset.organizadorNome || '';
  const base = slug ? `/${slug}` : '';
  let loading = false;

  const observer = new IntersectionObserver(async (entries) => {
    if (entries[0].isIntersecting && !loading && page < paginas) {
      loading = true;
      page++;
      try {
        const resp = await fetch(`${base}/?page=${page}&ajax=1`, {
          credentials: 'same-origin',
          headers: { 'ngrok-skip-browser-warning': 'true', 'X-Requested-With': 'XMLHttpRequest' }
        });
        const data = await resp.json();
        data.rifas.forEach((rifa) => {
          container.insertAdjacentHTML('beforeend', renderCard(rifa, slug, organizadorNome));
        });
        lucide.createIcons();
        if (page >= data.paginas) loader.remove();
      } catch (e) { console.error(e); }
      loading = false;
    }
  }, { threshold: 0.1 });

  observer.observe(loader);
});

function renderCard(rifa, slug, organizadorNome = '') {
  const base = slug ? `/${slug}` : '';
  const pct = Math.round(((rifa.stats.total - rifa.stats.disponiveis) / rifa.stats.total) * 100);
  const vendidos = rifa.stats.total - rifa.stats.disponiveis;
  const tituloEsc = (rifa.titulo || '').replace(/"/g, '&quot;');
  const orgEsc = (organizadorNome || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const faixasEnc = encodeURIComponent(JSON.stringify(rifa.faixasDesconto || []));
  const brandStyle = (rifa.brand && rifa.brand.cssVars)
    ? rifa.brand.cssVars
    : (rifa.corPrimaria ? ('--brand-from:' + rifa.corPrimaria + ';--brand-to:' + rifa.corPrimaria + ';--brand-accent:' + rifa.corPrimaria) : '');
  const img = rifa.imagemUrl
    ? `<div class="relative h-48 sm:h-52 overflow-hidden"><img src="${rifa.imagemUrl}" alt="${tituloEsc}" class="w-full h-full object-cover" loading="lazy"><span class="absolute top-3 left-3 px-2.5 py-1 rounded-full text-white text-xs font-bold rifa-brand-badge">ATIVA</span></div>`
    : '';
  return `<article class="public-rifa-card flex flex-col"${brandStyle ? ` style="${brandStyle}"` : ''}>
    ${img}
    <div class="p-6 flex flex-col flex-1">
      <h3 class="font-bold text-lg sm:text-xl text-gray-900 dark:text-white mb-1 leading-snug">${rifa.titulo}</h3>
      ${orgEsc ? `<p class="text-xs text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-1"><i data-lucide="user-round" class="w-3 h-3 shrink-0"></i> ${orgEsc}</p>` : ''}
      <div class="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <p class="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold mb-0.5">Valor da cota</p>
          <p class="text-2xl sm:text-3xl font-extrabold rifa-brand-text">R$ ${rifa.valorCota.toFixed(2).replace('.', ',')}</p>
        </div>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          <p>${vendidos} / ${rifa.stats.total} vendidos</p>
          <p class="flex items-center gap-1 mt-1"><i data-lucide="calendar" class="w-3.5 h-3.5"></i> Sorteio: ${new Date(rifa.dataSorteio).toLocaleDateString('pt-BR')}</p>
        </div>
      </div>
      <div class="mb-4">
        <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5"><span>Progresso</span><span class="font-semibold rifa-brand-text">${pct}%</span></div>
        <div class="public-progress-track"><div class="public-progress-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="mt-auto flex flex-col sm:flex-row gap-2">
        <button type="button" class="public-btn-primary flex-1 py-3.5 px-4 text-center text-sm sm:text-base rounded-xl" data-abrir-modal data-rifa-id="${rifa.id}" data-rifa-titulo="${tituloEsc}" data-valor-cota="${rifa.valorCota}" data-disponiveis="${rifa.stats.disponiveis}" data-faixas="${faixasEnc}">Participar agora →</button>
        <a href="${base}/rifas/${rifa.id}" class="flex-1 py-3.5 px-4 text-center text-sm font-semibold rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 bg-white dark:bg-slate-800 rifa-brand-outline transition flex items-center justify-center gap-1.5">Ver detalhes</a>
      </div>
    </div>
  </article>`;
}
