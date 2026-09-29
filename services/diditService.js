/**
 * KYC Didit — verificação de identidade obrigatória antes do saque.
 * Docs: https://docs.didit.me/sessions-api/create-session
 */

const crypto = require('crypto');
const prisma = require('../lib/prisma');

const API_BASE = (process.env.DIDIT_API_BASE || 'https://verification.didit.me/v3').replace(/\/$/, '');
const DEFAULT_WORKFLOW_ID = '0d591c51-d990-4aa2-a26f-cb455bc0342b'; // Custom KYC (default)

const STATUS_MAP = {
  Approved: 'aprovado',
  Declined: 'reprovado',
  'In Review': 'em_analise',
  'In Progress': 'em_andamento',
  'Not Started': 'pendente',
  Abandoned: 'abandonado',
  Resubmitted: 'em_andamento',
  'Kyc Expired': 'expirado'
};

function isConfigured() {
  return Boolean(process.env.DIDIT_API_KEY && String(process.env.DIDIT_API_KEY).trim());
}

function workflowId() {
  return process.env.DIDIT_WORKFLOW_ID || DEFAULT_WORKFLOW_ID;
}

function vendorDataForOrg(organizadorId) {
  return `org:${Number(organizadorId)}`;
}

function parseVendorOrgId(vendorData) {
  const m = String(vendorData || '').match(/^org:(\d+)$/);
  return m ? Number(m[1]) : null;
}

function mapStatus(diditStatus, fallback = 'em_andamento') {
  if (!diditStatus) return fallback;
  return STATUS_MAP[diditStatus] || fallback;
}

function isKycAprovado(org) {
  return org && String(org.kycStatus || '').toLowerCase() === 'aprovado';
}

function isStatusTerminalFalha(status) {
  return ['reprovado', 'abandonado', 'expirado'].includes(String(status || '').toLowerCase());
}

function isStatusEmCurso(status) {
  return ['em_andamento', 'em_analise', 'pendente'].includes(String(status || '').toLowerCase());
}

