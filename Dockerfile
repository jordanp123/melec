FROM nginxinc/nginx-unprivileged:alpine-slim

COPY --chown=0:0 --chmod=444 nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=0:0 --chmod=444 index.html /usr/share/nginx/html/index.html
COPY --chown=0:0 --chmod=444 sw.js /usr/share/nginx/html/sw.js
COPY --chown=0:0 --chmod=444 favicon.ico /usr/share/nginx/html/favicon.ico
COPY --chown=0:0 --chmod=444 404.html /usr/share/nginx/html/404.html
