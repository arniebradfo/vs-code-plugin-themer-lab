# Compare instructions, stage names, variables, flags, and JSON arguments.
FROM node:22-alpine AS base

ARG THEME_NAME="Themer Lab"
LABEL org.opencontainers.image.title="${THEME_NAME}" \
      org.opencontainers.image.description="Syntax highlighting sample"

ENV NODE_ENV=production \
    THEME_ACCENT="#297aa0"

WORKDIR /app
COPY --chown=node:node palette.js ./palette.js

FROM base AS preview
USER node

CMD ["node", "palette.js"]
