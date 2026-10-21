# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Baked into the static build — Vite only picks up VITE_-prefixed vars that
# are present in the environment at build time, not at container-run time.
ARG VITE_API_BASE_URL=http://localhost:5000/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# Serve stage — plain static file server, no nginx config to maintain for
# a project this size. The backend's own CORS config already restricts who
# can call the API; this container just serves the built static files.
FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
