# Use the official TensorFlow image as the base
FROM tensorflow/tensorflow:latest

LABEL org.opencontainers.image.title="app_ecg_marker" \
    org.opencontainers.image.description="ECG marker application built on TensorFlow" \
    maintainer="david"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    APP_HOME=/app \
    DEBIAN_FRONTEND=noninteractive

# Create a non-root user and app directory
RUN useradd --create-home --shell /bin/bash appuser && \
    mkdir -p ${APP_HOME} && chown -R appuser:appuser ${APP_HOME}

WORKDIR ${APP_HOME}

# Update packages and install nginx
RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Expose nginx default port
EXPOSE 80

# Copy static site to nginx web root
COPY src/ /var/www/html/

# Configure nginx to serve index.html from /var/www/html
RUN rm -f /etc/nginx/sites-enabled/default \
    && mkdir -p /etc/nginx/conf.d \
    && printf '%s\n' \
       'server {' \
       '  listen 80 default_server;' \
       '  listen [::]:80 default_server;' \
       '  autoindex on;' \
       '  server_name _;' \
       '  root /var/www/html;' \
       '  index index.html;' \
    '  # Proxy API calls to the backend service in the same Docker network' \
    '  location /api/ {' \
    '    proxy_pass http://backend:8000;' \
    '    proxy_http_version 1.1;' \
    '    proxy_set_header Upgrade $http_upgrade;' \
    '    proxy_set_header Connection upgrade;' \
    '    proxy_set_header Host $host;' \
    '    proxy_cache_bypass $http_upgrade;' \
    '  }' \
       '  location / {' \
       '    try_files $uri $uri/ =404;' \
       '  }' \
       '  location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico)$ {' \
       '    expires 7d;' \
       '    add_header Cache-Control "public, max-age=604800";' \
       '  }' \
       '}' \
       > /etc/nginx/conf.d/app.conf

# Start nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]

# # Install Python dependencies if a requirements.txt is provided
# COPY requirements.txt ${APP_HOME}/
# RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi

# # Copy application sources (not needed for static nginx site)
# # COPY . ${APP_HOME}
# # RUN chown -R appuser:appuser ${APP_HOME}

# # (Optional) Install backend requirements and run FastAPI
# # COPY backend/requirements.txt ${APP_HOME}/backend/requirements.txt
# # RUN pip install --no-cache-dir -r ${APP_HOME}/backend/requirements.txt
# # EXPOSE 8000
# # CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]

# USER appuser

# # Expose a port (adjust as needed)
# EXPOSE 8080

# # Default command is nginx (defined above)