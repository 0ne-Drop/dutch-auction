FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
EXPOSE 4000
# SEED_START_IN이 있으면 시작 전에 데모 데이터를 다시 만든다
CMD ["sh", "-c", "if [ -n \"$SEED_START_IN\" ]; then npm run seed -- --start-in $SEED_START_IN; fi && npm start"]
