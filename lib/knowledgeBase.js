/**
 * Central de ajuda VouRifar — artigos self-serve (organizador + comprador).
 */
const {
  TAXA_PLATAFORMA_WOOVI,
  TAXA_FIXA_COTA_WOOVI,
  TAXA_SAQUE,
  SAQUE_MINIMO
} = require('./config');

const pct = Math.round(TAXA_PLATAFORMA_WOOVI * 100);
const taxaFixa = TAXA_FIXA_COTA_WOOVI.toFixed(2).replace('.', ',');
const taxaLabel = `${pct}% + R$ ${taxaFixa}/cota`;
const saqueMin = SAQUE_MINIMO.toFixed(2).replace('.', ',');
const taxaSaque = TAXA_SAQUE.toFixed(2).replace('.', ',');

const ARTIGOS = [
  {
    slug: 'criar-conta',
    titulo: 'Criar conta e acessar o painel',
    resumo: 'Cadastro gratuito, URL do seu sistema e login no painel do organizador.',
    audiencia: 'organizador',
    tags: ['cadastro', 'login', 'painel'],
    blocks: [
      {
        type: 'p',
        text: 'Na VouRifar você cria um sistema de rifas próprio (com link exclusivo) sem mensalidade. Em poucos minutos já consegue publicar o primeiro sorteio.'
      },
      {
        type: 'steps',
        items: [
          'Acesse vourifar.com.br/cadastro (ou “Começar grátis” na página inicial).',
          'Informe seus dados ou continue com Google.',
          'Escolha o nome do sistema e a URL pública (ex.: vourifar.com.br/minhaloja).',
          'Após criar, você entra no painel e o assistente abre para criar a primeira rifa.'
        ]
      },
      {
        type: 'callout',
        title: 'Dica',
        text: 'Guarde o e-mail e a senha. Para voltar depois, use “Acessar painel” em vourifar.com.br/acessar.'
      },
      {
        type: 'p',
        text: 'A chave PIX não é obrigatória para criar a rifa. Ela só é necessária depois, para liberar as vendas e o saque.'
      }
    ]
  },
  {
    slug: 'primeira-rifa',
    titulo: 'Criar e publicar o primeiro sorteio',
    resumo: 'Prêmio, valor da cota, quantidade e data — do zero ao link público.',
    audiencia: 'organizador',
    tags: ['rifa', 'sorteio', 'publicar'],
    blocks: [
      {
        type: 'p',
        text: 'No painel, vá em Rifas e clique em criar. O assistente guia em 3 passos: prêmio, sorteio e confirmação.'
      },
      {
        type: 'ul',
        items: [
          'Título e prêmio claros (único, duplo ou pódio 1º/2º/3º).',
          'Valor da cota e total de cotas — a simulação mostra quanto você recebe após a comissão.',
          'Data e horário do sorteio.',
          'Modalidade: por cotas (números aleatórios) ou grade (participante escolhe), quando disponível.'
        ]
      },
      {
        type: 'callout',
        title: 'Importante',
        text: 'Sem PIX na Carteira a rifa pode ficar no ar, mas as vendas ficam pausadas até você cadastrar a chave.'
      },
      {
        type: 'p',
        text: 'Depois de publicar, copie o link e compartilhe. Você pode editar o total de cotas enquanto a rifa estiver ativa (respeitando cotas já vendidas).'
      }
    ]
  },
  {
    slug: 'carteira-pix',
    titulo: 'Configurar a Carteira (chave PIX)',
    resumo: 'Cadastre o PIX para liberar vendas e acumular saldo na plataforma.',
    audiencia: 'organizador',
    tags: ['pix', 'carteira', 'vendas'],
    blocks: [
      {
        type: 'p',
        text: 'A Carteira é onde a VouRifar sabe para quem enviar o dinheiro das vendas. Sem chave PIX válida, o comprador não consegue pagar.'
      },
      {
        type: 'steps',
        items: [
          'No painel, abra Carteira.',
          'Escolha o tipo da chave (CPF, CNPJ, e-mail, telefone ou aleatória).',
          'Informe a chave exatamente como está no banco e salve.',
          'Volte à rifa e compartilhe o link — as vendas passam a gerar PIX automático.'
        ]
      },
      {
        type: 'ul',
        items: [
          'CPF/CNPJ: use só números ou com máscara; o sistema valida o formato.',
          'Telefone: com DDD (pode incluir +55).',
          'A mesma chave PIX não pode ser usada em duas contas diferentes na plataforma.'
        ]
      },
      {
        type: 'callout',
        title: 'Fluxo do dinheiro',
        text: 'O comprador paga o valor exato da cota. A plataforma confirma o PIX, desconta a comissão e o restante fica disponível para saque na Carteira.'
      }
    ]
  },
  {
    slug: 'comissoes',
    titulo: `Comissões: ${taxaLabel}`,
    resumo: 'O que a plataforma retém por venda e o que sobra para você.',
    audiencia: 'organizador',
    tags: ['taxa', 'comissão', 'preço'],
    blocks: [
      {
        type: 'p',
        text: `Não há mensalidade. A VouRifar cobra apenas quando há venda confirmada: ${taxaLabel}. O comprador sempre paga o valor exato da cota, sem acréscimo.`
      },
      {
        type: 'ul',
        items: [
          `Exemplo: cota de R$ 10 → comissão ${pct}% (R$ ${(10 * TAXA_PLATAFORMA_WOOVI).toFixed(2).replace('.', ',')}) + R$ ${taxaFixa} fixos = R$ ${(10 * TAXA_PLATAFORMA_WOOVI + TAXA_FIXA_COTA_WOOVI).toFixed(2).replace('.', ',')} → você recebe R$ ${(10 * (1 - TAXA_PLATAFORMA_WOOVI) - TAXA_FIXA_COTA_WOOVI).toFixed(2).replace('.', ',')}.`,
          'A simulação no assistente de nova rifa usa esses mesmos números.',
          'Pacotes e descontos mudam o valor pago; a comissão percentual + fixa por cota continua valendo sobre a venda.'
        ]
      },
      {
        type: 'callout',
        title: 'Transparência',
        text: 'No painel e na Carteira você vê o faturamento líquido (sua parte) separado do volume pago pelos compradores.'
      }
    ]
  },
  {
    slug: 'saque-pin-kyc',
    titulo: 'Saque, PIN e verificação de identidade (KYC)',
    resumo: `Mínimo R$ ${saqueMin}, taxa de saque, PIN de 6 dígitos e Didit.`,
    audiencia: 'organizador',
    tags: ['saque', 'pin', 'kyc', 'didit'],
    blocks: [
      {
        type: 'p',
        text: 'O saldo das vendas fica na plataforma até você solicitar o saque para a chave PIX cadastrada.'
      },
      {
        type: 'ul',
        items: [
          `Saque mínimo: R$ ${saqueMin}.`,
          `Taxa de saque: R$ ${taxaSaque} por solicitação (quando aplicável).`,
          'É preciso definir um PIN de 6 dígitos na Carteira antes do primeiro saque.',
          'Em contas com verificação Didit ativa, a identidade (documento + liveness) precisa estar aprovada para sacar.'
        ]
      },
      {
        type: 'steps',
        items: [
          'Conclua o KYC pela Carteira, se solicitado (siga as instruções na tela do Didit).',
          'Crie ou confirme o PIN.',
          'Informe o valor e confirme o saque.',
          'Acompanhe o status na própria Carteira (pendente, pago ou falha).'
        ]
      },
      {
        type: 'callout',
        title: 'Problemas no saque?',
        text: 'Confira se a chave PIX está correta e se o KYC não foi reprovado. Se o saldo estiver bloqueado pela operação, use o chat de suporte na plataforma.'
      }
    ]
  },
  {
    slug: 'compartilhar-link',
    titulo: 'Compartilhar o link e vender',
    resumo: 'Link da loja vs link da rifa, WhatsApp e boas práticas de divulgação.',
    audiencia: 'organizador',
    tags: ['divulgação', 'whatsapp', 'link'],
    blocks: [
      {
        type: 'p',
        text: 'Ter a rifa publicada não vende sozinho — o tráfego vem do seu compartilhamento.'
      },
      {
        type: 'ul',
        items: [
          'Link da rifa: leva direto ao sorteio (melhor para Stories e WhatsApp).',
          'Link da loja (sua URL): lista todos os sorteios ativos.',
          'No painel de Rifas, use o botão de compartilhar / copiar link.'
        ]
      },
      {
        type: 'callout',
        title: 'Dica de conversão',
        text: 'Comece pelo círculo próximo (família, grupos, clientes). Mensagem curta + print do prêmio + link costuma converter mais que post genérico.'
      }
    ]
  },
  {
    slug: 'realizar-sorteio',
    titulo: 'Quando e como realizar o sorteio',
    resumo: 'Data, meta mínima, múltiplos prêmios e resultado público.',
    audiencia: 'organizador',
    tags: ['sorteio', 'vencedor', 'meta'],
    blocks: [
      {
        type: 'p',
        text: 'O botão Sortear fica disponível quando as regras da rifa forem atendidas (data e, se houver, meta mínima de cotas vendidas).'
      },
      {
        type: 'ul',
        items: [
          'Confira data/hora do sorteio no painel.',
          'Se configurou meta mínima (%), ela precisa ser atingida.',
          'Com pódio, o sistema define vencedores conforme os prêmios cadastrados.',
          'Após o sorteio, o resultado fica público na página da rifa.'
        ]
      },
      {
        type: 'callout',
        title: 'Atenção',
        text: 'Sortear é ação irreversível. Confirme os dados antes de executar.'
      }
    ]
  },
  {
    slug: 'como-comprar',
    titulo: 'Como comprar cotas e pagar no PIX',
    resumo: 'Passo a passo do participante: escolher, reservar e pagar.',
    audiencia: 'comprador',
    tags: ['comprar', 'pix', 'cotas'],
    blocks: [
      {
        type: 'steps',
        items: [
          'Abra o link do sorteio enviado pelo organizador.',
          'Escolha a quantidade de cotas (ou os números, se for grade).',
          'Informe nome, CPF e telefone.',
          'Pague o PIX (QR Code ou copia e cola) pelo app do banco.',
          'Aguarde a confirmação automática — a cota fica garantida após a compensação.'
        ]
      },
      {
        type: 'p',
        text: 'Você paga exatamente o valor da cota, sem taxa extra no checkout.'
      },
      {
        type: 'callout',
        title: 'Prazo',
        text: 'A reserva expira em cerca de 10 minutos se o PIX não for confirmado. Depois disso, as cotas voltam a ficar disponíveis.'
      }
    ]
  },
  {
    slug: 'reserva-expirada',
    titulo: 'Reserva expirada ou PIX não confirmado',
    resumo: 'O que fazer se o tempo acabou ou o pagamento não aparece.',
    audiencia: 'comprador',
    tags: ['reserva', 'expirado', 'pix'],
    blocks: [
      {
        type: 'p',
        text: 'Se o pagamento não for identificado a tempo, a reserva cancela e os números/cotas são liberados.'
      },
      {
        type: 'ul',
        items: [
          'Faça uma nova reserva e gere um PIX novo — não reutilize um código antigo.',
          'Confira se pagou o valor e a chave corretos do QR gerado na hora.',
          'Bancos podem demorar alguns minutos; atualize a página de status da reserva.',
          'Se o valor saiu da conta e a cota não confirmou, fale com o organizador ou com o suporte da plataforma pelo chat.'
        ]
      }
    ]
  },
  {
    slug: 'minhas-reservas',
    titulo: 'Minhas reservas e comprovante',
    resumo: 'Consultar compras pelo CPF e baixar/abrir o comprovante.',
    audiencia: 'comprador',
    tags: ['reservas', 'comprovante', 'cpf'],
    blocks: [
      {
        type: 'p',
        text: 'No site do organizador, use “Minhas reservas” e informe o CPF usado na compra para ver status e números.'
      },
      {
        type: 'ul',
        items: [
          'Status típicos: aguardando pagamento, confirmada, expirada ou cancelada.',
          'Reservas confirmadas mostram os números/cotas e o link do comprovante.',
          'Guarde o CPF e o telefone cadastrados — são a chave da consulta.'
        ]
      }
    ]
  },
  {
    slug: 'editar-excluir-rifa',
    titulo: 'Editar cotas ou excluir um sorteio',
    resumo: 'O que pode mudar com a rifa ativa e quando a exclusão é bloqueada.',
    audiencia: 'organizador',
    tags: ['editar', 'excluir', 'cotas'],
    blocks: [
      {
        type: 'ul',
        items: [
          'Com a rifa ativa, em geral você pode ajustar o total de cotas (sem ficar abaixo do já vendido).',
          'Título, descrição, imagens e prêmios também podem ser atualizados no editor.',
          'Excluir sorteio só é permitido se não houver cotas pagas — proteção dos participantes.'
        ]
      },
      {
        type: 'callout',
        title: 'Boas práticas',
        text: 'Evite mudar regras essenciais (valor da cota, data) depois de muita divulgação. Transparência com o público reduz reclamações.'
      }
    ]
  },
  {
    slug: 'premios-podio',
    titulo: 'Prêmios: único, duplo ou pódio',
    resumo: 'Como cadastrar 1º, 2º e 3º lugares no assistente de rifa.',
    audiencia: 'organizador',
    tags: ['prêmio', 'pódio', 'sorteio'],
    blocks: [
      {
        type: 'p',
        text: 'No passo do prêmio você escolhe o modo: um prêmio principal, dois prêmios ou pódio completo (1º, 2º e 3º).'
      },
      {
        type: 'ul',
        items: [
          'Descreva cada prêmio com clareza (o que o vencedor leva).',
          'No sorteio, a plataforma atribui vencedores conforme a ordem dos prêmios.',
          'Imagens do prêmio ajudam na conversão na página pública.'
        ]
      }
    ]
  }
];

