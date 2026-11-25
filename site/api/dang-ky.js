// Hàm máy chủ Vercel: POST /api/dang-ky -> ghi đơn đăng ký học vào CSDL app quản lý
// (website.submit_registration, supabase/v3/11_website.sql; kết nối: site/server/db.js).
// Kiểm tra nhanh ở đây (cùng quy tắc với form), CSDL kiểm tra lại toàn bộ; lỗi nhập liệu của CSDL (SQLSTATE P0001)
// trả nguyên câu cho phụ huynh. Ô bẫy "website" có chữ thì coi như máy gửi: trả thành công nhưng không ghi.
// Chống spam theo IP: chỉ gửi HMAC của địa chỉ IP (khóa = chuỗi kết nối bí mật), không lưu IP thật.
import { createHmac } from 'node:crypto'
import { buildPayload, validateFields } from '../src/lib/registration.js'
import { errorCode, getSql, isConfigured, isConnectionError, resetConnection, withRetry } from '../server/db.js'

const ERROR = 'Chưa gửi được đăng ký. Phụ huynh vui lòng thử lại sau ít phút hoặc gọi điện cho thầy.'
const BAD_DATA = 'Dữ liệu đăng ký không đọc được. Phụ huynh vui lòng tải lại trang rồi gửi lại.'

export function clientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for']
  const first = (Array.isArray(forwarded) ? forwarded[0] : String(forwarded ?? '')).split(',')[0].trim()
  return first || String(req.headers?.['x-real-ip'] ?? '').trim()
}

export function ipHash(ip, secret) {
  return ip && secret ? createHmac('sha256', secret).update(ip).digest('hex').slice(0, 32) : null
}

export function createHandler({ submit, configured, secret }) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ error: 'Chỉ hỗ trợ POST.' })
    }
    let body = req.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch {
        body = null
      }
    }
    if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > 8000) {
      return res.status(400).json({ error: BAD_DATA })
    }
    if (String(body.website ?? '').trim()) return res.status(200).json({ ok: true })
    const errors = validateFields(body)
    const first = Object.values(errors)[0]
    if (first) return res.status(400).json({ error: first, fields: errors })
    if (!Array.isArray(body.class_ids) || body.class_ids.length === 0) {
      return res.status(400).json({ error: 'Vui lòng chọn lịch học cho ít nhất một môn.' })
    }
    if (!configured()) return res.status(503).json({ error: ERROR })
    try {
      const result = await submit(buildPayload(body, body.class_ids.map(String)), ipHash(clientIp(req), secret()))
      return res.status(200).json({ ok: true, id: result.id, updated: Boolean(result.updated) })
    } catch (error) {
      if (error?.code === 'P0001') return res.status(400).json({ error: error.message })
      console.error('website.submit_registration lỗi:', error?.code, error?.message ?? error)
      return res.status(503).json({ error: ERROR, code: errorCode(error) })
    }
  }
}

export default createHandler({
  configured: isConfigured,
  secret: () => process.env.WEBSITE_DATABASE_URL,
  // Ghi dữ liệu: chỉ thử lại khi đứt kết nối (lỗi do CSDL trả thì báo ngay, không ghi lần hai).
  submit: withRetry(
    async (payload, hash) => {
      const db = getSql()
      const [row] = await db`select website.submit_registration(${JSON.stringify(payload)}::text, ${hash}::text) as r`
      return row.r
    },
    resetConnection,
    isConnectionError,
  ),
})