async function api(path, { method = 'GET', body } = {}) {
  if (!isConfigured()) {
    throw new Error('Didit não configurado. Defina DIDIT_API_KEY no ambiente.');
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'x-api-key': process.env.DIDIT_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const detail = data?.detail || data?.message || text || res.statusText;
    throw new Error(`Didit API (${res.status}): ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  }
  return data;
}

/**
 * Inicia ou reutiliza sessão KYC. Não cria sessão nova se a atual ainda for válida.
 */
async function iniciarVerificacao(organizador, { callbackUrl, language = 'pt', forcarNova = false } = {}) {
  if (!organizador?.id) throw new Error('Organizador inválido.');
  if (isKycAprovado(organizador)) {
    return { alreadyApproved: true, url: null, sessionId: organizador.kycSessionId };
  }

  // Reusa / sincroniza sessão existente antes de abrir outra
  if (!forcarNova && organizador.kycSessionId) {
    try {
      const decision = await obterDecisao(organizador.kycSessionId);
      const status = mapStatus(decision.status, organizador.kycStatus || 'em_andamento');

      await prisma.organizador.update({
        where: { id: organizador.id },
        data: {
          kycSessionId: organizador.kycSessionId,
          kycStatus: status,
          ...(status === 'aprovado' ? { kycVerifiedAt: new Date() } : {})
        }
      });

      if (status === 'aprovado') {
        return { alreadyApproved: true, url: null, sessionId: organizador.kycSessionId, status };
      }

      if (status === 'em_analise') {
        return {
          alreadyInReview: true,
          url: null,
          sessionId: organizador.kycSessionId,
          status
        };
      }

      const reuseUrl = decision.url || decision.session_url || decision.verification_url || null;
      if (isStatusEmCurso(status) && reuseUrl) {
        return {
          alreadyApproved: false,
          reused: true,
          url: reuseUrl,
          sessionId: organizador.kycSessionId,
          status
        };
      }

      // Em andamento sem URL reutilizável → cria nova (sessão antiga costuma estar morta)
      // Terminal falha → cria nova
      if (isStatusEmCurso(status) && !reuseUrl && status === 'em_andamento') {
        // tenta GET da sessão completa por se a decision não traz URL
        try {
          const full = await api(`/session/${encodeURIComponent(organizador.kycSessionId)}/`);
          const url = full?.url || full?.session_url || null;
          if (url) {
            return {
              alreadyApproved: false,
              reused: true,
              url,
              sessionId: organizador.kycSessionId,
              status
            };
          }
        } catch (_) {}
      }
    } catch (err) {
      console.warn(`[Didit] sessão anterior inválida org=${organizador.id}: ${err.message}`);
    }
  }

  const vendor_data = vendorDataForOrg(organizador.id);
  const session = await api('/session/', {
    method: 'POST',
    body: {
      workflow_id: workflowId(),
      vendor_data,
      callback: callbackUrl || undefined,
      language,
      metadata: {
        organizador_id: organizador.id,
        tenant_id: organizador.tenantId,
        email: organizador.email || undefined
      },
      contact_details: organizador.email
        ? { email: organizador.email }
        : undefined
    }
  });

  const mapped = mapStatus(session.status);
  await prisma.organizador.update({
    where: { id: organizador.id },
    data: {
      kycSessionId: session.session_id,
      kycStatus: mapped === 'aprovado' ? 'aprovado' : (mapped === 'em_analise' ? 'em_analise' : 'em_andamento'),
      ...(mapped === 'aprovado' ? { kycVerifiedAt: new Date() } : {})
    }
  });

  try {
    const AnalyticsService = require('./analyticsService');
    const tenant = await prisma.tenant.findUnique({
      where: { id: organizador.tenantId },
      select: { slug: true }
    });
    await AnalyticsService.registrarEvento({
      event: AnalyticsService.EVENTOS.KYC_START,
      tenantSlug: tenant?.slug || null,
      meta: { organizadorId: organizador.id, sessionId: session.session_id }
    });
  } catch (_) {}

  return {
    alreadyApproved: mapped === 'aprovado',
    url: session.url,
    sessionId: session.session_id,
    status: mapped
  };
}

/**
 * Sincroniza status local com Didit se houver sessão e ainda não estiver aprovado.
 * Usado na carteira e no job — não engole erros críticos de config.
 */
async function sincronizarOrganizadorSePreciso(organizador) {
  if (!organizador?.id || !organizador.kycSessionId) return organizador;
  if (isKycAprovado(organizador)) return organizador;
  if (!isConfigured()) return organizador;

  try {
    const { org } = await sincronizarPorSessionId(organizador.kycSessionId, {
      expectedOrgId: organizador.id
    });
    return org;
  } catch (err) {
    console.warn(`[Didit] sync org=${organizador.id}: ${err.message}`);
    return organizador;
  }
}

/**
 * Job: sincroniza organizadores travados em andamento/análise.
 */
async function sincronizarPendentes({ limit = 40 } = {}) {
  if (!isConfigured()) return { ok: true, skipped: true, motivo: 'didit_off' };

  const orgs = await prisma.organizador.findMany({
    where: {
      kycSessionId: { not: null },
      kycStatus: { in: ['em_andamento', 'em_analise', 'pendente'] }
    },
    orderBy: { id: 'asc' },
    take: limit,
    select: {
      id: true,
      email: true,
      kycStatus: true,
      kycSessionId: true,
      createdAt: true
    }
  });

  let synced = 0;
  let aprovados = 0;
  let erros = 0;
  for (const org of orgs) {
    try {
      const { status } = await sincronizarPorSessionId(org.kycSessionId, { expectedOrgId: org.id });
      synced += 1;
      if (status === 'aprovado') aprovados += 1;
    } catch (err) {
      erros += 1;
      console.warn(`[Didit sync] org=#${org.id} ${org.email}: ${err.message}`);
    }
  }

  return { ok: true, total: orgs.length, synced, aprovados, erros };
}

async function obterDecisao(sessionId) {
  if (!sessionId) throw new Error('session_id obrigatório.');
  return api(`/session/${encodeURIComponent(sessionId)}/decision/`);
}

function pushUrl(list, url, label) {
  if (!url || typeof url !== 'string') return;
  const u = url.trim();
  if (!u.startsWith('http')) return;
  if (list.some((x) => x.url === u)) return;
  list.push({ url: u, label });
}

/**
 * Extrai imagens/OCR da decisão Didit (v3 plural arrays + legado singular).
 */
