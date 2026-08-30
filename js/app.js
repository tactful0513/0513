/* =========================================================
 *  K-뷰티 퍼스널컬러 · 셀카 기반 한국 메이크업 추천
 *  - 모든 분석은 브라우저 안에서만 진행 (사진 미전송)
 *  - 피부 픽셀 샘플링 → Lab 색공간 → 언더톤/밝기 → 4계절 퍼스널컬러
 * ========================================================= */

// 샘플링 영역(이미지 대비 비율): 볼·이마가 들어오는 얼굴 중앙 위쪽
const SAMPLE = { x: 0.30, y: 0.25, w: 0.40, h: 0.40 };

const $ = (id) => document.getElementById(id);

const els = {
  fileInput: $("fileInput"),
  cameraBtn: $("cameraBtn"),
  cameraArea: $("cameraArea"),
  video: $("video"),
  captureBtn: $("captureBtn"),
  cancelCamBtn: $("cancelCamBtn"),
  camError: $("camError"),
  stepUpload: $("step-upload"),
  stepPreview: $("step-preview"),
  stepResult: $("step-result"),
  previewImg: $("previewImg"),
  sampleBox: $("sampleBox"),
  analyzeBtn: $("analyzeBtn"),
  retakeBtn: $("retakeBtn"),
  restartBtn: $("restartBtn"),
  loading: $("loading"),
  work: $("work"),
};

let stream = null;
let currentImageURL = null;

/* ---------------- 사진 입력 ---------------- */

els.fileInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showCamError("이미지 파일만 올릴 수 있어요.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => loadPreview(reader.result);
  reader.readAsDataURL(file);
  els.fileInput.value = ""; // 같은 파일 재선택 가능하게
});

els.cameraBtn.addEventListener("click", startCamera);
els.cancelCamBtn.addEventListener("click", stopCamera);
els.captureBtn.addEventListener("click", capturePhoto);

async function startCamera() {
  hideCamError();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showCamError("이 브라우저에서는 카메라를 쓸 수 없어요. '사진 올리기'를 이용해 주세요.");
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } },
      audio: false,
    });
    els.video.srcObject = stream;
    els.cameraArea.hidden = false;
  } catch (err) {
    // https(보안 컨텍스트)가 아니거나 권한 거부 시
    showCamError(
      "카메라를 열 수 없어요. 카메라 권한을 허용했는지 확인하거나, '사진 올리기'로 셀카를 올려 주세요. " +
      "(카메라 촬영은 https 또는 localhost 환경에서만 동작해요.)"
    );
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  els.cameraArea.hidden = true;
  els.video.srcObject = null;
}

function capturePhoto() {
  const v = els.video;
  if (!v.videoWidth) return;
  const c = els.work;
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  const ctx = c.getContext("2d");
  // 셀카 좌우 반전(거울) 보정: 그대로 저장 (분석에는 영향 없음)
  ctx.drawImage(v, 0, 0, c.width, c.height);
  const dataURL = c.toDataURL("image/jpeg", 0.92);
  stopCamera();
  loadPreview(dataURL);
}

function showCamError(msg) { els.camError.textContent = msg; els.camError.hidden = false; }
function hideCamError() { els.camError.hidden = true; }

/* ---------------- 미리보기 ---------------- */

function loadPreview(url) {
  currentImageURL = url;
  els.previewImg.onload = positionSampleBox;
  els.previewImg.src = url;
  els.stepPreview.hidden = false;
  els.stepResult.hidden = true;
  els.stepPreview.scrollIntoView({ behavior: "smooth", block: "start" });
}

function positionSampleBox() {
  const box = els.sampleBox;
  box.style.left = SAMPLE.x * 100 + "%";
  box.style.top = SAMPLE.y * 100 + "%";
  box.style.width = SAMPLE.w * 100 + "%";
  box.style.height = SAMPLE.h * 100 + "%";
  box.hidden = false;
}

els.retakeBtn.addEventListener("click", () => {
  els.stepPreview.hidden = true;
  els.stepUpload.scrollIntoView({ behavior: "smooth", block: "start" });
});

