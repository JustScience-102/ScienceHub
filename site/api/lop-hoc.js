// Hàm máy chủ Vercel: GET /api/lop-hoc -> danh sách lớp đang mở (môn trong CLASS_SUBJECTS) từ CSDL app quản lý
// (website.catalog, supabase/v3/11_website.sql). Kết nối: site/server/db.js.
// Kết quả được bộ nhớ đệm của Vercel giữ 5 phút: sửa lịch trong app quản lý thì tối đa khoảng 5 phút sau web đổi theo.
import { CLASS_SUBJECTS } from '../src/data/center.js'
import { errorCode, getSql, isConfigured, withRetry } from '../server/db.js'

const CACHE = 'public, s-maxage=300, stale-while-revalidate=3600'
const ERROR = 'Chưa tải được lịch học. Phụ huynh vui lòng thử lại sau ít phút hoặc liên hệ thầy.'

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
      return res.status(503).json({ error: ERROR, code: errorCode(error) })
    }
  }
}

export default createHandler({
  configured: isConfigured,
  // Truy vấn chỉ đọc: lỗi gì cũng thử lại một lần bằng kết nối mới.
  query: withRetry(async (subjects) => {
    const db = getSql()
    // Danh sách môn gửi dạng chuỗi "Vật Lí|Hóa học", CSDL tự tách thành text[] (xem ghi chú ở server/db.js).
    const [row] = await db`select website.catalog(string_to_array(${subjects.join('|')}::text, '|')) as data`
    return row.data
  }),
})
