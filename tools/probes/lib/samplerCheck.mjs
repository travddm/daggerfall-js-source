// Does this browser's driver keep a nearest-mip filter once a sampler has anisotropy? The Ground sharpness row's two
// choices are a nearest-mip and a trilinear sampler on the ground; where the driver drops the mip filter for
// anisotropy, they draw alike (src/render/anisotropic-mip-filter.ts).
//
// `samplerCheck` runs inside a page (page.evaluate). It draws one texel of a 64x64 texture whose mip levels are each one
// flat colour, through textureGrad with a footprint four times longer across than along, so that anisotropic filtering
// picks level 2.5 and plain filtering level 4.5. A nearest-mip sampler returns one level's colour; a mip blend returns a
// mix of two. It compares nearest-mip at anisotropy 1 (the control), nearest-mip at anisotropy 8 and trilinear at 8.

export function samplerCheck() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 4;
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
  if (!gl) return { error: 'no WebGL2' };
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  const ext = gl.getExtension('EXT_texture_filter_anisotropic');
  const maxAnisotropy = ext ? Number(gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) : 1;
  const levelColours = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 0],
    [0, 255, 255],
    [255, 0, 255],
    [255, 255, 255],
  ];
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  for (let level = 0, size = 64; size >= 1; level++, size >>= 1) {
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) data.set([...levelColours[level], 255], i * 4);
    gl.texImage2D(gl.TEXTURE_2D, level, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }
  const shader = (type, source) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    return s;
  };
  const program = gl.createProgram();
  gl.attachShader(
    program,
    shader(
      gl.VERTEX_SHADER,
      '#version 300 es\nvoid main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }',
    ),
  );
  gl.attachShader(
    program,
    shader(
      gl.FRAGMENT_SHADER,
      '#version 300 es\nprecision highp float; uniform sampler2D t; uniform vec2 gx, gy; out vec4 o;\nvoid main(){ o = textureGrad(t, vec2(0.5), gx, gy); }',
    ),
  );
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return { renderer, error: gl.getProgramInfoLog(program) };
  gl.useProgram(program);
  gl.uniform2f(gl.getUniformLocation(program, 'gx'), 2 ** 4.5 / 64, 0);
  gl.uniform2f(gl.getUniformLocation(program, 'gy'), 0, 2 ** 2.5 / 64);
  gl.viewport(0, 0, 4, 4);
  const sample = (minFilter, anisotropy) => {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(anisotropy, maxAnisotropy));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const pixel = new Uint8Array(4);
    gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const rgb = [pixel[0], pixel[1], pixel[2]];
    const level = levelColours.findIndex((c) => c.every((v, i) => Math.abs(v - rgb[i]) <= 6));
    return { rgb, level: level >= 0 ? level : null };
  };
  const nearest1 = sample(gl.NEAREST_MIPMAP_NEAREST, 1);
  const nearest8 = sample(gl.NEAREST_MIPMAP_NEAREST, 8);
  const trilinear8 = sample(gl.LINEAR_MIPMAP_LINEAR, 8);
  const same = nearest8.rgb.every((v, i) => Math.abs(v - trilinear8.rgb[i]) <= 2);
  return {
    renderer,
    maxAnisotropy,
    nearest1,
    nearest8,
    trilinear8,
    // the answer: at 8x, does nearest-mip still read one level, and does it differ from trilinear?
    keepsNearestMip: nearest8.level !== null && !same,
  };
}
