FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY server.js .
COPY public ./public
COPY constitution.db .
EXPOSE 3002
CMD ["node", "server.js"]