const CATEGORIAS = [
  {
    id: 'organizador',
    titulo: 'Para organizadores',
    descricao: 'Conta, rifas, PIX, saque e divulgação'
  },
  {
    id: 'comprador',
    titulo: 'Para participantes',
    descricao: 'Comprar cotas, PIX e consultar reservas'
  }
];

function listarArtigos({ audiencia, q } = {}) {
  let lista = ARTIGOS.slice();
  if (audiencia === 'organizador' || audiencia === 'comprador') {
    lista = lista.filter((a) => a.audiencia === audiencia);
  }
  const termo = String(q || '').trim().toLowerCase();
  if (termo) {
    lista = lista.filter((a) => {
      const blob = [a.titulo, a.resumo, ...(a.tags || []), a.slug].join(' ').toLowerCase();
      return blob.includes(termo);
    });
  }
  return lista;
}

function buscarArtigo(slug) {
  return ARTIGOS.find((a) => a.slug === String(slug || '').trim()) || null;
}

function artigosRelacionados(artigo, limite = 3) {
  if (!artigo) return [];
  return ARTIGOS
    .filter((a) => a.slug !== artigo.slug && a.audiencia === artigo.audiencia)
    .slice(0, limite);
}

function ajudaIndexMeta(baseUrl) {
  return {
    seoTitle: 'Central de Ajuda — VouRifar',
    seoDescription: 'Aprenda a criar rifas, configurar PIX, sacar, comprar cotas e resolver dúvidas na VouRifar.',
    seoCanonical: `${String(baseUrl || '').replace(/\/$/, '')}/ajuda`,
    seoType: 'website'
  };
}

function ajudaArtigoMeta(artigo, baseUrl) {
  if (!artigo) return ajudaIndexMeta(baseUrl);
  return {
    seoTitle: `${artigo.titulo} — Ajuda VouRifar`,
    seoDescription: artigo.resumo,
    seoCanonical: `${String(baseUrl || '').replace(/\/$/, '')}/ajuda/${artigo.slug}`,
    seoType: 'article'
  };
}

module.exports = {
  ARTIGOS,
  CATEGORIAS,
  taxaLabel,
  listarArtigos,
  buscarArtigo,
  artigosRelacionados,
  ajudaIndexMeta,
  ajudaArtigoMeta
};
