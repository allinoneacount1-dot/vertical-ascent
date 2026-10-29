// G0 environment probe (docs/directive/ref/06-testing.md §Probe G0). Run by path: pnpm exec vitexec ./vitexec/probes/env.ts
const gl = document.createElement('canvas').getContext('webgl2')
if (!gl) throw new Error('no webgl2')
const ext = gl.getExtension('WEBGL_debug_renderer_info')
const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)
console.log('env ' + JSON.stringify({ ua: navigator.userAgent, renderer, vendor, dpr: devicePixelRatio, ext: !!ext }))
if (/swiftshader|llvmpipe/i.test(String(renderer))) console.warn('software renderer')
