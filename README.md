# 인천성산교회 앱 광고 관리

이 저장소는 인천성산교회 앱의 배너 광고를 관리하는 프로젝트입니다.

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
  "link": "https://isungsan.org/christmas",
  "startDate": "20251201",
  "endDate": "20251226"
}
```

### 기간 만료된 배너 확인

현재 날짜가 `endDate`를 지난 배너는 자동으로 앱에서 표시되지 않을 수 있습니다. 정기적으로 만료된 배너를 정리하는 것을 권장합니다.

