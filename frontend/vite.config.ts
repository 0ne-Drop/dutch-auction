/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// 운영: S3(정적 파일) + CloudFront. CloudFront가 /api/* 를 ALB(백엔드)로 보내므로 같은 도메인에서 동작한다.
// 개발: vite 개발 서버가 /api/* 를 로컬 Spring Boot(8080)로 프록시해 같은 구조를 재현한다.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: process.env.API_ORIGIN ?? 'http://localhost:8080', changeOrigin: false },
    },
  },
  test: {
    environment: 'node',
  },
})
