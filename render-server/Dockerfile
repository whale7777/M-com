# 민혁닷컴 PDF 변환 서버 (Render / Fly.io / Railway / 아무 VPS 에서나 동작)
FROM mcr.microsoft.com/playwright/python:v1.49.0-jammy

# 나눔고딕 (문제지 기본 글꼴)
RUN apt-get update && apt-get install -y --no-install-recommends fonts-nanum fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* && fc-cache -f

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

ENV PORT=8080 CACHE_DIR=/tmp/mhq-cache
EXPOSE 8080
# 브라우저를 한 개만 쓰므로 worker 는 1개, 요청은 스레드로 받아요.
CMD gunicorn -w 1 --threads 8 --timeout 180 -b 0.0.0.0:${PORT} server:app
