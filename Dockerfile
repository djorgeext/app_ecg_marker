# Use the official TensorFlow image as the base
FROM tensorflow/tensorflow:latest

LABEL org.opencontainers.image.title="app_ecg_marker" \
    org.opencontainers.image.description="ECG marker application built on TensorFlow" \
    maintainer="david"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    APP_HOME=/app

# Create a non-root user and app directory
RUN useradd --create-home --shell /bin/bash appuser && \
    mkdir -p ${APP_HOME} && chown -R appuser:appuser ${APP_HOME}

WORKDIR ${APP_HOME}

# # Install Python dependencies if a requirements.txt is provided
# COPY requirements.txt ${APP_HOME}/
# RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi

# # Copy application sources
# COPY . ${APP_HOME}
# RUN chown -R appuser:appuser ${APP_HOME}

# USER appuser

# # Expose a port (adjust as needed)
# EXPOSE 8080

# # Default command (adjust to your app entrypoint)
# CMD ["python", "app.py"]