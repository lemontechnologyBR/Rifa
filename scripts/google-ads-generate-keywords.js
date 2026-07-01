#!/usr/bin/env node
/**
 * Gera keywords SEGURAS — foco organizador/SaaS (evita política Jogos de Azar).
 * Uso: node scripts/google-ads-generate-keywords.js
 */
const fs = require('fs');
const path = require('path');
const { filterSafeKeywords, isKeywordSafe } = require('../lib/googleAdsKeywordPolicy');

const OUT = path.join(__dirname, '..', 'docs', 'google-ads-keywords-vourifar.txt');
const MAX_LEN = 80;

const ACTIONS = ['criar', 'fazer', 'montar', 'gerenciar', 'organizar'];
const HOW = ['como criar', 'como fazer', 'como montar', 'como organizar', 'como gerenciar'];
const FREE = ['gratis', 'grátis', 'gratuita', 'sem mensalidade', 'de graça'];
const OBJECTS = ['plataforma', 'sistema', 'app', 'aplicativo', 'software', 'ferramenta', 'painel', 'site'];
const NICHES = ['igreja', 'associação', 'associacao', 'escola', 'evento', 'beneficente', 'caridade', 'arrecadação', 'arrecadacao'];

/** Apenas frases com intenção de ORGANIZADOR — sem sorteio/comprar/bilhete */
const CORE_PHRASES = [
  'vourifar', 'vou rifar',
  'criar rifa online', 'fazer rifa online', 'montar rifa online', 'gerenciar rifa online', 'organizar rifa online',
  'criar rifa digital', 'fazer rifa digital', 'criar rifa virtual', 'fazer rifa virtual',
  'criar rifa online grátis', 'criar rifa online gratis', 'criar rifa online gratuita',
  'fazer rifa online grátis', 'fazer rifa online gratis',
  'como criar rifa online', 'como fazer rifa online', 'como montar rifa online',
  'como criar rifa online grátis', 'como fazer rifa online grátis',
  'rifa online gratis como fazer', 'rifa digital como fazer', 'rifa virtual como fazer',
  'plataforma de rifa', 'plataforma de rifas', 'plataforma rifa online',
  'melhor plataforma de rifa', 'melhor plataforma de rifa online',
  'sistema de rifa', 'sistema de rifas', 'sistema rifa online', 'sistema de rifa com pix',
  'app de rifa', 'app de rifas', 'app rifa online', 'aplicativo de rifa',
  'software de rifa', 'software rifa online', 'ferramenta de rifa', 'ferramenta para rifa online',
  'programa para criar rifa', 'programa para fazer rifa',
  'painel de rifa', 'painel rifa online', 'gerenciador de rifa', 'controle de rifa online',
  'gestão de rifa online', 'gestao de rifa online',
  'site de rifa online', 'site de rifas online', 'site para rifa online', 'site para criar rifa',
  'site para fazer rifa', 'criar site de rifa', 'criar site de rifas', 'criar site de rifa online',
  'como criar um site de rifas', 'como criar um site de rifas online', 'como criar site de rifa',
  'site rifa online', 'site rifa digital', 'link de rifa online', 'página de rifa online',
  'rifa online pix', 'rifa com pix', 'rifa com pagamento pix', 'rifa pix automático', 'rifa pix automatico',
  'rifa automática pix', 'rifa automatica pix', 'rifa com link de pagamento', 'criar rifa com link',
  'rifa online whatsapp', 'rifa para whatsapp', 'rifa pelo whatsapp',
  'rifa beneficente online', 'rifa para igreja', 'rifa para evento', 'rifa para associação',
  'rifa para arrecadar', 'arrecadação com rifa', 'arrecadação rifa online',
  'rifa para editar grátis', 'criar rifa grátis', 'criar rifa gratis', 'fazer rifa grátis',
  'plataforma de arrecadação online', 'sistema de arrecadação online', 'arrecadação online pix',
  'ferramenta arrecadação online', 'gestão de cotas online', 'gestao de cotas online',
  'sistema cotas pix', 'plataforma cotas pix', 'receber pix evento online',
  'plataforma para organizadores', 'software para organizadores de eventos',
  'site de rifa confiável', 'site de rifa confiavel',
  'plataforma rifa confiável', 'plataforma rifa confiavel',
  'sistema rifa confiável', 'sistema rifa confiavel'
];

function add(set, kw) {
  const k = kw.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!k || k.length > MAX_LEN || !isKeywordSafe(k)) return;
  set.add(k);
}

function generate() {
  const set = new Set();

  for (const p of CORE_PHRASES) add(set, p);

  for (const obj of OBJECTS) {
    add(set, `${obj} de rifa online`);
    add(set, `${obj} para criar rifa`);
    add(set, `${obj} para rifa online`);
    add(set, `criar ${obj} de rifa`);
    add(set, `criar ${obj} de rifa online`);
    for (const f of FREE) {
      add(set, `${obj} de rifa ${f}`);
      add(set, `criar ${obj} de rifa ${f}`);
    }
    for (const h of HOW) {
      add(set, `${h} ${obj} de rifa`);
      add(set, `${h} ${obj} de rifa online`);
    }
  }

  for (const action of ACTIONS) {
    add(set, `${action} rifa online`);
    add(set, `${action} rifa digital`);
    add(set, `${action} rifa virtual`);
    add(set, `${action} rifas online`);
    for (const f of FREE) {
      add(set, `${action} rifa online ${f}`);
      add(set, `${action} rifa digital ${f}`);
    }
  }

  for (const h of HOW) {
    add(set, `${h} rifa online`);
    add(set, `${h} rifa digital`);
    add(set, `${h} plataforma de rifa`);
    add(set, `${h} site de rifa online`);
    for (const f of FREE) add(set, `${h} rifa online ${f}`);
  }

  for (const niche of NICHES) {
    if (niche.includes('arrecad')) continue;
    add(set, `criar rifa para ${niche}`);
    add(set, `plataforma rifa ${niche}`);
    add(set, `sistema rifa ${niche}`);
    add(set, `rifa online para ${niche}`);
    add(set, `arrecadação online para ${niche}`);
  }

  return filterSafeKeywords([...set]);
}

const keywords = generate();

const header = [
  `# VouRifar — ${keywords.length} palavras-chave (organizador/SaaS — sem jogos de azar)`,
  `# Gerado em ${new Date().toISOString().slice(0, 10)}`,
  `# Removidos: sorteio, comprar/participar, bilhetes, rifa online isolada, melhor site de, abrir, sem custo`,
  `# Regra: "rifa" só com contexto criar/plataforma/sistema/gerenciar`,
  ''
].join('\n');

fs.writeFileSync(OUT, header + keywords.join('\n') + '\n', 'utf8');

console.log(`✅ ${keywords.length} keywords seguras (anti jogos de azar)`);
console.log('   Arquivo: docs/google-ads-keywords-vourifar.txt');
console.log('');
console.log('⚠️  No Google Ads: remova TODAS as keywords antigas e cole a lista nova.');
console.log('   Revise também títulos/descrições do anúncio — evite "sorteio" e "ganhe".');