function extrairEvidencias(decision) {
  const docs = [];
  const liveness = [];
  const idInfos = [];

  const idList = []
    .concat(decision?.id_verifications || [])
    .concat(decision?.id_verification ? [decision.id_verification] : []);

  for (const idv of idList) {
    if (!idv || typeof idv !== 'object') continue;
    pushUrl(docs, idv.front_image, 'Frente do documento');
    pushUrl(docs, idv.back_image, 'Verso do documento');
    pushUrl(docs, idv.full_front_image, 'Frente (frame completo)');
    pushUrl(docs, idv.full_back_image, 'Verso (frame completo)');
    pushUrl(docs, idv.portrait_image, 'Retrato do documento');
    if (Array.isArray(idv.document_images)) {
      idv.document_images.forEach((u, i) => pushUrl(docs, u, `Documento ${i + 1}`));
    }
    idInfos.push({
      status: idv.status || null,
      fullName: idv.full_name || idv.fullName || null,
      firstName: idv.first_name || null,
      lastName: idv.last_name || null,
      documentType: idv.document_type || idv.documentType || null,
      documentNumber: idv.document_number || idv.documentNumber || null,
      nationality: idv.nationality || null,
      dateOfBirth: idv.date_of_birth || idv.dateOfBirth || null,
      expirationDate: idv.expiration_date || null,
      issuingState: idv.issuing_state || null
    });
  }

  const liveList = []
    .concat(decision?.liveness_checks || [])
    .concat(decision?.liveness ? [decision.liveness] : []);

  for (const lv of liveList) {
    if (!lv || typeof lv !== 'object') continue;
    pushUrl(liveness, lv.reference_image, 'Selfie / liveness');
    pushUrl(liveness, lv.video_url, 'Vídeo liveness');
    if (Array.isArray(lv.images)) {
      lv.images.forEach((u, i) => pushUrl(liveness, u, `Liveness ${i + 1}`));
    }
  }

  const matchList = []
    .concat(decision?.face_matches || [])
    .concat(decision?.face_match ? [decision.face_match] : []);

  const faceMatchImages = [];
  const faceMatchMeta = [];
  for (const fm of matchList) {
    if (!fm || typeof fm !== 'object') continue;
    pushUrl(faceMatchImages, fm.source_image, 'Face match — documento');
    pushUrl(faceMatchImages, fm.target_image, 'Face match — selfie');
    faceMatchMeta.push({
      status: fm.status || null,
      score: fm.score != null ? Number(fm.score) : null
    });
  }

  const livenessImages = liveness.filter((x) => x.url && !/\.(webm|mp4)(\?|$)/i.test(x.url));
  const livenessVideos = liveness.filter((x) => x.url && /\.(webm|mp4)(\?|$)/i.test(x.url));

  return {
    sessionStatus: decision?.status || null,
    sessionId: decision?.session_id || null,
    documentos: docs,
    livenessImages,
    livenessVideos,
    faceMatchImages,
    faceMatchMeta,
    idInfos: idInfos.filter((i) => i.fullName || i.documentNumber || i.documentType || i.status)
  };
}

async function obterEvidenciasOrganizador(organizadorId) {
  const org = await prisma.organizador.findUnique({
    where: { id: Number(organizadorId) },
    select: {
      id: true,
      nome: true,
      email: true,
      kycStatus: true,
      kycSessionId: true,
      kycVerifiedAt: true,
      tenant: { select: { id: true, nome: true, slug: true } }
    }
  });
  if (!org) throw new Error('Organizador não encontrado.');
  if (!org.kycSessionId) {
    return { org, evidencias: null, erro: 'Sem sessão Didit. O organizador ainda não iniciou o KYC.' };
  }
  if (!isConfigured()) {
    return { org, evidencias: null, erro: 'Didit não configurado neste ambiente.' };
  }

  const decision = await obterDecisao(org.kycSessionId);
  const evidencias = extrairEvidencias(decision);
  return { org, evidencias, decision, erro: null };
}

/**
 * Sincroniza status do organizador a partir da decisão Didit (callback / poll).
 */
