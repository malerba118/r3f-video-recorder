import { WebGLRenderer } from "three";

/**
 * Adjust renderer pixel-ratio and internal drawing-buffer size, always forcing
 * the result to even dimensions (useful for H-264 encoding).
 *
 *   setScale(gl);    // uses device pixel ratio
 *   setScale(gl, 2); // explicit pixel ratio = 2
 *
 * Returns the final internal width/height in physical pixels.
 */
export function setScale(
  gl: WebGLRenderer,
  pixelRatio: number = window.devicePixelRatio ?? 1
) {
  const canvas = gl.domElement as HTMLCanvasElement;
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;

  let width = Math.floor(cssWidth * pixelRatio);
  let height = Math.floor(cssHeight * pixelRatio);

  // always make dimensions even
  if (width % 2) width -= 1;
  if (height % 2) height -= 1;

  gl.setPixelRatio(pixelRatio);
  // `false` keeps the CSS size identical; only drawing-buffer changes.
  gl.setSize(width / pixelRatio, height / pixelRatio, false);

  return { width, height };
}
