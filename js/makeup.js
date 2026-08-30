/* =========================================================
 *  가상 메이크업 입히기 (Virtual Try-On)
 *  - MediaPipe FaceMesh로 얼굴 랜드마크를 찾아 입술·볼·눈에 색을 올림
 *  - 사진은 브라우저 안에서만 처리되고 어디에도 전송되지 않음
 * ========================================================= */
(function () {
  const FACEMESH_SRC =
    "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/face_mesh.js";
  const FACEMESH_BASE =
    "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619";

  // 랜드마크 인덱스 (FaceMesh 468/478 포인트 기준)
  const OUTER_LIP = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
  const INNER_LIP = [78,95,88,178,87,14,317,402,318,324,308,415,310,311,312,13,82,81,80,191];
  const LEFT_EYE_UP  = [33,246,161,160,159,158,157,173,133];   // 왼눈 윗꺼풀 (바깥→안)
  const RIGHT_EYE_UP = [263,466,388,387,386,385,384,398,362];  // 오른눈 윗꺼풀 (바깥→안)

  let faceMesh = null;
  let scriptPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.crossOrigin = "anonymous";
      s.onload = resolve;
      s.onerror = () => reject(new Error("FaceMesh 스크립트를 불러오지 못했어요."));
      document.head.appendChild(s);
    });
  }

  async function getFaceMesh() {
    if (faceMesh) return faceMesh;
    if (!scriptPromise) scriptPromise = loadScript(FACEMESH_SRC);
    await scriptPromise;
    if (typeof FaceMesh === "undefined") throw new Error("FaceMesh 로드 실패");
    faceMesh = new FaceMesh({ locateFile: (f) => `${FACEMESH_BASE}/${f}` });
    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
    });
    return faceMesh;
  }

  function detect(img) {
    return new Promise(async (resolve, reject) => {
      try {
        const fm = await getFaceMesh();
        fm.onResults((res) => resolve(res));
        await fm.send({ image: img });
      } catch (e) {
        reject(e);
      }
    });
  }

  /* ---------- 그리기 유틸 ---------- */
  function hexToRgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function polyPath(ctx, pts, idxs, W, H) {
    idxs.forEach((id, i) => {
      const p = pts[id];
      const x = p.x * W, y = p.y * H;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }

  // 오프스크린에 그린 뒤 blur를 적용해 부드럽게 합성
  function composite(ctx, drawFn, alpha, blurPx, blend) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const oc = document.createElement("canvas");
    oc.width = W; oc.height = H;
    const octx = oc.getContext("2d");
    drawFn(octx);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = blend || "multiply";
    if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
    ctx.drawImage(oc, 0, 0);
    ctx.restore();
  }

  function dist(a, b, W, H) {
    return Math.hypot((a.x - b.x) * W, (a.y - b.y) * H);
  }

  function drawMakeup(canvas, img, pts, colors) {
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);

    const faceW = dist(pts[234], pts[454], W, H); // 얼굴 가로폭(px)

    // ---- 입술 ----
    composite(ctx, (octx) => {
      octx.beginPath();
      polyPath(octx, pts, OUTER_LIP, W, H);
      polyPath(octx, pts, INNER_LIP, W, H);
      octx.fillStyle = colors.lip;
      octx.fill("evenodd"); // 입술 링만 채움(치아·입 안쪽 제외)
    }, 0.5, Math.max(1, faceW * 0.006), "multiply");

    // ---- 볼터치 ----
    const leftCheek = pts[50], rightCheek = pts[280];
    const rad = faceW * 0.17;
    composite(ctx, (octx) => {
      [leftCheek, rightCheek].forEach((c) => {
        const cx = c.x * W, cy = c.y * H;
        const g = octx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, hexToRgba(colors.blush, 1));
        g.addColorStop(1, hexToRgba(colors.blush, 0));
        octx.fillStyle = g;
        octx.beginPath();
        octx.arc(cx, cy, rad, 0, Math.PI * 2);
        octx.fill();
      });
    }, 0.32, faceW * 0.015, "multiply");

    // ---- 아이섀도 ----
    composite(ctx, (octx) => {
      octx.fillStyle = colors.eye;
      [[LEFT_EYE_UP, 159, 145], [RIGHT_EYE_UP, 386, 374]].forEach(([lid, topId, botId]) => {
        const eyeH = dist(pts[topId], pts[botId], W, H);
        const lift = eyeH * 1.4; // 윗꺼풀 위로 올려 크레센트 형태
        octx.beginPath();
        // 아래 라인: 윗꺼풀 그대로
        lid.forEach((id, i) => {
          const p = pts[id];
          const x = p.x * W, y = p.y * H;
          if (i === 0) octx.moveTo(x, y); else octx.lineTo(x, y);
        });
        // 위 라인: 윗꺼풀을 위로 올려 역순
        for (let i = lid.length - 1; i >= 0; i--) {
          const p = pts[lid[i]];
          octx.lineTo(p.x * W, p.y * H - lift);
        }
        octx.closePath();
        octx.fill();
      });
    }, 0.34, faceW * 0.012, "multiply");
  }

  /* ---------- 외부 API ---------- */
  async function run(img, season) {
    const colors = (window.MAKEUP_DATA[season] || {}).tryon;
    if (!colors) throw new Error("색상 정보 없음");

    // 출력 캔버스 크기(최대 1000px)
    const maxSide = 1000;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const W = Math.round(img.naturalWidth * scale);
    const H = Math.round(img.naturalHeight * scale);

    const res = await detect(img);
    const faces = res && res.multiFaceLandmarks;
    if (!faces || !faces.length) {
      return { ok: false, reason: "no-face" };
    }

    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    drawMakeup(canvas, img, faces[0], colors);
    return { ok: true, canvas };
  }

  window.MakeupTryOn = { run };
})();
