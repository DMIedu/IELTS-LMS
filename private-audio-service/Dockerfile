FROM python:3.11-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg gcc libc6-dev \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY processor.py service.py ./
RUN useradd --uid 10001 --no-create-home worker
USER 10001
ENV PYTHONDONTWRITEBYTECODE=1
ENV DMI_AUDIO_WORKER_ENABLED=false
ENTRYPOINT ["python", "processor.py"]
