FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN npx prisma generate \
  && chmod +x scripts/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["sh", "scripts/docker-entrypoint.sh"]
