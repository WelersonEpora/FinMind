FROM node:22-alpine

WORKDIR /app

COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node . .

# Cria o diretório do volume de fotos (docker/compose.prod.yml,
# photo_storage:/app/storage/photos) já com dono "node" ANTES do mount -
# sem isso, o Docker cria o ponto de montagem como root na primeira vez
# (o diretório não existe na imagem, é git-ignorado), e o processo
# (USER node, não-root) não consegue escrever ali.
RUN mkdir -p storage/photos && chown -R node:node storage

# Identificação de versão (SHA curto + data do commit) - preenchido pelo CI
# via --build-arg, exposto em GET /api/v1/status. "local" como default
# cobre build manual/dev, onde ninguém passa o build-arg.
ARG GIT_COMMIT=local
ARG GIT_COMMIT_DATE=unknown
ENV GIT_COMMIT=$GIT_COMMIT
ENV GIT_COMMIT_DATE=$GIT_COMMIT_DATE

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