els.restartBtn.addEventListener("click", () => {
  els.stepResult.hidden = true;
  els.stepPreview.hidden = true;
  els.stepUpload.scrollIntoView({ behavior: "smooth", block: "start" });
});

/* ---------------- 분석 ---------------- */

els.analyzeBtn.addEventListener("click", () => {
  els.loading.hidden = false;
  // 렌더 프레임 확보 후 분석 (로딩 표시가 보이도록)
  setTimeout(() => {
    try {
      const result = analyzeImage(els.previewImg);
      renderResult(result);
    } catch (err) {
      console.error(err);
      alert("분석 중 문제가 생겼어요. 다른 사진으로 다시 시도해 주세요.");
    } finally {
      els.loading.hidden = true;
    }
  }, 60);
});

function analyzeImage(img) {
  // 관리 가능한 크기로 캔버스에 그림
  const maxSide = 500;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const c = els.work;
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  // 샘플 영역
  const sx = Math.round(SAMPLE.x * w);
  const sy = Math.round(SAMPLE.y * h);
  const sw = Math.max(1, Math.round(SAMPLE.w * w));
  const sh = Math.max(1, Math.round(SAMPLE.h * h));
  const data = ctx.getImageData(sx, sy, sw, sh).data;

  // 피부색 픽셀만 골라 평균
  let sr = 0, sg = 0, sb = 0, n = 0;
  let srAll = 0, sgAll = 0, sbAll = 0, nAll = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 200) continue;
    srAll += r; sgAll += g; sbAll += b; nAll++;
    if (isSkin(r, g, b)) { sr += r; sg += g; sb += b; n++; }
  }

  let R, G, B, skinRatio;
  if (n >= nAll * 0.08 && n > 30) {
    R = sr / n; G = sg / n; B = sb / n; skinRatio = n / nAll;
  } else {
    // 피부 픽셀이 너무 적으면 영역 평균으로 대체
    R = srAll / nAll; G = sgAll / nAll; B = sbAll / nAll; skinRatio = n / Math.max(1, nAll);
  }

  const lab = rgbToLab(R, G, B);
  const hue = (Math.atan2(lab.b, lab.a) * 180) / Math.PI; // 색상각(도)
  const ita = (Math.atan2(lab.L - 50, lab.b) * 180) / Math.PI; // 밝기 지표

  // 언더톤 판정 (색상각 기준)
  let undertone; // 'warm' | 'cool' | 'neutral'
  if (hue >= 51) undertone = "warm";
  else if (hue <= 43) undertone = "cool";
  else undertone = "neutral";

  // 계절 배정을 위한 웜/쿨 방향 (뉴트럴은 가까운 쪽으로)
  const warmLean = undertone === "warm" || (undertone === "neutral" && hue >= 47);

  // 밝기: ITA 기준 (light/deep)
  const isLight = ita >= 30;

  let season;
  if (warmLean && isLight) season = "spring";
  else if (warmLean && !isLight) season = "autumn";
  else if (!warmLean && isLight) season = "summer";
  else season = "winter";

  return {
    R, G, B, lab, hue, ita, undertone, isLight, season, skinRatio,
  };
}

/* 피부색 픽셀 판별: RGB 기본 규칙 + YCbCr 범위 (다양한 톤 포용) */
function isSkin(r, g, b) {
  if (r < 40 || g < 25 || b < 15) return false;      // 너무 어두운(그림자/머리카락) 제외
  if (r > 250 && g > 250 && b > 250) return false;    // 하이라이트 과포화 제외
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  const ycc = cb >= 77 && cb <= 130 && cr >= 133 && cr <= 175;
  const rgb = r > g && g >= b && r - Math.min(g, b) > 8; // 붉은/따뜻 성향
  return ycc && rgb && y > 40;
}

