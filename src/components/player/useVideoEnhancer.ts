"use client";

import { useEffect, useRef, useState } from "react";

export interface VideoEnhancerResult {
  active: boolean;
  supported: boolean;
  avgFrameMs: number;
}

const VS_QUAD = `#version 300 es
in vec2 a_position;
out vec2 v_texCoord;
void main() {
  v_texCoord = (a_position + 1.0) * 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Passe 1 — Upscale: amostragem bicúbica Catmull-Rom 9-tap
const FS_PASS1_BICUBIC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_image;
uniform vec2 u_texelSize;

float catmullRom(float x) {
  float a = -0.5;
  x = abs(x);
  if (x <= 1.0) {
    return (a + 2.0) * x * x * x - (a + 3.0) * x * x + 1.0;
  }
  return 0.0;
}

void main() {
  vec2 pixelPos = v_texCoord / u_texelSize;
  vec2 f = fract(pixelPos);
  vec2 base = (floor(pixelPos) + 0.5) * u_texelSize;

  vec4 col = vec4(0.0);
  float totalWeight = 0.0;

  for (int y = -1; y <= 1; y++) {
    float wy = catmullRom(float(y) - f.y);
    for (int x = -1; x <= 1; x++) {
      float wx = catmullRom(float(x) - f.x);
      float w = wx * wy;
      vec2 coord = base + vec2(float(x), float(y)) * u_texelSize;
      col += texture(u_image, coord) * w;
      totalWeight += w;
    }
  }

  fragColor = totalWeight > 0.0001 ? (col / totalWeight) : texture(u_image, v_texCoord);
}
`;

// Passe 2 — Nitidez adaptativa guiada por borda + denoise sutil
const FS_PASS2_SHARPEN = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_image;
uniform vec2 u_texelSize;

