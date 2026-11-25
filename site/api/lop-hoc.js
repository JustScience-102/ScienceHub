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
  })
  return sql
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
      console.error('website.catalog lỗi:', error?.message ?? error)
      res.setHeader('Cache-Control', 'no-store')
      return res.status(503).json({ error: ERROR })
    }
  }
}

export default createHandler({
  configured: () => Boolean(process.env.WEBSITE_DATABASE_URL),
  async query(subjects) {
    const db = connect()
    const [row] = await db`select website.catalog(${db.array(subjects)}::text[]) as data`
    return row.data
  },
})
