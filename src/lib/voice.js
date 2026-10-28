// Điểm danh bằng giọng nói: dùng Web Speech API có sẵn của trình duyệt (không cài thư viện).
import { normalizeText } from './text'

// Trả về lớp nhận dạng giọng nói của trình duyệt, hoặc null nếu trình duyệt không hỗ trợ.
export function getSpeechRecognition() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

// Bỏ dấu, bỏ dấu câu, gom khoảng trắng: "Nguyễn Minh-Anh," -> "nguyen minh anh"
function clean(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Tìm những học sinh được đọc tên trong đoạn văn bản nhận dạng được.
//   students: [{ key, name }]
// Thử lần lượt: họ tên đầy đủ -> hai từ cuối -> tên gọi (từ cuối).
// Cụm nào khớp nhiều học sinh thì KHÔNG tự chọn, đưa vào `ambiguous` để người dùng bấm tay.
// Trả về { matched: [key], ambiguous: [{ phrase, names }] }
export function matchSpokenNames(transcript, students) {
  const levels = [
    (tokens) => tokens.join(' '),
    (tokens) => tokens.slice(-2).join(' '),
    (tokens) => tokens.slice(-1).join(' '),
  ]
  let text = ` ${clean(transcript)} `
  const matched = new Set()
  const ambiguous = []
  const seenPhrases = new Set()

  for (const phraseOf of levels) {
    const groups = new Map()
    for (const student of students) {
      if (matched.has(student.key)) continue
      const tokens = clean(student.name).split(' ').filter(Boolean)
      if (tokens.length === 0) continue
      const phrase = phraseOf(tokens)
      if (!phrase || !text.includes(` ${phrase} `)) continue
      if (!groups.has(phrase)) groups.set(phrase, [])
      groups.get(phrase).push(student)
    }

    for (const [phrase, list] of groups) {
      if (list.length === 1) {
        matched.add(list[0].key)
      } else if (!seenPhrases.has(phrase)) {
        seenPhrases.add(phrase)
        ambiguous.push({ phrase, names: list.map((item) => item.name) })
      }
      // Bỏ cụm đã dùng để từ ngắn hơn không khớp lại bên trong nó
      text = text.split(` ${phrase} `).join('  ')
    }
  }

  return { matched: [...matched], ambiguous }
}
