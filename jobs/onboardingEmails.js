/**
 * Job de e-mails de onboarding — nurture D+1/D+3/D+7 para organizadores sem rifa.
 */
const OnboardingEmailService = require('../services/onboardingEmailService');

const INTERVALO_MS = 6 * 60 * 60 * 1000;

async function processar() {
  try {
    await OnboardingEmailService.processarNurture();
  } catch (e) {
    console.error('[Onboarding] Erro:', e.message);
  }
}

function iniciar() {
  setTimeout(() => {
    processar();
    setInterval(processar, INTERVALO_MS);
  }, 60_000);

  console.log(`[Onboarding] Job iniciado — nurture D+1/D+3/D+7 a cada ${INTERVALO_MS / 3600000}h`);
}

module.exports = { iniciar, processar };
