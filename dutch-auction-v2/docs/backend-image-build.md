# 백엔드 이미지 생성 (YAML)

scripts/backend-image-build.yaml은 Docker Compose 빌드 설정이다. YAML 자체를 실행하는 대신 Docker Compose V2로 읽는다. 프로젝트 루트에서 실행하고 Docker 엔진은 Linux 컨테이너 모드로 실행되어 있어야 한다.

```powershell
docker compose -f scripts/backend-image-build.yaml build backend
```

기본 이미지는 dutch-auction-backend:local, 플랫폼은 linux/amd64다. ECR 주소와 태그를 지정하려면 아래 예시를 실제 값으로 바꾼다.

```powershell
$env:BACKEND_IMAGE_NAME = '123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/dutch-auction-backend'
$env:BACKEND_IMAGE_TAG = '0.1.0-build001'
$env:BACKEND_IMAGE_PLATFORM = 'linux/amd64'
docker compose -f scripts/backend-image-build.yaml build backend
```

ARM 노드는 BACKEND_IMAGE_PLATFORM을 linux/arm64로 지정한다. 플랫폼은 실제 실행 노드에 맞춰 선택한다. 캐시 없이 빌드하려면 build --no-cache backend를 사용한다.

빌드 설정 확인:

```powershell
docker compose -f scripts/backend-image-build.yaml config
```

ECR 저장소 준비 및 Docker의 ECR 인증을 마친 후 별도로 업로드:

```powershell
docker compose -f scripts/backend-image-build.yaml push backend
```

build 명령은 로컬 이미지 생성만 수행한다. AWS 로그인, 저장소 생성, 푸시, DB·Redis 실행은 하지 않는다. 호스트 Java·Gradle은 필요 없으며 최초 빌드에는 이미지·의존성 다운로드를 위한 네트워크가 필요하다.

현재 Dockerfile은 bootJar -x test를 사용하므로 애플리케이션 테스트를 실행하지 않는다. 테스트는 프로젝트의 shared/price-cases.csv를 참조하므로 별도 단계에서 검증해야 한다. 이미지 빌드 성공은 애플리케이션 기동 및 DB·Redis 연결 성공을 의미하지 않는다.
