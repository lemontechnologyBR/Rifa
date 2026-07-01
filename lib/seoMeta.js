/**
 * Metadados SEO centralizados — alinhados com palavras-chave de organizador (Google Ads).
 */

const PLATFORM_BRAND = 'VouRifar';
const DEFAULT_OG_IMAGE = '/img/vourifar-logo.png';

const PLATFORM_KEYWORDS = [
  'plataforma de rifa online',
  'sistema de rifas online',
  'criar rifa online',
  'rifa digital com pix',
  'gerenciar rifas online',
  'app para criar rifa',
  'montar rifa online',
  'arrecadação com rifa',
  'plataforma para organizadores',
  'rifa online grátis',
  'painel de rifa online',
  'software de rifa online'
];

const CADASTRO_KEYWORDS = [
  'criar sistema de rifas grátis',
  'cadastro plataforma de rifas',
  'criar rifa online grátis',
  'montar rifa online',
  'plataforma de rifa gratuita',
  'sistema de rifas pix'
];

function truncate(text, max = 160) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

function absUrl(baseUrl, path = '') {
  const base = String(baseUrl || '').replace(/\/$/, '');
  if (!path) return base;
  return base + (path.startsWith('/') ? path : '/' + path);
}

function keywordsList(words) {
  return words.filter(Boolean).join(', ');
}

function tenantKeywords(tenantName) {
  return keywordsList([
    `${tenantName} rifas`,
    'rifas online',
    'rifa online pix',
    'participar rifa online',
    'cotas rifa'
  ]);
}

function rifaKeywords(titulo, tenantName) {
  return keywordsList([
    titulo,
    `${titulo} ${tenantName}`,
    'rifa online',
    'cota rifa pix',
    tenantName
  ]);
}

function platformFaq() {
  return [
    {
      q: 'Como criar uma rifa online na VouRifar?',
      a: 'Cadastre-se grátis, configure seu link exclusivo, publique a rifa com prêmio e valor da cota, e compartilhe o link. Os pagamentos via PIX são confirmados automaticamente.'
    },
    {
      q: 'A VouRifar é gratuita para organizadores?',
      a: 'Sim. Não há mensalidade para criar sua conta nem limite de rifas. A plataforma cobra apenas uma comissão sobre o valor arrecadado quando você vende cotas.'
    },
    {
      q: 'Como funciona o pagamento PIX nas rifas?',
      a: 'Cada comprador paga via PIX (QR Code ou copia e cola). Após a compensação, a cota é confirmada na hora — sem conferência manual de comprovantes.'
    },
    {
      q: 'Posso gerenciar várias rifas ao mesmo tempo?',
      a: 'Sim. Você pode criar e gerenciar quantas rifas quiser, com cotas ilimitadas, painel de vendas e link exclusivo para divulgar.'
    },
    {
      q: 'Preciso de conhecimento técnico para usar?',
      a: 'Não. A plataforma é 100% online e pensada para organizadores, igrejas, associações e eventos. Tudo funciona pelo navegador, inclusive no celular.'
    }
  ];
}

function faqJsonLd(faqItems) {
  return {
    '@type': 'FAQPage',
    mainEntity: faqItems.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a }
    }))
  };
}

function platformLandingMeta(appUrl) {
  const url = absUrl(appUrl, '/');
  const image = absUrl(appUrl, DEFAULT_OG_IMAGE);
  const faq = platformFaq();

  return {
    seoTitle: 'VouRifar — Plataforma para Criar e Gerenciar Rifas Online com PIX',
    seoDescription: truncate(
      'Plataforma grátis para organizadores criarem rifas online. Link exclusivo, cotas ilimitadas, PIX automático e painel completo. Cadastre-se e monte sua rifa em minutos.'
    ),
    seoKeywords: keywordsList(PLATFORM_KEYWORDS),
    seoUrl: url,
    seoType: 'website',
    seoImage: image,
    seoImageAlt: 'VouRifar — plataforma de rifas online com pagamento PIX',
    seoJsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          name: PLATFORM_BRAND,
          url,
          logo: image,
          description: 'Plataforma SaaS para criar e gerenciar rifas online com pagamento via PIX',
          areaServed: 'BR',
          knowsLanguage: 'pt-BR'
        },
        {
          '@type': 'WebSite',
          name: PLATFORM_BRAND,
          url,
          inLanguage: 'pt-BR',
          description: 'Sistema de rifas online para organizadores — crie, gerencie e receba via PIX',
          publisher: { '@type': 'Organization', name: PLATFORM_BRAND }
        },
        {
          '@type': 'WebPage',
          name: 'VouRifar — Plataforma de Rifas Online',
          url,
          description: 'Crie seu sistema de rifas online com PIX automático. Grátis para começar.',
          isPartOf: { '@type': 'WebSite', name: PLATFORM_BRAND, url },
          about: { '@type': 'SoftwareApplication', name: PLATFORM_BRAND }
        },
        {
          '@type': 'SoftwareApplication',
          name: PLATFORM_BRAND,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'BRL',
            description: 'Gratuito para criar conta e publicar rifas'
          },
          featureList: [
            'Rifas online com link exclusivo',
            'Pagamento PIX automático',
            'Painel de gestão de cotas',
            'Sem mensalidade'
          ]
        },
        faqJsonLd(faq)
      ]
    }
  };
}

