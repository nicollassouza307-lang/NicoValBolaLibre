FROM node:22-alpine
WORKDIR /app
COPY server.js ./server.js
ENV PORT=3030
ENV DATA_FILE=/data/shared-config.json
VOLUME ["/data"]
EXPOSE 3030
CMD ["node", "server.js"]