/* sRGB → Lab (D65) */
function rgbToLab(r, g, b) {
  // 0~1, 감마 해제
  const lin = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const R = lin(r), G = lin(g), B = lin(b);
  // linear RGB → XYZ
  let X = R * 0.4124 + G * 0.3576 + B * 0.1805;
  let Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let Z = R * 0.0193 + G * 0.1192 + B * 0.9505;
  // D65 백색점 정규화
  X /= 0.95047; Y /= 1.0; Z /= 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/* ---------------- 결과 렌더 ---------------- */

function renderResult(res) {
  const d = MAKEUP_DATA[res.season];

  $("seasonEmoji").textContent = d.emoji;
  $("seasonName").textContent = d.seasonKo;
  $("seasonEng").textContent = d.seasonEn;
  $("seasonDesc").innerHTML = d.desc +
    (res.undertone === "neutral" ? "<br><br>" + NEUTRAL_NOTE : "");

  $("skinSwatch").style.background =
    `rgb(${Math.round(res.R)},${Math.round(res.G)},${Math.round(res.B)})`;

  $("undertoneVal").textContent =
    res.undertone === "warm" ? "웜(따뜻)" :
    res.undertone === "cool" ? "쿨(차가움)" : "뉴트럴(중간)";

  $("depthVal").textContent =
    res.ita >= 41 ? "매우 밝음" :
    res.ita >= 30 ? "밝음" :
    res.ita >= 12 ? "중간" : "어두운 편";

  // 스타일
  $("styleName").textContent = d.styleName;
  $("styleMood").textContent = d.mood;

  // 팔레트
  const pal = $("palette");
  pal.innerHTML = "";
  d.palette.forEach((c) => {
    const el = document.createElement("div");
    el.className = "swatch";
    el.innerHTML =
      `<div class="swatch__chip" style="background:${c.hex}"></div>` +
      `<span class="swatch__name">${c.name}</span>` +
      `<span class="swatch__hex">${c.hex}</span>`;
    pal.appendChild(el);
  });

  // 스텝
  const steps = $("steps");
  steps.innerHTML = "";
  d.steps.forEach((s) => {
    const li = document.createElement("li");
    li.innerHTML = s;
    steps.appendChild(li);
  });

  // 팁
  const tips = $("tips");
  tips.innerHTML = "";
  d.tips.forEach((t) => {
    const li = document.createElement("li");
    li.innerHTML = t;
    tips.appendChild(li);
  });

  // 설명(왜 이렇게 나왔나)
  $("whyBody").innerHTML = buildWhy(res);

  els.stepResult.hidden = false;
  els.stepResult.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildWhy(res) {
  const skinPct = Math.round(res.skinRatio * 100);
  return `
    <p>사진 속 얼굴 중앙(볼·이마) 영역에서 <b>피부색 픽셀</b>을 골라 평균 색을 구했어요.
    (분석 영역에서 약 <b>${skinPct}%</b>가 피부색으로 인식됨)</p>
    <p>그 색을 <b>Lab 색공간</b>으로 바꿔 두 가지를 계산했어요:</p>
    <ul>
      <li><b>색상각(hue)</b> ≈ <code>${res.hue.toFixed(1)}°</code> → 노랑기(웜) vs 붉은기(쿨) 판단
        → <b>${res.undertone === "warm" ? "웜" : res.undertone === "cool" ? "쿨" : "뉴트럴"}</b></li>
      <li><b>밝기지표(ITA°)</b> ≈ <code>${res.ita.toFixed(1)}°</code> → 피부 밝기 판단
        → <b>${res.isLight ? "밝은 편" : "깊은 편"}</b></li>
    </ul>
    <p>이 둘을 조합해 <b>봄·여름·가을·겨울</b> 퍼스널컬러 중 하나로 안내해요.</p>
    <p style="margin-top:8px;color:#a08">💡 조명이 노란 실내등이면 웜, 흰 형광등이면 쿨로 치우칠 수 있어요.
    가장 정확한 결과는 <b>자연광(창가 낮빛)</b>에서 나와요!</p>
  `;
}

/* 페이지 이탈 시 카메라 정리 */
window.addEventListener("beforeunload", stopCamera);
