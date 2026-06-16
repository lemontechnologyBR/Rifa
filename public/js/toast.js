/**
 * Sistema de notificações toast — feedback visual para o usuário.
 */

function showToast(mensagem, tipo = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const cores = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-blue-600',
    warning: 'bg-yellow-500'
  };

  const toast = document.createElement('div');
  toast.className = `${cores[tipo] || cores.info} text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium transform transition-all duration-300 translate-x-full opacity-0 max-w-sm`;
  toast.textContent = mensagem;

  container.appendChild(toast);

  // Anima entrada
  requestAnimationFrame(() => {
    toast.classList.remove('translate-x-full', 'opacity-0');
  });

  // Remove após 4 segundos
  setTimeout(() => {
    toast.classList.add('translate-x-full', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
