// Chỉ tự focus ô nhập trên thiết bị có chuột; trên cảm ứng việc này bật bàn phím ảo ngoài ý muốn.
export function canAutoFocus() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
}
