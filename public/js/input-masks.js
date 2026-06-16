/**
 * Máscaras de CPF e telefone (BR) nos formulários públicos.
 */
(function () {
  function onlyDigits(v) {
    return String(v || '').replace(/\D/g, '');
  }

  function maskCpf(value) {
    const d = onlyDigits(value).slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  function maskTelefone(value) {
    const d = onlyDigits(value).slice(0, 11);
    if (!d.length) return '';
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  function bindMask(input, formatter) {
    if (!input || input.dataset.maskBound) return;
    input.dataset.maskBound = '1';

    input.addEventListener('input', function () {
      const start = input.selectionStart || 0;
      const prevLen = input.value.length;
      input.value = formatter(input.value);
      const nextLen = input.value.length;
      let pos = start + (nextLen - prevLen);
      if (pos < 0) pos = 0;
      if (pos > nextLen) pos = nextLen;
      try { input.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
    });

    if (input.value) input.value = formatter(input.value);
  }

  function initMasks(root) {
    const scope = root || document;
    scope.querySelectorAll('#input-cpf, #modal-cpf, #input-busca-cpf, input[name="cpf"]').forEach(function (el) {
      bindMask(el, maskCpf);
    });
    scope.querySelectorAll('#modal-telefone, #input-telefone, input[name="telefone"]').forEach(function (el) {
      bindMask(el, maskTelefone);
    });
  }

  window.initInputMasks = initMasks;
  window.maskCpf = maskCpf;
  window.maskTelefone = maskTelefone;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMasks);
  } else {
    initMasks();
  }
})();
