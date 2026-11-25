// Kết nối CSDL app quản lý cho các hàm máy chủ của web (site/api/*), bằng tài khoản website_link
// (supabase/v3/11_website.sql). Chuỗi kết nối: biến môi trường WEBSITE_DATABASE_URL (Transaction pooler, cổng 6543).
// Lưu ý thư viện postgres: KHÔNG truyền mảng bằng db.array() hay ép ::jsonb ở câu lệnh (lần gọi đầu trên kết nối mới
// gửi sai định dạng / tự JSON.stringify thêm một lần) – truyền chuỗi thường rồi để CSDL tự đổi kiểu.
import postgres from 'postgres'

let sql = null

export function isConfigured() {
  return Boolean(process.env.WEBSITE_DATABASE_URL)
}

export function getSql() {
  sql ??= postgres(process.env.WEBSITE_DATABASE_URL, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => undefined,
    connection: { application_name: 'sciencehub-site' },
  })
  return sql
}

export async function resetConnection() {
  const old = sql
  sql = null
  if (old) await old.end({ timeout: 0 }).catch(() => undefined)
}

// Lỗi do CSDL trả (có mã SQLSTATE 5 ký tự, vd. P0001, 22P02) khác lỗi đường truyền (CONNECTION_CLOSED, ECONNRESET...).
export function isConnectionError(error) {
  return !/^[0-9A-Z]{5}$/.test(String(error?.code ?? ''))
}

// Vercel cho hàm "ngủ" giữa các lần gọi; kết nối giữ sẵn có thể đã bị đóng mà hàm không biết. Lỗi thì bỏ kết nối cũ
// và thử lại một lần bằng kết nối mới, nếu shouldRetry(lỗi) cho phép (mặc định: mọi lỗi, dùng cho truy vấn chỉ đọc).
export function withRetry(run, reset = resetConnection, shouldRetry = () => true) {
  return async (...args) => {
    try {
      return await run(...args)
    } catch (error) {
      if (!shouldRetry(error)) throw error
      console.warn('CSDL: thử lại bằng kết nối mới:', error?.code ?? error?.message)
      await reset()
      return run(...args)
    }
  }
}

// Mã lỗi ngắn trả kèm câu báo lỗi chung (để dò lỗi), không trả nội dung lỗi.
export function errorCode(error) {
  return String(error?.code ?? error?.name ?? 'UNKNOWN').slice(0, 40)
}
