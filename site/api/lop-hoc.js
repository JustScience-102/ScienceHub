// Hàm máy chủ Vercel: GET /api/lop-hoc -> danh sách lớp đang mở (môn trong CLASS_SUBJECTS) từ CSDL app quản lý.
// Nối bằng tài khoản CSDL website_link (chỉ gọi được website.catalog, xem supabase/v3/11_website.sql), chuỗi kết nối
// ở biến môi trường WEBSITE_DATABASE_URL của dự án Vercel "site" (Transaction pooler, cổng 6543).
// Kết quả được bộ nhớ đệm của Vercel giữ 5 phút: sửa lịch trong app quản lý thì tối đa khoảng 5 phút sau web đổi theo.
import postgres from 'postgres'
import { CLASS_SUBJECTS } from '../src/data/center.js'

const CACHE = 'public, s-maxage=300, stale-while-revalidate=3600'
const ERROR = 'Chưa tải được lịch học. Phụ huynh vui lòng thử lại sau ít phút hoặc liên hệ thầy.'

let sql = null
function connect() {
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

async function resetConnection() {
  const old = sql
  sql = null
  if (old) await old.end({ timeout: 0 }).catch(() => undefined)
}

// Vercel cho hàm "ngủ" giữa các lần gọi; kết nối giữ sẵn có thể đã bị máy chủ CSDL đóng mà hàm không biết, lần gọi
// đầu sau một lúc nghỉ sẽ lỗi. Truy vấn chỉ đọc nên an toàn: lỗi thì bỏ kết nối cũ và thử lại một lần bằng kết nối mới.
export function withRetry(run, reset) {
  return async (...args) => {
    try {
      return await run(...args)
    } catch (error) {
      console.warn('website.catalog thử lại bằng kết nối mới:', error?.code ?? error?.message)
      await reset()
      return run(...args)
    }
  }
}

// Tách phần xử lý để kiểm thử được mà không cần CSDL thật (scripts/test-js.mjs truyền hàm truy vấn giả).
export function createHandler({ query, configured }) {
  return async function handler(req, res) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ error: 'Chỉ hỗ trợ GET.' })
    }
    if (!configured()) return res.status(503).json({ error: ERROR })
    try {
      const data = await query(CLASS_SUBJECTS)
      res.setHeader('Cache-Control', CACHE)
      return res.status(200).json(data)
    } catch (error) {
      console.error('website.catalog lỗi:', error?.code, error?.message ?? error)
      res.setHeader('Cache-Control', 'no-store')
      // Chỉ trả mã lỗi kỹ thuật (vd. 28P01 sai mật khẩu, ERR_INVALID_URL chuỗi kết nối hỏng) để dò lỗi, không trả nội dung.
      return res.status(503).json({ error: ERROR, code: String(error?.code ?? error?.name ?? 'UNKNOWN').slice(0, 40) })
    }
  }
}

export default createHandler({
  configured: () => Boolean(process.env.WEBSITE_DATABASE_URL),
  query: withRetry(async (subjects) => {
    const db = connect()
    // Gửi danh sách môn là một chuỗi thường "Vật Lí|Hóa học", CSDL tự tách thành text[]. Không dùng db.array():
    // trên kết nối mới (chưa nạp kiểu mảng) nó gửi sai định dạng ("malformed array literal", lỗi 22P02 ở lần gọi đầu
    // của mỗi lần Vercel khởi động hàm); cũng không dùng ::jsonb vì thư viện tự JSON.stringify thêm một lần.
    const [row] = await db`select website.catalog(string_to_array(${subjects.join('|')}::text, '|')) as data`
    return row.data
  }, resetConnection),
})
