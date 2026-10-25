# 인천성산교회 앱 광고 관리

이 저장소는 인천성산교회 앱의 배너 광고를 관리하는 프로젝트입니다.

## 웹 관리 화면

GitHub Pages의 `/admin/`에서 배너 추가·수정·삭제, 이미지 업로드, 순서 변경, 노출 기간·배경색·연결 주소 편집 및 미사용 이미지 삭제를 할 수 있습니다. 기존 `assets.json` 형식과 jsDelivr 주소를 유지합니다.

- 관리 화면: `https://ssmind96.github.io/isungsan-ads/admin/`
- GitHub 계정으로 로그인하며 저장소 **쓰기 권한**이 있어야 합니다. 서버는 요청마다 권한을 다시 확인합니다.
- 편집 후 **변경 사항 저장**을 누르면 이미지와 `assets.json`이 하나의 커밋으로 저장됩니다. 다른 관리자의 변경과 충돌하면 덮어쓰지 않습니다.
- 배너 삭제와 이미지 파일 삭제는 별개입니다. 사용 중인 이미지는 삭제할 수 없습니다.
- PNG/JPG/GIF/WebP, 파일당 5MB, 저장 1회당 총 20MB까지 지원합니다. SVG는 지원하지 않습니다.
- 한국 시간으로 노출 상태를 표시합니다. 앱에 실제 반영되는 시간은 앱의 조회 및 CDN 캐시에 따라 달라집니다.

### 최초 설정

이 계정의 Worker 주소는 `https://isungsan-ads-auth.ssmind96.workers.dev`입니다. `~/.env`에 GitHub PAT, Cloudflare API 토큰·Account ID, OAuth Client ID·Secret 및 `CLOUDFLARE_WORKERS_SUBDOMAIN=ssmind96`을 설정했다면 `npm run deploy`로 검증 → Worker 인증 설정 반영 → 관리 도구 소스의 원격 main 반영 → Pages 활성화 및 배포를 실행할 수 있습니다. 이 명령은 기존 `assets.json`, `banners/`, README와 다른 워크플로를 업로드하거나 덮어쓰지 않습니다. GitHub PAT에는 Contents, Workflows, Actions, Pages 및 Administration의 필요한 쓰기 권한이 있어야 합니다. classic PAT는 `repo`, `workflow` scope가 필요합니다. Pages 실행 로그와 성공 여부를 출력하며, 실제 GitHub 로그인은 배포 후 브라우저에서 확인해야 합니다.

Cloudflare API 토큰을 사용하는 경우 `~/.env`에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`를 넣고 저장소에서 `npm run deploy:worker`를 실행할 수 있습니다. Node.js 20 이상이면 별도 패키지 설치 없이 배포하며 OAuth 등록에 필요한 callback URL을 출력합니다. 이어서 같은 파일에 `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`을 추가하고 다시 실행하면 인증 설정까지 등록됩니다. 다른 환경 파일은 `ADS_ENV_FILE`로 지정할 수 있습니다. 이 명령은 Worker만 배포하며 GitHub Pages 배포는 아래 절차를 따릅니다.

GitHub Pages는 정적 호스팅이므로 OAuth 비밀키를 보관하고 토큰을 교환하는 Cloudflare Worker를 별도로 사용합니다. OAuth 로그인은 사용자 본인의 GitHub 권한으로 실행됩니다. 로컬 `.env`의 `GITHUB_PAT`는 사이트나 Worker에 배포하지 않습니다.

1. [GitHub OAuth App 생성](https://github.com/settings/applications/new)에서 다음을 입력합니다.
   - Application name: `인천성산교회 배너 관리`
   - Homepage URL: `https://ssmind96.github.io/isungsan-ads/admin/`
   - Authorization callback URL: `https://isungsan-ads-auth.<계정의-workers-subdomain>.workers.dev/auth/callback`
   - 생성한 Client ID를 `worker/wrangler.toml`의 `GITHUB_CLIENT_ID`에 입력합니다. Client Secret은 아래 명령으로 등록합니다.