float luma(vec3 rgb) {
  return dot(rgb, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec2 tc = v_texCoord;
  vec2 ts = u_texelSize;

  vec4 center = texture(u_image, tc);
  vec4 n = texture(u_image, tc + vec2(0.0, -ts.y));
  vec4 s = texture(u_image, tc + vec2(0.0, ts.y));
  vec4 w = texture(u_image, tc + vec2(-ts.x, 0.0));
  vec4 e = texture(u_image, tc + vec2(ts.x, 0.0));

  vec4 nw = texture(u_image, tc + vec2(-ts.x, -ts.y));
  vec4 ne = texture(u_image, tc + vec2(ts.x, -ts.y));
  vec4 sw = texture(u_image, tc + vec2(-ts.x, ts.y));
  vec4 se = texture(u_image, tc + vec2(ts.x, ts.y));

  // Blur local gaussiano 3x3
  vec4 blur = (n + s + w + e) * 0.125 + (nw + ne + sw + se) * 0.0625 + center * 0.25;

  // Gradiente de luminância local (detecção de bordas)
  float lCenter = luma(center.rgb);
  float lN = luma(n.rgb);
  float lS = luma(s.rgb);
  float lW = luma(w.rgb);
  float lE = luma(e.rgb);

  float dx = (lE - lW);
  float dy = (lS - lN);
  float edgeStrength = clamp(sqrt(dx * dx + dy * dy) * 4.0, 0.0, 1.0);

  // Unsharp mask adaptativo: bordas recebem nitidez com reforço; áreas planas recebem denoise suave
  vec4 highPass = center - blur;
  vec4 sharpened = center + highPass * (0.25 + 0.60 * edgeStrength);
  vec4 denoised = mix(center, blur, 0.15 * (1.0 - edgeStrength));

  vec4 finalColor = mix(denoised, sharpened, edgeStrength);
  fragColor = clamp(finalColor, 0.0, 1.0);
}
`;

function createShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("[VideoEnhancer] Erro shader:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string
): WebGLProgram | null {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn("[VideoEnhancer] Erro link program:", gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

export function useVideoEnhancer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  enabled: boolean,
  onPerformanceDowngrade?: () => void
): VideoEnhancerResult {
  const [supported, setSupported] = useState(true);
  const [active, setActive] = useState(false);
  const [avgFrameMs, setAvgFrameMs] = useState(16);

  const avgRef = useRef(16);
  const slowTimeRef = useRef(0);
  const downgradedRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl2", {
        alpha: false,
        desynchronized: true,
        powerPreference: "high-performance",
      });
    } catch {
      gl = null;
    }

    if (!gl) {
      setSupported(false);
      setActive(false);
      return;
    }

    setSupported(true);
    if (!enabled) {
      setActive(false);
      return;
    }

    // Cria programas de shader
    const progPass1 = createProgram(gl, VS_QUAD, FS_PASS1_BICUBIC);
    const progPass2 = createProgram(gl, VS_QUAD, FS_PASS2_SHARPEN);
    if (!progPass1 || !progPass2) {
      setSupported(false);
      setActive(false);
      return;
    }

    // Quad de tela cheia
    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    // Textura do vídeo de entrada
    const videoTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Framebuffer intermediário para o Passe 1
    const fboPass1 = gl.createFramebuffer();
    const fboTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, fboTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    let fboWidth = 0;
    let fboHeight = 0;

    let animId = 0;
    let lastTime = performance.now();
    let isDrawing = false;

    const resizeIfNeeded = () => {
      if (!video || !canvas || !gl) return;
      const vw = video.videoWidth || 1920;
      const vh = video.videoHeight || 1080;
      if (vw === 0 || vh === 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.round(
        Math.min(Math.min(vw * 2, window.innerWidth * dpr), 3840)
      );
      const targetH = Math.round((targetW / vw) * vh);

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      if (fboWidth !== targetW || fboHeight !== targetH) {
        fboWidth = targetW;
        fboHeight = targetH;
        gl.bindTexture(gl.TEXTURE_2D, fboTexture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          targetW,
          targetH,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, fboPass1);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          fboTexture,
          0
        );
      }
    };

    const render = () => {
      animId = requestAnimationFrame(render);

      if (!video || !canvas || !gl) return;
      if (video.readyState < 2 || video.paused || video.ended) {
        return;
      }
      if (document.visibilityState !== "visible") {
        return;
      }

      const t0 = performance.now();
      resizeIfNeeded();

      if (canvas.width === 0 || canvas.height === 0) return;

      // Atualiza textura do frame do vídeo
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, videoTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        video
      );

      // PASSE 1: Upscale Catmull-Rom para o FBO intermediário
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboPass1);
      gl.viewport(0, 0, fboWidth, fboHeight);
      gl.useProgram(progPass1);

      const posLoc1 = gl.getAttribLocation(progPass1, "a_position");
      gl.enableVertexAttribArray(posLoc1);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.vertexAttribPointer(posLoc1, 2, gl.FLOAT, false, 0, 0);

      const uTexSize1 = gl.getUniformLocation(progPass1, "u_texelSize");
      gl.uniform2f(
        uTexSize1,
        1.0 / (video.videoWidth || 1920),
        1.0 / (video.videoHeight || 1080)
      );

      const uImg1 = gl.getUniformLocation(progPass1, "u_image");
      gl.uniform1i(uImg1, 0);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // PASSE 2: Nitidez Adaptativa + Denoise para a tela do canvas
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(progPass2);

      const posLoc2 = gl.getAttribLocation(progPass2, "a_position");
      gl.enableVertexAttribArray(posLoc2);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.vertexAttribPointer(posLoc2, 2, gl.FLOAT, false, 0, 0);

      const uTexSize2 = gl.getUniformLocation(progPass2, "u_texelSize");
      gl.uniform2f(uTexSize2, 1.0 / fboWidth, 1.0 / fboHeight);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, fboTexture);
      const uImg2 = gl.getUniformLocation(progPass2, "u_image");
      gl.uniform1i(uImg2, 1);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      if (!isDrawing) {
        isDrawing = true;
        setActive(true);
      }

      // Watchdog de performance (média móvel do tempo de renderização)
      const t1 = performance.now();
      const frameDelta = t1 - t0;
      avgRef.current = avgRef.current * 0.94 + frameDelta * 0.06;

      const elapsed = t1 - lastTime;
      lastTime = t1;

      if (avgRef.current > 24) {
        slowTimeRef.current += elapsed;
        if (slowTimeRef.current > 5000 && !downgradedRef.current) {
          downgradedRef.current = true;
          console.warn(
            `[VideoEnhancer] Performance baixa (${Math.round(avgRef.current)}ms/frame). Desativando HQ...`
          );
          try {
            localStorage.setItem("zangflix:hq-enhance", "false");
          } catch {}
          setActive(false);
          onPerformanceDowngrade?.();
          cancelAnimationFrame(animId);
          return;
        }
      } else {
        slowTimeRef.current = Math.max(0, slowTimeRef.current - elapsed * 0.5);
      }

      setAvgFrameMs(Math.round(avgRef.current));
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      setActive(false);
      if (gl) {
        gl.deleteProgram(progPass1);
        gl.deleteProgram(progPass2);
        gl.deleteBuffer(quadBuffer);
        gl.deleteTexture(videoTexture);
        gl.deleteTexture(fboTexture);
        gl.deleteFramebuffer(fboPass1);
      }
    };
  }, [enabled, videoRef, canvasRef, onPerformanceDowngrade]);

  return {
    active,
    supported,
    avgFrameMs,
  };
}
