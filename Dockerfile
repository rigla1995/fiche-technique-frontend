FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
# Force devDependencies install even if NODE_ENV=production is set in CI/Coolify
RUN npm ci --include=dev
COPY . .
ARG VITE_API_URL=https://api.labflow-tn.com
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
