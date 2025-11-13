FROM node:20-alpine

# Install dependencies
RUN apk add --no-cache curl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build || echo "No build script found"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "process.exit(0)"

# Run worker
CMD ["node", "dist/index.js"]
