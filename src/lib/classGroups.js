// Nhóm lớp: các lớp cùng nội dung bài học nằm chung một "phần" và không được có học sinh trùng nhau
// (Database chặn cứng). Học sinh thiếu phần nào thì giao diện cảnh báo.
// Dữ liệu từ RPC class_groups_overview / save_class_group (supabase/v3/06_rpc_admin.sql).
// File này chỉ có hàm thuần (không gọi Database) để kiểm thử được bằng scripts/test-js.mjs.

export const MAX_PARTS = 10

// { [class_id]: part_no } -> [[class_id...], [class_id...]] theo phần 1..partCount.
// Trả { parts } hoặc { error } (tiếng Việt). Database kiểm tra lại toàn bộ.
export function partsFromAssignment(assignment, partCount) {
  const parts = Array.from({ length: partCount }, () => [])
  for (const [classId, partNo] of Object.entries(assignment ?? {})) {
    const index = Number(partNo) - 1
    if (index >= 0 && index < partCount) parts[index].push(classId)
  }
  const empty = parts.findIndex((list) => list.length === 0)
  if (empty >= 0) return { error: `Phần ${empty + 1} chưa có lớp nào. Hãy chọn lớp cho phần này hoặc bớt phần.` }
  if (parts.flat().length < 2) return { error: 'Nhóm lớp cần ít nhất hai lớp.' }
  return { parts }
}

// Nhóm đã lưu -> { assignment: {class_id: part_no}, partCount } để mở form sửa.
export function assignmentFromGroup(group) {
  const assignment = {}
  let partCount = 0
  for (const part of group?.parts ?? []) {
    partCount = Math.max(partCount, part.part_no)
    for (const cls of part.classes ?? []) assignment[cls.id] = part.part_no
  }
  return { assignment, partCount: Math.max(partCount, 1) }
}

// { [class_id]: lớp } của một nhóm (để đổi class_ids trong cảnh báo thành tên lớp).
export function groupClassMap(group) {
  const map = new Map()
  for (const part of group?.parts ?? []) for (const cls of part.classes ?? []) map.set(cls.id, cls)
  return map
}

// { [class_id]: tên nhóm } của mọi nhóm, trừ nhóm exceptId (đang sửa).
export function classGroupNames(groups, exceptId = null) {
  const map = new Map()
  for (const group of groups ?? []) {
    if (group.id === exceptId) continue
    for (const part of group.parts ?? []) for (const cls of part.classes ?? []) map.set(cls.id, group.name)
  }
  return map
}

// Không em nào thiếu phần và không em nào học hai lớp cùng phần (khi đó tổng các phần bằng nhau).
export function groupIsBalanced(group) {
  return (group?.incomplete ?? []).length === 0 && (group?.overlaps ?? []).length === 0
}
