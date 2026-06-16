# 🎟️ Sistema de Rifas Online v2

Sistema completo de rifas com **Node.js**, **Express**, **Prisma ORM**, **SQLite**, **EJS**, **Tailwind CSS**, **Alpine.js**, **Chart.js** e camada de **services**.

---

## ✨ Novidades da v2

| Área | Melhorias |
|------|-----------|
| **Usuários** | Cadastro/login, Minha Conta, recuperação de senha (e-mail simulado), link de indicação |
| **Compra** | Carrinho persistente 30 min, PIX copia-e-cola + QR Code, webhook automático |
| **Rifas** | Múltiplos prêmios, faixas de desconto, meta mínima de vendas, número da sorte |
| **Admin** | Dashboard Chart.js, export CSV, filtros, log de atividades |
| **Segurança** | Helmet, rate-limit, CSRF, express-validator, camada service |
| **UX** | Dark mode, Notyf, Alpine.js, lazy loading, paginação infinita, rifas encerradas |
| **Social** | WhatsApp share, comentários, indicação com bônus |
| **DevOps** | Docker, testes Jest, seed completo |

---

## 📁 Estrutura

```
Rifa/
├── app.js
├── prisma/schema.prisma
├── lib/                  # prisma client, helpers
├── services/             # lógica de negócio
├── controllers/
├── routes/
├── middleware/           # auth, csrf, rate-limit, validators
├── views/
├── public/
├── database/seed.js
├── tests/
├── scripts/simular-webhook.js
├── Dockerfile
└── docker-compose.yml
```

---

## 🚀 Instalação

### Pré-requisitos
- Node.js **18+** (recomendado 22+)
- npm

### Passos

```powershell
cd "c:\Users\LEMON TECHNOLOGY\Documents\Rifa"

# 1. Copiar variáveis de ambiente
copy .env.example .env

# 2. Instalar dependências
npm install

# 3. Criar banco (Prisma)
npm run db:push

# 4. Popular dados de teste
npm run seed

# 5. Iniciar servidor
npm start
```

| URL | Descrição |
|-----|-----------|
| http://localhost:3000 | Site público |
| http://localhost:3000/admin | Painel admin (`admin` / `admin123`) |
| http://localhost:3000/auth/login | Login compradores |

**Usuários de teste:** `maria@teste.com` / `senha123` (e outros no seed)

---

## 🔄 Guia de Migração (v1 → v2)

Se você tinha a versão anterior (`node:sqlite` + models/):

1. **Faça backup** de `database/rifas.db` se tiver dados importantes
2. A v2 usa **Prisma** — o schema mudou significativamente (novas tabelas: `premios`, `faixas_desconto`, `carrinhos`, `comentarios`, `log_admin`)
3. **Não há migração automática** de dados v1 → v2. Opções:
   - **Recomeçar:** delete `database/rifas.db` e rode `npm run db:push && npm run seed`
   - **Manual:** exporte dados da v1 e importe via script customizado
4. Arquivos legados em `models/` permanecem no repo mas **não são mais usados**
5. Configure o `.env` (obrigatório na v2)

---

## ⚙️ Variáveis de Ambiente (`.env`)

```env
DATABASE_URL="file:../database/rifas.db"
PORT=3000
SESSION_SECRET=sua-chave-secreta-longa
WEBHOOK_SECRET=webhook-secreto
APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=          # opcional
GOOGLE_CLIENT_SECRET=      # opcional
```

### ngrok (acesso externo / webhooks)

```powershell
npm start          # terminal 1
ngrok http 3000    # terminal 2
```

- Use **só** a URL `https://xxxx.ngrok-free.app` (evite alternar com `localhost` na mesma sessão)
- Webhook: `https://xxxx.ngrok-free.app/api/pagamentos/webhook`
- `APP_URL` pode ficar em `localhost` — links são detectados automaticamente via ngrok

---

## 🔌 API

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/rifas/:id/reservar` | Reserva 30 min + carrinho |
| DELETE | `/api/rifas/:id/liberar` | Libera números |
| POST | `/api/rifas/:id/aleatorio` | Números da sorte |
| POST | `/api/rifas/:id/comprar` | Confirma compra + PIX manual |
| GET | `/api/reservas/:id/status` | Polling status pagamento |
| POST | `/api/pagamentos/webhook` | Webhook simulado (confirmação automática) |
| GET | `/api/rifas/:id/carrinho` | Consulta carrinho |

---

## 💳 Pagamento PIX

O fluxo usa **PIX manual** com a chave configurada em cada rifa:

1. Comprador confirma a compra → sistema gera QR Code e copia e cola
2. Comprador paga via PIX
3. Organizador confirma no painel **ou** webhook simulado confirma automaticamente

### Webhook simulado (desenvolvimento)

```powershell
npm run webhook:simular -- PIX-CODIGO
```

Configure `WEBHOOK_SECRET` no `.env` para usar o endpoint `POST /:slug/api/pagamentos/webhook`.

---

## 🐳 Docker (produção)

1. Copie e configure o `.env` (principalmente `APP_URL`, `SESSION_SECRET`, `WOOVI_APP_ID`):

```powershell
copy .env.example .env
# Edite .env com domínio HTTPS real
```

2. Suba o container:

```powershell
docker compose up --build -d
```

3. **Primeira subida com dados demo** (opcional — cria `admin/admin123`):

```powershell
$env:RUN_SEED="true"; docker compose up --build -d
```

| Recurso | Detalhe |
|---------|---------|
| Banco | Volume `rifas-data` → `/app/database/rifas.db` |
| Uploads | Volume `rifas-uploads` → logos e imagens das rifas |
| Health | `GET /health` |
| Seed | Desligado por padrão (`RUN_SEED=false`) |

Acesse `http://localhost:3000` (ou a porta definida em `PORT`).

---

## 🧪 Testes

```powershell
npm test
```

Cobertura: helpers, cálculo de descontos (`RifaService.calcularValor`).

---

## 📋 Fluxo Completo de Teste

1. **Cadastro:** `/auth/cadastro` → criar conta
2. **Compra:** selecionar números ou "Número da Sorte" → confirmar → copiar PIX/QR
3. **Webhook:** `npm run webhook:simular -- <codigo_pagamento>`
4. **Admin:** dashboard com gráficos → participantes → sorteio
5. **Indicação:** copiar link em Minha Conta → cadastrar amigo com `?ref=CODIGO`
6. **Encerradas:** `/encerradas` → galeria de ganhadores

---

## 🔒 Segurança

- Senhas com **bcrypt**
- **Helmet.js** (CSP, headers)
- **Rate limiting** (API, auth, compras)
- **CSRF** em formulários (token `_csrf` / header `X-CSRF-Token`)
- **express-validator** em rotas críticas
- Secrets via `.env` (nunca commitar)

---

## 📝 Licença

MIT