function cadastroMeta(appUrl) {
  const url = absUrl(appUrl, '/cadastro');
  const image = absUrl(appUrl, DEFAULT_OG_IMAGE);

  return {
    seoTitle: 'Criar Sistema de Rifas Grátis — Cadastro VouRifar',
    seoDescription: truncate(
      'Cadastre-se grátis e crie seu sistema de rifas online em minutos. Plataforma com PIX automático, link exclusivo e gestão de cotas. Ideal para organizadores, igrejas e eventos.'
    ),
    seoKeywords: keywordsList(CADASTRO_KEYWORDS),
    seoUrl: url,
    seoType: 'website',
    seoImage: image,
    seoImageAlt: 'Cadastro VouRifar — criar plataforma de rifas online',
    seoJsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Cadastro — VouRifar',
      url,
      description: 'Crie sua conta grátis na plataforma de rifas online VouRifar',
      potentialAction: {
        '@type': 'RegisterAction',
        target: url,
        name: 'Criar conta grátis'
      }
    }
  };
}

function tenantIndexMeta({ baseUrl, tenant }) {
  const tenantUrl = absUrl(baseUrl, `/${tenant.slug}/`);
  const tenantDesc = tenant.descricao
    ? `${tenant.nome} — ${tenant.descricao}. Rifas online com pagamento via PIX.`
    : `${tenant.nome} — Rifas online com pagamento via PIX. Escolha sua cota e concorra a prêmios.`;

  return {
    seoTitle: `${tenant.nome} — Rifas Online com PIX`,
    seoDescription: truncate(tenantDesc),
    seoKeywords: tenantKeywords(tenant.nome),
    seoUrl: tenantUrl,
    seoType: 'website',
    seoImage: tenant.logoUrl || absUrl(baseUrl, DEFAULT_OG_IMAGE),
    seoImageAlt: `Rifas online — ${tenant.nome}`,
    seoJsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Store',
      name: tenant.nome,
      url: tenantUrl,
      description: tenantDesc,
      ...(tenant.logoUrl ? { image: tenant.logoUrl } : {}),
      ...(tenant.whatsapp ? { telephone: tenant.whatsapp } : {}),
      ...(tenant.instagram ? { sameAs: [`https://instagram.com/${tenant.instagram}`] } : {})
    }
  };
}

function rifaDetalheMeta({ baseUrl, tenant, rifa }) {
  const rifaUrl = absUrl(baseUrl, `/${tenant.slug}/rifas/${rifa.id}`);
  const plainDesc = rifa.descricao ? String(rifa.descricao).replace(/<[^>]+>/g, '') : '';
  const rifaDesc = plainDesc
    ? `${rifa.titulo} — ${plainDesc.slice(0, 100)}. Cota: R$ ${Number(rifa.valorCota).toFixed(2).replace('.', ',')}. Pagamento via PIX.`
    : `${rifa.titulo} — Participe desta rifa em ${tenant.nome}. Cota: R$ ${Number(rifa.valorCota).toFixed(2).replace('.', ',')}. Pagamento via PIX.`;
  const rifaImage = rifa.imagemUrl || tenant.logoUrl || absUrl(baseUrl, DEFAULT_OG_IMAGE);

  return {
    seoTitle: `${rifa.titulo} — Rifa Online | ${tenant.nome}`,
    seoDescription: truncate(rifaDesc),
    seoKeywords: rifaKeywords(rifa.titulo, tenant.nome),
    seoUrl: rifaUrl,
    seoType: 'product',
    seoImage: rifaImage,
    seoImageAlt: `${rifa.titulo} — rifa ${tenant.nome}`,
    seoJsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: rifa.titulo,
      description: rifaDesc,
      image: rifaImage,
      url: rifaUrl,
      brand: { '@type': 'Brand', name: tenant.nome },
      offers: {
        '@type': 'Offer',
        priceCurrency: 'BRL',
        price: Number(rifa.valorCota).toFixed(2),
        availability: rifa.status === 'ativa'
          ? 'https://schema.org/InStock'
          : 'https://schema.org/SoldOut',
        url: rifaUrl,
        seller: { '@type': 'Organization', name: tenant.nome }
      }
    }
  };
}

module.exports = {
  PLATFORM_BRAND,
  DEFAULT_OG_IMAGE,
  PLATFORM_KEYWORDS,
  truncate,
  absUrl,
  keywordsList,
  tenantKeywords,
  rifaKeywords,
  platformFaq,
  platformLandingMeta,
  cadastroMeta,
  tenantIndexMeta,
  rifaDetalheMeta
};