2. 저장소 디렉터리에서 Cloudflare 로그인 및 Worker 배포를 진행합니다. Node.js 20 이상과 Cloudflare 계정이 필요합니다.

   ```sh
   cd worker
   npx wrangler login
   npx wrangler secret put GITHUB_CLIENT_SECRET
   npx wrangler secret put SESSION_SECRET
   npx wrangler deploy
   ```

   `SESSION_SECRET`에는 `openssl rand -hex 32`로 생성한 임의 문자열을 입력하세요. OAuth App의 callback URL을 실제 배포된 Worker 주소와 일치시킵니다. `ADMIN_URL`도 Pages 주소와 일치해야 합니다. 다른 GitHub Pages 사이트에서 실행한 스크립트도 같은 origin을 공유할 수 있으므로 관리 화면을 독립 도메인으로 분리하면 더 강한 격리가 가능합니다.

3. GitHub 저장소 **Settings → Secrets and variables → Actions → Variables**에 `ADS_AUTH_SERVER`를 추가하고 Worker의 HTTPS 주소를 입력합니다. 예: `https://isungsan-ads-auth.example.workers.dev`. 비밀값이 아닌 서버 주소입니다.
4. **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 선택합니다.
5. 변경 사항을 `main`에 반영한 후 **Actions → Deploy banner admin to Pages**를 실행합니다. `ADS_AUTH_SERVER`를 나중에 바꿔도 이 워크플로를 다시 실행해야 합니다.
6. 관리 화면에서 GitHub 로그인을 완료하고 배너를 저장합니다. GitHub의 브랜치 보호 규칙이 직접 커밋을 금지하면 관리자 화면의 저장도 거절됩니다. 기존 jsDelivr 캐시 갱신 워크플로는 사용자 OAuth 토큰으로 생성한 커밋에도 실행됩니다.

