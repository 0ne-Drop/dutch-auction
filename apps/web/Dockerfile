FROM node:22-alpine
WORKDIR /app
# rewrites(/api → API 서버)는 빌드 시점에 확정되므로 빌드 인자로 받는다
ARG API_ORIGIN=http://localhost:4000
ENV API_ORIGIN=$API_ORIGIN
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx next build
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
