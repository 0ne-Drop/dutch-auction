#!/usr/bin/env bash
# MUSINSA STANDARD 목 데이터를 EKS 의 RDS 에 넣는다 (클러스터 안에서 1회용 Job 으로 psql 실행)
#
# 사용 (dutch-auction 저장소 루트에서):
#   IMAGE_BASE=https://<이미지 버킷 도메인>/images ./scripts/seed/musinsa/run_seed.sh
#   IMAGE_BASE=... STARTS_AT='2026-11-20 20:00:00+09' ./scripts/seed/musinsa/run_seed.sh   # 시작 시각 지정
#
# 필요:
#   - kubectl 이 bab-cluster 에 연결돼 있을 것
#   - dutch-auction 네임스페이스에 api-secret(DATABASE_URL, DATABASE_USERNAME, DATABASE_PASSWORD)이 있을 것
#     (k8s_charts 의 cluster/setup.sh 9단계가 만듦)
#   - RDS 보안 그룹이 클러스터 보안 그룹의 5432 를 허용할 것 (setup.sh 10단계)
#
# RDS 는 프라이빗 서브넷에 있어서 노트북에서 바로 접속할 수 없으므로, 클러스터 안에서 실행한다.
set -euo pipefail

NS=dutch-auction
JOB=musinsa-seed
IMAGE="postgres:18"     # psql 클라이언트
: "${IMAGE_BASE:?IMAGE_BASE 가 필요합니다. 예: IMAGE_BASE=https://<이미지 버킷 도메인>/images}"
STARTS_AT="${STARTS_AT:-}"

HERE="$(cd "$(dirname "$0")" && pwd)"

kubectl -n "$NS" get secret api-secret >/dev/null

# SQL 과 실행 스크립트를 ConfigMap 으로 넘김
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/run.sh" <<'EOS'
#!/bin/bash
set -euo pipefail
# api-secret 의 JDBC 주소(jdbc:postgresql://host:5432/db?sslmode=require)를 psql 주소로 바꿈
export PGUSER="$DATABASE_USERNAME" PGPASSWORD="$DATABASE_PASSWORD"
args=(-v "image_base=$IMAGE_BASE")
if [ -n "${STARTS_AT:-}" ]; then args+=(-v "starts_at=$STARTS_AT"); fi
psql "${DATABASE_URL#jdbc:}" "${args[@]}" -f /seed/seed.sql
EOS
kubectl -n "$NS" create configmap "$JOB" \
  --from-file=seed.sql="$HERE/seed_musinsa_100.sql" \
  --from-file=run.sh="$TMP/run.sh" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n "$NS" delete job "$JOB" --ignore-not-found --wait=true

kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: $JOB
  namespace: $NS
spec:
  backoffLimit: 0                 # 실패해도 다시 시도하지 않음 (SQL 이 한 트랜잭션이라 실패하면 아무것도 안 들어감)
  ttlSecondsAfterFinished: 3600   # 끝나고 1시간 뒤 자동 삭제
  template:
    spec:
      restartPolicy: Never
      automountServiceAccountToken: false
      containers:
        - name: psql
          image: $IMAGE
          command: ["bash", "/seed/run.sh"]
          envFrom:
            - secretRef:
                name: api-secret
          env:
            - name: IMAGE_BASE
              value: "$IMAGE_BASE"
            - name: STARTS_AT
              value: "$STARTS_AT"
          resources:
            requests: { cpu: 50m, memory: 64Mi }
            limits: { memory: 128Mi }
          volumeMounts:
            - name: seed
              mountPath: /seed
      volumes:
        - name: seed
          configMap:
            name: $JOB
EOF

echo "Job 실행 중... (최대 5분)"
for _ in $(seq 1 60); do
  ok="$(kubectl -n "$NS" get job "$JOB" -o jsonpath='{.status.succeeded}' 2>/dev/null || true)"
  ng="$(kubectl -n "$NS" get job "$JOB" -o jsonpath='{.status.failed}' 2>/dev/null || true)"
  [ "$ok" = "1" ] || [ "$ng" = "1" ] && break
  sleep 5
done
kubectl -n "$NS" logs "job/$JOB" || true
kubectl -n "$NS" delete configmap "$JOB" --ignore-not-found >/dev/null
[ "${ok:-}" = "1" ] && echo "완료" || { echo "실패: 위 로그 확인"; exit 1; }