OAuth App은 공개 저장소 수정을 위한 `public_repo` 권한을 요청합니다. 저장소를 비공개로 바꾸면 CDN 운영 방식과 OAuth 권한을 함께 재검토해야 합니다. 로그인 상태는 암호화된 8시간 세션으로 현재 브라우저 탭에 보관하며 GitHub 토큰 만료 시 다시 로그인합니다. 로그아웃은 이 탭의 세션을 삭제합니다. GitHub 자체의 앱 접근 권한 해제는 [Authorized OAuth Apps](https://github.com/settings/applications)에서 할 수 있습니다.

### 로컬 확인

```sh
npm run check
npm test
```

프런트엔드는 빌드나 npm 설치 없이 실행할 수 있습니다. 저장소 루트를 정적 서버로 제공하고 `/admin/`으로 접속하세요. 로컬 인증 검증 시 `admin/config.js`에 개발 Worker 주소를 지정하고 Worker의 `ADMIN_URL` 및 OAuth callback도 개발 환경에 맞춰 설정해야 합니다. 로컬 Worker 비밀키는 Git에서 제외된 `worker/.dev.vars`에 넣습니다. HTTP 환경의 로그인 쿠키 동작은 HTTPS 배포 환경과 다를 수 있으므로 실제 로그인은 배포 후 확인하세요.

구현 파일: `admin/`(관리 UI), `shared/model.js`(공통 검증), `worker/`(인증·저장 API), `.github/workflows/pages.yml`(Pages 배포). Pages 배포에는 `admin`, `shared`, `assets.json`, `banners`만 포함하며 서버 코드와 비밀키는 포함하지 않습니다.

## 📁 프로젝트 구조

```
isungsan-ads/
├── assets.json      # 배너 광고 설정 파일
└── banners/         # 배너 이미지 파일들
```

## 📝 assets.json 설정 가이드

`assets.json` 파일은 앱에 표시될 배너 광고 정보를 관리합니다.

### JSON 구조

```json
{
  "banners": [
    {
      "order": 1,
      "title": "배너 제목",
      "image": "https://cdn.jsdelivr.net/gh/ssmind96/isungsan-ads@main/banners/이미지파일명.png",
      "bgColor": "#EEEEEE",
      "link": "https://연결할주소.com",
      "startDate": "20250101",
      "endDate": "20251231"
    }
  ]
}
```

### 필드 설명

| 필드 | 타입 | 설명 | 예시 |
|------|------|------|------|
| `order` | Number | 배너 표시 순서 (작은 숫자가 먼저 표시됨) | `1`, `2`, `3` |
| `title` | String | 배너의 제목 또는 설명 (베너에 링크가 있을 시 링크의 제목으로 표시 됨) | `"영혼사랑축제"` |
| `image` | String | 배너 이미지의 CDN URL (banners 폴더에 파일을 올리고 해당 이름으로 설정) | `"https://cdn.jsdelivr.net/gh/ssmind96/isungsan-ads@main/banners/2025SoulLove.png"` |
| `bgColor` | String | 배너 배경색 (rgb 형식) | `"#EEEEEE"` |
| `link` | String | 배너 클릭 시 이동할 URL (비어있으면 클릭 불가) | `"https://example.com"` 또는 `""` |
| `startDate` | String | 배너 노출 시작일 (YYYYMMDD 형식) | `"20250101"` |
| `endDate` | String | 배너 노출 종료일 (YYYYMMDD 형식) | `"20251231"` |

### 배너 추가 방법

1. **이미지 파일 업로드**
   - `banners/` 폴더에 배너 이미지 파일을 추가합니다.
   - 파일명은 영문으로 작성하는 것을 권장합니다. (예: `2025Event.png`)

2. **assets.json 수정**
   - `banners` 배열에 새로운 배너 객체를 추가합니다.
   - 각 필드를 올바르게 입력합니다.


### 배너 수정 방법

- **순서 변경**: `order` 값을 수정합니다.
- **기간 변경**: `startDate` 또는 `endDate` 값을 수정합니다.
- **링크 변경**: `link` 값을 수정합니다.
- **이미지 변경**: `banners/` 폴더의 이미지를 교체하거나, `image` URL을 수정합니다.

### 배너 삭제 방법

- `banners` 배열에서 해당 배너 객체를 삭제합니다.
- 필요 시 `banners/` 폴더에서 이미지 파일도 삭제합니다.

## 🎯 주의사항

- **날짜 형식**: 반드시 `YYYYMMDD` 형식을 사용해야 합니다. (예: `20250101`)
- **JSON 문법**: 쉼표, 따옴표 등 JSON 문법을 정확히 지켜야 합니다.
- **이미지 경로**: CDN URL은 정확한 파일명과 경로를 포함해야 합니다.
- **배너 순서**: `order` 값이 중복되어도 되지만, 고유한 값을 사용하는 것을 권장합니다.

## 📌 예시

### 새 배너 추가 예시

```json
{
  "order": 7,
  "title": "2025 크리스마스 행사",
  "image": "https://cdn.jsdelivr.net/gh/ssmind96/isungsan-ads@main/banners/2025Christmas.png",
  "bgColor": "#EEEEEE",
  "link": "https://isungsan.org/christmas",
  "startDate": "20251201",
  "endDate": "20251226"
}
```

### 기간 만료된 배너 확인

현재 날짜가 `endDate`를 지난 배너는 자동으로 앱에서 표시되지 않을 수 있습니다. 정기적으로 만료된 배너를 정리하는 것을 권장합니다.


## 성도의 기업

앱 홈의 **광고**에는 알립니다와 주보를 목록으로 표시하며, **성도의 기업**은 광고와 같은 단계의 별도 메뉴입니다. 성도의 기업은 게시판 웹뷰 대신 이 저장소의 `businesses.json`을 불러와 목록과 상세 화면을 구성합니다.

관리 페이지 상단의 **배너 / 성도의 기업** 메뉴에서 관리 대상을 선택하고, 본문의 **리스트 / 이미지 보관함**으로 전환합니다. 각 보관함에는 해당 대상의 이미지만 표시하며 배너는 `banners/`, 성도의 기업 광고는 `businesses/`에 저장합니다. 상단 로고와 파비콘은 앱의 `assets/ios-icon.png` 원본을 `admin/app-icon.png`로 복사해 사용합니다. 성도의 기업에서는 기업 추가·수정·삭제, 표시 순서 변경, 여러 이미지 업로드 및 개별 이미지 URL 추가·순서 변경·제거, 본문, 전화번호, 웹사이트, 예약 페이지 주소, 주소를 수정할 수 있습니다. 전화번호는 ＋ 버튼으로 행을 추가하고 휴지통 버튼으로 삭제합니다. 웹사이트는 한 줄에 하나씩 입력합니다. 제목을 제외한 소개·이미지·연락처·웹사이트·주소는 비워 둘 수 있으며, 앱에서는 빈 항목을 숨깁니다. ‘목록에 적용’ 후 ‘변경 사항 저장’을 눌러야 반영됩니다.

```json
{
  "businesses": [
    {
      "id": "example",
      "order": 1,
      "title": "기업명",
      "category": "음식",
      "memberName": "",
      "memberRole": "",
      "description": "본문 소개",
      "images": ["https://cdn.jsdelivr.net/gh/ssmind96/isungsan-ads@main/businesses/example.jpg"],
      "phones": ["010-1234-5678"],
      "websites": ["https://example.com"],
      "address": "인천광역시 ...",
      "reservationUrl": "https://example.com/booking",
      "sourceUrl": "https://www.isungsan.net/board/view.do?iboardmanagerseq=128&iboardseq=..."
    }
  ]
}
```

- `id`: 변경하지 않는 고유 ID, `order`: 표시 순서. 새 기업은 관리 화면에서 UUID를 자동으로 만듭니다.
- `images`: 표시 순서대로 나열한 이미지 URL. 저장소 파일은 `businesses/`에 보관합니다. `phones`, `websites`, `images`는 정보가 없으면 빈 배열, `description`, `address`는 빈 문자열입니다.
- 상세 화면 상단에는 기업명을 표시하고, 본문 → 이미지 → 전화번호별 복사 행 → 주소 복사 행 순서로 배치합니다. 하단에는 전화·지도·홈페이지·예약 버튼을 고정하고 정보가 없는 버튼은 비활성화합니다. 전화번호가 하나면 바로 `tel:`로 연결하고, 여러 개면 번호 목록 다이얼로그에서 선택합니다. 홈페이지와 예약 페이지는 앱 내 웹뷰로 엽니다.
- `reservationUrl`은 선택 사항이며 없으면 빈 문자열입니다. 원본에서 예약용으로 명시된 다인양과 선물세트 QR(904)만 최초 예약 URL을 지정했고, 나머지는 비웠습니다. 원본 추적을 위한 `sourceUrl`은 JSON에 유지하지만 관리 페이지 입력 항목은 제거했습니다.
- 지도는 `maps/business.html`에서 기존 네이버 지도 공개 JS 키와 Geocoder를 사용해 주소를 좌표로 변환하고, 기업명·주소와 마커를 표시합니다. 하단의 네이버 지도 앱 버튼은 같은 좌표와 기업명을 `nmap://place`로 전달합니다. 좌표를 찾지 못하면 재시도 및 주소 검색을 제공하고 임의의 위치에 마커를 표시하지 않습니다. 네이버 지도 앱이 없으면 네이버 웹 지도로 연결합니다. API 연동 방식은 [네이버 지도 Geocoder 예제](https://navermaps.github.io/maps.js.ncp/docs/tutorial-3-geocoder-geocoding.example.html)와 [URL Scheme 문서](https://guide.ncloud-docs.com/docs/maps-url-scheme)를 따릅니다.
- 앱은 GitHub raw → jsDelivr → 마지막 정상 캐시 순서로 불러옵니다. 정상적인 빈 목록도 캐시에 반영합니다. 요청별 제한 시간은 12초이며, 캐시를 사용할 때 안내하고 새로고침을 제공합니다.
- 관리 API는 두 JSON과 이미지 변경을 하나의 Git 커밋으로 저장합니다. 기존 `assets.json`의 구조는 유지하고 기업 목록은 `businesses.json`으로 분리합니다. 이미지 보관함은 두 목록에서 사용하는 이미지를 모두 보호합니다.

### 최초 가져오기와 원본 확인

2026-10-26에 [성도의기업 게시판](https://www.isungsan.net/board/list.do?iboardmanagerseq=128)의 3페이지에서 게시물 22개와 본문 이미지 65장(약 26MB)을 가져왔습니다. 동일 업체의 과거 광고와 행사 게시물도 원본처럼 각각 보존했습니다. 게시물마다 `sourceUrl`을 기록했습니다.

본문의 텍스트·연락처·링크·주소를 추출하고, 이미지에서 확인한 연락처와 주소를 보완했습니다. 이미지로만 소개된 플룻 레슨·성승바이오의 소개와 전화번호도 포함합니다. QR 코드 4개(다인양과 선물세트·차파 홈케어·아셀홈케어·짱설치)는 실제 인코딩된 링크를 읽어 웹사이트로 추가했습니다. 에코플렌트 인스타그램 링크는 이미지에 기재된 계정명 `eco_plant_gsgarden`으로 구성했습니다. 사진 속 주변 업소의 전화번호, 팩스, 제조사 링크는 해당 기업의 연락처로 추가하지 않았습니다.

삼성툴링(게시물 553)의 본문 주소는 **D동 238호**, 이미지에는 **D-248**로 서로 다릅니다. JSON 주소는 본문을 유지했습니다. 거미 사진관·휴 에스테틱처럼 원본에 정확한 도로명 주소가 없는 경우 원본의 위치 설명을 보존했으므로 지도 검색 결과가 정확하지 않을 수 있습니다. 과거 가격과 행사 기간은 원본 자료이며 최신 정보로 갱신한 것은 아닙니다.

### 반영 및 검증

운영 반영에는 이 저장소의 관리 화면·공유 모델·Worker 코드와 `businesses.json`, `businesses/`가 필요합니다. 기존 배포 명령 `npm run deploy`는 검사 후 Worker와 Pages를 배포하고, 원격에 없는 기업 JSON 및 이미지를 최초 등록합니다. 이미 원격에 있는 기업 자료는 관리자가 수정했을 수 있으므로 덮어쓰지 않습니다. 이후 기업 자료 변경은 관리 페이지에서 저장하거나 Git으로 별도 반영하세요. Pages 워크플로에도 기업 JSON과 이미지가 포함됩니다.

앱 변경은 `~/git/isungsan-app`에 있습니다. 앱 코드 반영은 새 앱 빌드/배포가 필요하며, 이후 기업 콘텐츠는 JSON으로 갱신됩니다. 로컬 구현 작업만으로 운영 사이트와 설치된 앱이 바뀌지는 않습니다.

검사: 이 저장소에서 `npm run check && npm test`, 앱 저장소에서 `npm run check`. 앱의 `check:businesses`는 미러·오프라인 캐시·빈 목록 갱신·타임아웃·데이터 검증과 전화/지도 링크를 확인합니다.


### 업종 분류

`category`는 `음식`, `생활`, `교육`, `건강`, `쇼핑` 중 하나입니다. 앱 상단은 말씀 화면과 같은 둥근 버튼 탭으로 **전체 · 음식 · 생활 · 교육 · 건강 · 쇼핑**을 표시하며 기본 선택은 전체입니다. 검색은 선택한 업종 안에서 적용합니다.

초기 22개 게시물은 음식 5개, 생활 6개, 교육 2개, 건강 2개, 쇼핑 7개로 분류했습니다. 음식에는 식당·카페·제과, 생활에는 수리·청소·세탁·사진관, 교육에는 악기 레슨, 건강에는 에스테틱·건강제품, 쇼핑에는 꽃·향수·선물·의류·식품유통·휴대폰·공구를 포함합니다. 관리 페이지에서 업종을 수정하고 필터링할 수 있습니다. 새 기업의 기본 업종은 쇼핑입니다.

이전 분류나 업종이 없는 캐시는 기존 게시물 ID에 맞춰 새 분류로 변환합니다. 알려지지 않은 업체의 이전 식당·카페는 음식, 수리는 생활, 기타 또는 업종 누락은 쇼핑으로 변환합니다. 새 분류가 지정된 업체는 그대로 유지합니다.


### 배너 현황 및 성도 정보

배너 리스트 상단에는 전체·노출 중·노출 예정·노출 종료 네 항목을 표시합니다. 모바일에서는 두 열로 배치하며 숫자는 검색 결과가 아닌 전체 등록 배너를 기준으로 계산합니다.

기업 편집 폼의 기업명 아래에서 성도 이름(`memberName`, 최대 100자)과 성도 직분(`memberRole`, 최대 50자)을 선택 입력할 수 있습니다. 비워 둘 수 있으며 기존 필드가 없는 자료도 편집할 수 있습니다. 기존 22개 자료에는 빈 문자열로 추가했습니다. 이 두 항목은 JSON에 저장만 하며 현재 앱 목록·상세·검색·버튼에는 사용하지 않습니다.


### 개별 전화번호와 이미지 편집

`phones`는 `[]` 또는 `["010-1234-5678", "032-123-4567"]` 형태의 배열입니다. 관리 페이지의 전화번호 ＋ 버튼과 휴지통 버튼으로 최대 30개까지 입력·삭제할 수 있고, 빈 입력칸은 저장 시 제외합니다.

기업 이미지 파일을 선택하면 개별 이미지 주소 행에 저장 예정 URL이 자동으로 들어가고 미리보기가 표시됩니다. 주소 행마다 위로·아래로·＋·휴지통 버튼을 제공하며 URL은 한 입력칸에 하나씩 관리합니다. 표시 순서가 JSON의 `images` 배열과 앱 이미지 순서가 됩니다. ‘목록에 적용’ 후 ‘변경 사항 저장’을 눌러야 실제 파일이 저장됩니다. 취소한 이미지와 목록에서 제거한 미적용 파일은 업로드하지 않습니다.
