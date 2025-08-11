# Prebuilt image with Chromium + all deps
FROM ghcr.io/puppeteer/puppeteer:22

WORKDIR /app

# Install only prod deps
COPY package*.json ./
RUN npm ci --omit=dev

# App code
COPY . .

# Optional: puppeteer is bundled in this image; prevent extra downloads
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080
CMD ["node", "server.js"]
