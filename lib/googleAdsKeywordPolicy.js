/**
 * Filtros Google Ads — evita políticas: Dating, Copyright, Gov docs, Jogos de azar.
 * Keywords com "rifa" precisam contexto de ORGANIZADOR (criar/plataforma/sistema).
 */

const BLOCKED_WORDS = [
  'abrir',
  'sem custo',
  'loteria', 'aposta', 'apostas', 'cassino', 'casino', 'bet', 'bets',
  'jogo do bicho', 'jogos de azar', 'gambling', 'poker', 'roleta', 'bingo',
  'sorteio', 'sorteios', 'sortear', 'sorteios online',
  'comprar rifa', 'participar rifa', 'participar sorteio',
  'bilhete', 'bilhetes', 'ganhar rifa', 'ganhe rifa',
  'namoro', 'encontros', 'dating', 'acompanhante', 'relacionamento', 'tinder',
  'certidão', 'certidao', 'documento oficial', 'rg falso', 'cpf falso',
  'download grátis', 'download gratis', 'torrent', 'crack', 'pirata', 'pirataria',
  'vaquinha', 'crowdfunding'
];

const BLOCKED_PATTERNS = [
  /\bonline\s+online\b/i,
  /\bgratis\s+online\b/i,
  /\bgrátis\s+online\b/i,
  /\bgratuita\s+online\b/i,
  /\bgratuitas\s+online\b/i,
  /\bgratis\s+gratis\b/i,
  /\bgrátis\s+grátis\b/i,
  /\babrir\b/i,
  /\bsem custo\b/i,
  /\bmelhor site de\b/i,
  /\bcomo abrir\b/i,
  /\bsite de encontro/i,
  /\b(comprar|participar|jogar|ganhar|apostar)\b/i,
  /\bbilhete(s)?\b/i,
  /\bnumeros de rifa\b/i,
  /\bnúmeros de rifa\b/i,
  /\brifa online \d+\b/i,
  /\b\d+ numeros\b/i,
  /\b\d+ números\b/i,
  /^rifa online$/i,
  /^rifas online$/i,
  /^rifa digital$/i,
  /^rifa virtual$/i,
  /^rifa pix$/i,
  /^rifa grátis$/i,
  /^rifa gratis$/i,
  /^sua rifa online$/i,
  /^sua rifa digital$/i,
  /^sua rifa virtual$/i
];

/** Contexto B2B — quem CRIA/GERENCIA rifa, não quem aposta/compra */
const ORGANIZER_MARKERS = [
  'criar', 'fazer', 'montar', 'gerenciar', 'organizar', 'editar', 'lançar', 'administrar',
  'plataforma', 'sistema', 'app', 'aplicativo', 'software', 'ferramenta', 'programa',
  'painel', 'gerenciador', 'gestão', 'gestao', 'controle',
  'como criar', 'como fazer', 'como montar', 'como organizar', 'como gerenciar',
  'site para', 'site de rifa', 'site de rifas', 'site rifa', 'link de', 'página de', 'pagina de',
  'arrecadação', 'arrecadacao', 'beneficente', 'igreja', 'evento', 'associação', 'associacao',
  'vourifar', 'vou rifar', 'receber pix', 'pagamento pix', 'pix automático', 'pix automatico'
];

function norm(kw) {
  return kw.trim().replace(/\s+/g, ' ').toLowerCase();
}

function hasOrganizerContext(k) {
  return ORGANIZER_MARKERS.some((m) => k.includes(m));
}

function containsRifaTerm(k) {
  return /\brifa(s)?\b/.test(k);
}

function isKeywordSafe(kw) {
  const k = norm(kw);
  if (!k || k.length > 80) return false;

  for (const w of BLOCKED_WORDS) {
    if (k.includes(w)) return false;
  }
  for (const re of BLOCKED_PATTERNS) {
    if (re.test(k)) return false;
  }

  if (containsRifaTerm(k) && !hasOrganizerContext(k)) {
    return false;
  }

  const repeatSensitive = ['online', 'gratis', 'grátis', 'gratuita', 'rifa', 'rifas'];
  const words = k.split(' ');
  const seen = new Set();
  for (const w of words) {
    if (seen.has(w) && repeatSensitive.includes(w)) return false;
    seen.add(w);
  }

  return true;
}

function filterSafeKeywords(keywords) {
  const out = [];
  const seen = new Set();
  for (const kw of keywords) {
    const k = norm(kw);
    if (!isKeywordSafe(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out.sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

module.exports = {
  BLOCKED_WORDS,
  BLOCKED_PATTERNS,
  ORGANIZER_MARKERS,
  isKeywordSafe,
  filterSafeKeywords,
  norm,
  hasOrganizerContext,
  containsRifaTerm
};
