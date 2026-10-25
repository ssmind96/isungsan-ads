const parameters = new URLSearchParams(location.search);
const name = parameters.get('name')?.trim() || '기업 위치';
const address = parameters.get('address')?.trim() || '';
const statusElement = document.getElementById('status');
let complete = false;
let timer;

function send(message) { window.ReactNativeWebView?.postMessage(JSON.stringify(message)); }
function fail() {
  if (complete) return;
  complete = true;
  clearTimeout(timer);
  statusElement.textContent = '이 주소의 위치를 찾을 수 없습니다. 네이버 지도 앱에서 검색해 주세요.';
  send({ type: 'BUSINESS_MAP_ERROR' });
}
function showMap(latitude, longitude) {
  if (complete) return;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 31.43 || latitude > 44.35 || longitude < 122.37 || longitude > 132) { fail(); return; }
  const center = new naver.maps.LatLng(latitude, longitude);
  const map = new naver.maps.Map('map', { center, zoom: 17, zoomControl: true, zoomControlOptions: { position: naver.maps.Position.TOP_RIGHT } });
  const marker = new naver.maps.Marker({ position: center, map, title: name });
  const content = document.createElement('div'); content.className = 'business-marker';
  const title = document.createElement('strong'); title.textContent = name;
  const detail = document.createElement('small'); detail.textContent = address;
  content.append(title, detail);
  const info = new naver.maps.InfoWindow({ content });
  info.open(map, marker);
  naver.maps.Event.addListener(marker, 'click', () => { if (info.getMap()) info.close(); else info.open(map, marker); });
  complete = true; clearTimeout(timer); statusElement.hidden = true;
  send({ type: 'BUSINESS_LOCATION', latitude, longitude });
}

window.navermap_authFailure = fail;
window.initBusinessMap = () => {
  try {
    const streetAddress = address.match(/^(.+?(?:\d+번길|로|길)\s*\d+(?:-\d+)?)(?=\s|,|$)/u)?.[1];
    const queries = [...new Set([address, streetAddress].filter(Boolean))];
    const search = index => {
      if (complete) return;
      if (!queries[index]) { fail(); return; }
      naver.maps.Service.geocode({ query: queries[index] }, (status, response) => {
        const result = response?.v2?.addresses?.[0];
        if (status !== naver.maps.Service.Status.OK || !result) { search(index + 1); return; }
        try { showMap(Number(result.y), Number(result.x)); } catch { fail(); }
      });
    };
    search(0);
  } catch { fail(); }
};

if (!address) fail();
else {
  timer = setTimeout(fail, 20000);
  const script = document.createElement('script');
  script.src = 'https://openapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=44uccw1j30&submodules=geocoder&callback=initBusinessMap';
  script.onerror = fail;
  document.head.append(script);
}
