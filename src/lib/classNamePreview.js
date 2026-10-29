// Xem trước tên lớp đúng như Database sẽ đặt (RPC preview_class_name, supabase/v3/03_naming.sql).
// Tên lớp do Database sinh (kể cả thêm chữ A/B khi hai giáo viên trùng tên gọi cùng dạy một môn),
// nên giao diện chỉ hiển thị kết quả này, không tự ghép tên.
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

// keepClassNo: STT muốn giữ (vd. STT cũ khi khôi phục); đã có lớp khác dùng thì lấy STT nhỏ nhất còn trống.
export async function previewClassName({ classId = null, subject, grade, teacherId, classNo = null, keepClassNo = null }) {
  if (!subject || !grade || !teacherId) return { name: '', classNo: null, taken: false, error: null }
  const call = (no) =>
    supabase.rpc('preview_class_name', {
      p_class_id: classId,
      p_subject: subject,
      p_grade: Number(grade),
      p_teacher_id: teacherId,
      p_class_no: no,
    })
  let { data, error } = await call(classNo ?? keepClassNo ?? null)
  if (!error && !classNo && keepClassNo && data?.taken) ({ data, error } = await call(null))
  if (error) return { name: '', classNo: null, taken: false, error }
  return { name: data?.name ?? '', classNo: data?.class_no ?? null, taken: Boolean(data?.taken), error: null }
}

// Hook: tự xem trước lại khi môn/khối/giáo viên/STT đổi (đợi 250ms để khỏi gọi liên tục khi gõ).
export function useClassNamePreview(params) {
  const { classId, subject, grade, teacherId, classNo, keepClassNo } = params
  const [state, setState] = useState({ key: '', name: '', classNo: null, taken: false, error: null })
  const key = [classId, subject, grade, teacherId, classNo, keepClassNo].join('|')

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      const result = await previewClassName({ classId, subject, grade, teacherId, classNo, keepClassNo })
      if (!cancelled) setState({ key, ...result })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [key, classId, subject, grade, teacherId, classNo, keepClassNo])

  return { ...state, loading: state.key !== key }
}
