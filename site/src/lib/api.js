// Gọi API (cùng tên miền): trả dữ liệu JSON, lỗi thì ném Error có câu báo tiếng Việt của máy chủ.
export async function api(url, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('Không kết nối được máy chủ. Phụ huynh vui lòng kiểm tra mạng rồi thử lại.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(
      data?.error ?? `Trung tâm chưa tải được dữ liệu (lỗi ${res.status}). Phụ huynh vui lòng thử lại sau ít phút.`,
    )
  }
  return data
}
