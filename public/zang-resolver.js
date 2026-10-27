(() => {
  const CACHE_PREFIX = "zang-resolve-v1:";
  const CACHE_TTL = 24 * 60 * 60 * 1000;
  const processed = new WeakMap();

  const style = document.createElement("style");
  style.textContent = `
    .zf-resolved-layer{position:absolute;z-index:30;inset:0;display:grid;place-items:center;background:#030305;overflow:hidden}
    .zf-resolved-layer iframe{width:100%;height:100%;border:0;background:#000;display:block}
    .zf-resolved-loading,.zf-resolved-empty{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:32px;text-align:center;background:radial-gradient(circle at 50% 45%,rgba(241,13,53,.11),transparent 28%),#050507;color:#fff}
    .zf-resolved-spinner{width:48px;height:48px;border:2px solid rgba(255,255,255,.12);border-top-color:#f10d35;border-radius:50%;animation:zfResolvedSpin .8s linear infinite;box-shadow:0 0 30px rgba(241,13,53,.18)}
    .zf-resolved-empty strong{font:700 20px/1.2 Manrope,system-ui,sans-serif}
    .zf-resolved-empty p{max-width:520px;margin:0;color:#92929c;font:500 12px/1.65 system-ui,sans-serif}
    .zf-resolved-badge{display:inline-flex;align-items:center;gap:7px;margin-top:4px;padding:7px 10px;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:rgba(255,255,255,.05);color:#bdbdc5;font:700 9px/1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase}
    @keyframes zfResolvedSpin{to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(style);

  function readCache(key) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.expiresAt < Date.now()) {
        localStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }
      return parsed.value;
    } catch {
      return null;
    }
  }

  function writeCache(key, value) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ expiresAt: Date.now() + CACHE_TTL, value }));
    } catch {
      // Cache é apenas uma otimização.
    }
  }

  function extractYear(title) {
    const match = title.match(/\b(19|20)\d{2}\b/);
    return match ? match[0] : "";
  }

  function modalContext(modal) {
    const title = modal.querySelector(".zf-player-info h2")?.textContent?.trim() || "";
    const kicker = modal.querySelector(".zf-kicker")?.textContent || "";
    const kind = /s[ée]rie/i.test(kicker) ? "Série" : "Filme";
    return { title, kind, year: extractYear(title) };
  }

  function updateMetadata(modal, data) {
    const title = modal.querySelector(".zf-player-info h2");
    if (title && data.canonicalTitle) title.textContent = data.canonicalTitle;

    const paragraph = modal.querySelector(".zf-player-info p");
    if (paragraph && data.overview) paragraph.textContent = data.overview;

    const score = modal.querySelector(".zf-score");
    if (score && Number.isFinite(data.voteAverage) && data.voteAverage > 0) {
      score.textContent = `★ TMDB ${Number(data.voteAverage).toFixed(1)}`;
    }
  }

  function stopNativePlayer(stage) {
    const video = stage.querySelector("video");
    if (!video) return;
    try { video.pause(); } catch {}
    video.style.visibility = "hidden";
    video.style.pointerEvents = "none";
  }

  function renderLoading(stage) {
    let layer = stage.querySelector(".zf-resolved-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "zf-resolved-layer";
      stage.appendChild(layer);
    }
    layer.innerHTML = `<div class="zf-resolved-loading"><div class="zf-resolved-spinner"></div><strong>Localizando no TMDB…</strong><span class="zf-resolved-badge">Zang Resolver</span></div>`;
    return layer;
  }

  function renderEmpty(layer, message, detail) {
    layer.innerHTML = "";
    const box = document.createElement("div");
    box.className = "zf-resolved-empty";
    const strong = document.createElement("strong");
    strong.textContent = message;
    const p = document.createElement("p");
    p.textContent = detail;
    const badge = document.createElement("span");
    badge.className = "zf-resolved-badge";
    badge.textContent = "TMDB / IMDb resolver";
    box.append(strong, p, badge);
    layer.appendChild(box);
  }

  function renderFrame(layer, src, label) {
    layer.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.title = label || "Player Zang Flix";
    iframe.scrolling = "no";
    iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    layer.appendChild(iframe);
  }

  async function resolveModal(modal) {
    const stage = modal.querySelector(".zf-player-stage");
    if (!stage) return;

    const context = modalContext(modal);
    if (!context.title) return;

    const key = `${context.kind}|${context.title}`.toLowerCase();
    const previous = processed.get(modal);
    if (previous === key && stage.querySelector(".zf-resolved-layer")) return;
    processed.set(modal, key);

    stopNativePlayer(stage);
    const layer = renderLoading(stage);
    const cached = readCache(key);

    try {
      const data = cached || await fetch(
        `/api/zang-resolve?title=${encodeURIComponent(context.title)}&kind=${encodeURIComponent(context.kind)}${context.year ? `&year=${encodeURIComponent(context.year)}` : ""}`,
        { headers: { accept: "application/json" } },
      ).then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.message || `Resolver respondeu ${response.status}`);
        return body;
      });

      if (!cached && data?.resolved) writeCache(key, data);
      updateMetadata(modal, data || {});

      const source = data?.embedUrl || data?.trailerUrl;
      if (source) {
        renderFrame(layer, source, data?.canonicalTitle ? `Assistir ${data.canonicalTitle}` : `Assistir ${context.title}`);
        return;
      }

      if (data?.reason === "tmdb_not_configured") {
        renderEmpty(layer, "Fonte de reprodução não configurada", "Configure TMDB_API_TOKEN no servidor e um template de embed autorizado. Enquanto isso, o catálogo continua disponível normalmente.");
        return;
      }

      renderEmpty(layer, "Fonte de reprodução não configurada", data?.message || "O título foi identificado, mas não há um provedor autorizado configurado e nenhum trailer oficial disponível.");
    } catch (error) {
      renderEmpty(layer, "Não foi possível preparar este título", error instanceof Error ? error.message : "Falha ao consultar os metadados do título.");
    }
  }

  const observer = new MutationObserver(() => {
    document.querySelectorAll(".zf-player-modal").forEach((modal) => {
      void resolveModal(modal);
      const stage = modal.querySelector(".zf-player-stage");
      if (stage) stopNativePlayer(stage);
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
  document.querySelectorAll(".zf-player-modal").forEach((modal) => void resolveModal(modal));
})();