async function sincronizarPorSessionId(sessionId, { expectedOrgId } = {}) {
  const decision = await obterDecisao(sessionId);
  const vendorOrgId = parseVendorOrgId(decision.vendor_data);
  if (expectedOrgId && vendorOrgId && vendorOrgId !== Number(expectedOrgId)) {
    throw new Error('Sessão KYC não pertence a este organizador.');
  }

  const orgId = expectedOrgId || vendorOrgId;
  if (!orgId) {
    throw new Error('Não foi possível correlacionar a sessão KYC ao organizador.');
  }

  const status = mapStatus(decision.status);
  const data = {
    kycSessionId: sessionId,
    kycStatus: status,
    ...(status === 'aprovado' ? { kycVerifiedAt: new Date() } : {})
  };

  const org = await prisma.organizador.update({
    where: { id: Number(orgId) },
    data
  });

  if (status === 'aprovado') {
    try {
      const AnalyticsService = require('./analyticsService');
      const tenant = await prisma.tenant.findUnique({
        where: { id: org.tenantId },
        select: { slug: true }
      });
      await AnalyticsService.registrarEvento({
        event: AnalyticsService.EVENTOS.KYC_APPROVED,
        tenantSlug: tenant?.slug || null,
        meta: { organizadorId: org.id, sessionId }
      });
    } catch (_) {}
  }

  return { org, decision, status };
}

async function aplicarStatusWebhook({ sessionId, vendorData, status }) {
  const orgId = parseVendorOrgId(vendorData);
  let org = null;
  if (orgId) {
    org = await prisma.organizador.findUnique({ where: { id: orgId } });
  }
  if (!org && sessionId) {
    org = await prisma.organizador.findFirst({ where: { kycSessionId: sessionId } });
  }
  if (!org) {
    return { ok: false, reason: 'organizador_nao_encontrado' };
  }

  const mapped = mapStatus(status);
  const updated = await prisma.organizador.update({
    where: { id: org.id },
    data: {
      kycSessionId: sessionId || org.kycSessionId,
      kycStatus: mapped,
      ...(mapped === 'aprovado' ? { kycVerifiedAt: new Date() } : {})
    }
  });

  if (mapped === 'aprovado') {
    try {
      const AnalyticsService = require('./analyticsService');
      const tenant = await prisma.tenant.findUnique({
        where: { id: updated.tenantId },
        select: { slug: true }
      });
      await AnalyticsService.registrarEvento({
        event: AnalyticsService.EVENTOS.KYC_APPROVED,
        tenantSlug: tenant?.slug || null,
        meta: { organizadorId: updated.id, sessionId }
      });
    } catch (_) {}
  }

  return { ok: true, org: updated, status: mapped };
}

function shortenFloats(data) {
  if (Array.isArray(data)) return data.map(shortenFloats);
  if (data !== null && typeof data === 'object') {
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, shortenFloats(v)])
    );
  }
  if (typeof data === 'number' && !Number.isInteger(data) && data % 1 === 0) {
    return Math.trunc(data);
  }
  return data;
}

function sortKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeys(obj[key]);
        return acc;
      }, {});
  }
  return obj;
}

function timingSafeEqualHex(a, b) {
  try {
    const ba = Buffer.from(String(a), 'hex');
    const bb = Buffer.from(String(b), 'hex');
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * Valida assinatura do webhook Didit (X-Signature-V2 / Simple).
 * Sem DIDIT_WEBHOOK_SECRET, rejeita (produção deve configurar).
 */
function verificarAssinaturaWebhook(req, body) {
  const secret = process.env.DIDIT_WEBHOOK_SECRET;
  if (!secret) {
    return { ok: false, reason: 'secret_nao_configurado' };
  }

  const tsHeader = req.headers['x-timestamp'];
  const ts = Number(tsHeader);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    return { ok: false, reason: 'timestamp_invalido' };
  }

  const sigV2 = req.headers['x-signature-v2'];
  if (sigV2) {
    const canonical = JSON.stringify(sortKeys(shortenFloats(body)));
    const expected = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
    if (timingSafeEqualHex(expected, sigV2)) return { ok: true, method: 'v2' };
  }

  const sigSimple = req.headers['x-signature-simple'];
  if (sigSimple) {
    const payload = `${ts}:${body.session_id || ''}:${body.status || ''}:${body.webhook_type || ''}`;
    const expected = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
    if (timingSafeEqualHex(expected, sigSimple)) return { ok: true, method: 'simple' };
  }

  return { ok: false, reason: 'assinatura_invalida' };
}

module.exports = {
  isConfigured,
  isKycAprovado,
  isStatusTerminalFalha,
  isStatusEmCurso,
  iniciarVerificacao,
  obterDecisao,
  extrairEvidencias,
  obterEvidenciasOrganizador,
  sincronizarPorSessionId,
  sincronizarOrganizadorSePreciso,
  sincronizarPendentes,
  aplicarStatusWebhook,
  verificarAssinaturaWebhook,
  vendorDataForOrg,
  mapStatus
};
