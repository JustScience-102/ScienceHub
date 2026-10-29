// Supabase (PostgREST) trả tối đa 1000 dòng mỗi truy vấn và cắt NGẦM phần còn lại.
// Hàm này tải theo trang cho tới hết, sắp theo khóa ổn định để không sót/trùng dòng giữa các trang.
// buildQuery: hàm tạo lại truy vấn (vd. () => supabase.from('students').select('*')).
// Trả về { data, error } giống supabase-js để dùng chung với Promise.all.
export const PAGE_SIZE = 1000

export async function fetchAll(buildQuery, { orderBy = 'id', pageSize = PAGE_SIZE } = {}) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery()
      .order(orderBy, { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) return { data: null, error }
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) return { data: rows, error: null }
  }
}
