FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Node 24+ 官方镜像不再捆绑 yarn（Node 25 起移除 corepack/yarn），显式安装（--force 覆盖自带版本）
RUN npm install -g --force yarn@1.22.22

# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./

RUN yarn --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
# ENV NEXT_TELEMETRY_DISABLED=1

# procps: next build 需要；版本信息由 build args 注入，不依赖 git 或 .git。
RUN apk add --no-cache procps

# Phase 6 镜像 smoke：FXRATE_PROXY 在构建期注入（next.config.mjs rewrites 的 /api/fxrate
# 同源代理目标在 build 时被固化进 standalone 产物）。不传 build-arg 时为空串，
# next.config 的 `env.FXRATE_PROXY || 默认线上地址` 逻辑自动回落，行为与旧镜像一致。
ARG FXRATE_PROXY
ENV FXRATE_PROXY=${FXRATE_PROXY}

# 精确构建标识由 CD 注入；本地/contract 构建使用安全默认值。FXBUILD_TIME 留空时
# next.config.mjs 在构建进程内生成一次 ISO 时间并冻结进 standalone 产物。
ARG FXBUILD_ID=container
ARG FXBUILD_TIME
ENV FXBUILD_ID=${FXBUILD_ID}
ENV FXBUILD_TIME=${FXBUILD_TIME}

RUN yarn run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
