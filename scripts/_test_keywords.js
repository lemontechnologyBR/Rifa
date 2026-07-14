const { tenantKeywords, rifaKeywords } = require('../lib/seoMeta');

const tenant = {
  nome: 'Rifa da Igreja',
  descricao: 'Sorteios beneficentes para reformar o salao paroquial de Sorocaba'
};

const rifa = {
  titulo: 'TV Samsung 65 polegadas',
  descricao: 'TV de ultima geracao com tela QLED e som surround',
  premios: [{ titulo: 'TV Samsung 65pol' }, { titulo: 'Voucher R$500' }]
};

console.log('=== tenantKeywords (com descricao):');
console.log(tenantKeywords(tenant));

console.log('\n=== rifaKeywords (com descricao + premios):');
console.log(rifaKeywords(rifa, tenant.nome));

console.log('\n=== tenantKeywords (string simples, retrocompativel):');
console.log(tenantKeywords('Nome Simples'));
