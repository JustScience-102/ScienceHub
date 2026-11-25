// Khung "Câu hỏi vì sao hôm nay" ở trang chủ: mỗi lần tải trang hiện ngẫu nhiên 1 câu, nút "Câu khác" để đổi.
//
// THÊM CÂU HỎI MỚI: chép nguyên một khối { ... } bên dưới (từ dấu { tới dấu }, kể cả dấu phẩy cuối),
// dán vào trong cặp ngoặc vuông [ ], rồi sửa 3 dòng:
//   mon:     'Vật Lí' hoặc 'Hóa học' (viết đúng như vậy để nhãn môn có đúng màu)
//   cauHoi:  câu hỏi, nên bắt đầu bằng "Vì sao"
//   loiGiai: lời giải 2–4 câu, dễ hiểu với học sinh lớp 10–12
// Câu có dấu nháy đơn ' bên trong thì viết \' (ví dụ: 'Newton\'s'). Dấu ngoặc kép “ ” dùng thoải mái.
// Lưu file, push lên main là web cập nhật. Xóa một câu: xóa cả khối { ... } của câu đó.

export const WHY_QUESTIONS = [
  // ===== Vật Lí =====
  {
    mon: 'Vật Lí',
    cauHoi: 'Vì sao đi máy bay hay bị ù tai?',
    loiGiai:
      'Khi máy bay cất cánh hoặc hạ cánh, áp suất không khí trong khoang thay đổi khá nhanh, còn không khí ở tai giữa (phía sau màng nhĩ) chưa kịp thay đổi theo. Chênh lệch áp suất ở hai bên làm màng nhĩ bị căng phồng ra hoặc lõm vào, nên ta thấy ù tai và nghe kém. Nuốt nước bọt, ngáp hoặc nhai kẹo giúp mở vòi nhĩ (ống nối tai giữa với họng), không khí đi qua làm cân bằng áp suất nên hết ù.',
  },
  {
    mon: 'Vật Lí',
    cauHoi: 'Vì sao bầu trời có màu xanh?',
    loiGiai:
      'Ánh sáng Mặt Trời gồm nhiều màu. Khi đi qua khí quyển, ánh sáng bị các phân tử khí tán xạ ra mọi hướng, và ánh sáng có bước sóng càng ngắn thì bị tán xạ càng mạnh. Ánh sáng xanh có bước sóng ngắn nên bị tán xạ khắp bầu trời nhiều hơn hẳn ánh sáng đỏ, vì vậy nhìn hướng nào ta cũng thấy màu xanh. Ánh sáng tím còn bị tán xạ mạnh hơn, nhưng ánh sáng Mặt Trời có ít tím hơn và mắt người kém nhạy với màu tím.',
  },
  {
    mon: 'Vật Lí',
    cauHoi: 'Vì sao chim đậu trên dây điện cao thế mà không bị điện giật?',
    loiGiai:
      'Dòng điện chỉ chạy qua cơ thể khi giữa hai điểm tiếp xúc có hiệu điện thế. Hai chân chim cùng đậu trên một sợi dây và ở rất gần nhau, nên hiệu điện thế giữa hai chân gần như bằng 0 và hầu như không có dòng điện chạy qua chim. Nếu chim chạm cùng lúc vào hai dây khác nhau, hoặc vào dây điện và cột điện, nó sẽ bị giật.',
  },
  {
    mon: 'Vật Lí',
    cauHoi: 'Vì sao xe buýt phanh gấp thì người đứng trên xe bị chúi về phía trước?',
    loiGiai:
      'Khi xe đang chạy, người chuyển động cùng vận tốc với xe. Lúc phanh gấp, ma sát giữa chân và sàn làm chân dừng lại theo xe, nhưng phần thân trên do quán tính vẫn giữ vận tốc cũ, nên người bị chúi về phía trước. Đây là lí do khi đi xe cần bám tay vịn và thắt dây an toàn.',
  },
  {
    mon: 'Vật Lí',
    cauHoi: 'Vì sao nồi áp suất nấu thức ăn nhanh chín hơn nồi thường?',
    loiGiai:
      'Nhiệt độ sôi của nước phụ thuộc vào áp suất: áp suất càng cao thì nước sôi ở nhiệt độ càng cao. Ở nồi thường, nước sôi ở khoảng 100 °C; trong nồi áp suất đậy kín, hơi nước bị giữ lại làm áp suất tăng, nên nước sôi ở khoảng 115–120 °C. Nhiệt độ cao hơn giúp thức ăn chín nhanh hơn.',
  },
  {
    mon: 'Vật Lí',
    cauHoi: 'Vì sao ta nhìn thấy tia chớp trước rồi mới nghe tiếng sấm?',
    loiGiai:
      'Chớp và sấm sinh ra cùng một lúc, nhưng ánh sáng truyền đi với tốc độ khoảng 300 000 km/s, còn âm thanh trong không khí chỉ khoảng 340 m/s. Vì vậy ánh sáng đến mắt gần như tức thì, còn tiếng sấm đến chậm hơn. Đếm số giây từ lúc thấy chớp đến lúc nghe sấm rồi nhân với 340 m là ước được khoảng cách tới chỗ sét đánh (khoảng 3 giây ứng với 1 km).',
  },
  {
    mon: 'Vật Lí',
    cauHoi: 'Vì sao chiếc thìa nhúng vào cốc nước trông như bị gãy?',
    loiGiai:
      'Ánh sáng truyền trong nước và trong không khí với tốc độ khác nhau, nên khi đi từ nước ra không khí, tia sáng bị đổi hướng ở mặt nước: đó là hiện tượng khúc xạ ánh sáng. Mắt ta luôn hiểu ánh sáng đi theo đường thẳng, nên thấy ảnh của phần thìa dưới nước nằm cao hơn vị trí thật. Vì thế chiếc thìa trông như bị gãy ngay tại mặt nước.',
  },
  {
    mon: 'Vật Lí',
    cauHoi: 'Vì sao mùa đông chạm tay vào thanh sắt thấy lạnh hơn chạm vào miếng gỗ, dù cả hai cùng nhiệt độ?',
    loiGiai:
      'Thanh sắt và miếng gỗ để cạnh nhau thì có cùng nhiệt độ, nhưng sắt dẫn nhiệt tốt hơn gỗ rất nhiều. Khi chạm vào, sắt lấy nhiệt từ tay ta đi rất nhanh, còn gỗ dẫn nhiệt kém nên tay mất nhiệt chậm. Da cảm nhận tốc độ mất nhiệt chứ không đo được nhiệt độ của vật, nên ta thấy sắt “lạnh hơn”.',
  },
  {
    mon: 'Vật Lí',
    cauHoi: 'Vì sao khi nhảy từ trên cao xuống, ta nên chạm đất bằng mũi chân và co gối lại?',
    loiGiai:
      'Khi chạm đất, động lượng của cơ thể phải giảm về 0. Co gối làm thời gian giảm tốc kéo dài hơn, mà lực tác dụng bằng độ biến thiên động lượng chia cho thời gian (F = Δp/Δt), nên lực mặt đất tác dụng lên chân nhỏ đi nhiều. Nhờ vậy xương khớp ít bị chấn thương; đệm nhảy và túi khí ô tô cũng hoạt động theo nguyên tắc này.',
  },
  {
    mon: 'Vật Lí',
    cauHoi: 'Vì sao không nên bơm lốp xe quá căng vào những ngày hè nắng nóng?',
    loiGiai:
      'Khi nhiệt độ tăng, các phân tử khí trong lốp chuyển động nhanh hơn, va chạm vào thành lốp mạnh và nhiều hơn, nên áp suất khí tăng lên. Lốp đã bơm quá căng, khi xe chạy lâu trên mặt đường nóng, áp suất tăng thêm có thể vượt quá sức chịu của lốp và làm nổ lốp.',
  },

  // ===== Hóa học =====
  {
    mon: 'Hóa học',
    cauHoi: 'Vì sao muối tan được trong nước còn dầu ăn thì không?',
    loiGiai:
      'Phân tử nước phân cực: đầu oxygen mang một phần điện tích âm, đầu hydrogen mang một phần điện tích dương. Muối ăn (NaCl) được tạo bởi các ion Na⁺ và Cl⁻; các phân tử nước bao quanh và kéo từng ion ra khỏi tinh thể nên muối tan. Dầu ăn gồm các phân tử gần như không phân cực, không hút được nước và cũng không chen được vào giữa các phân tử nước đang liên kết hydrogen với nhau, nên dầu nổi tách thành lớp riêng.',
  },
  {
    mon: 'Hóa học',
    cauHoi: 'Vì sao xà phòng tẩy được vết dầu mỡ?',
    loiGiai:
      'Phân tử xà phòng có hai phần: một đầu ưa nước (nhóm –COO⁻) và một đuôi hydrocarbon dài ưa dầu, kị nước. Khi giặt, đuôi ưa dầu cắm vào vết dầu mỡ, còn đầu ưa nước quay ra phía nước, bao vết dầu thành những hạt rất nhỏ lơ lửng trong nước. Nhờ vậy khi xả nước, dầu mỡ bị cuốn trôi theo.',
  },
  {
    mon: 'Hóa học',
    cauHoi: 'Vì sao táo cắt ra để một lúc thì mặt cắt chuyển sang màu nâu?',
    loiGiai:
      'Khi cắt, tế bào táo bị vỡ, enzyme trong táo tiếp xúc với oxygen của không khí và xúc tác phản ứng oxi hóa các hợp chất phenol thành những chất có màu nâu. Vắt chanh lên mặt cắt sẽ làm chậm quá trình này, vì acid trong chanh làm enzyme hoạt động kém đi, còn vitamin C là chất chống oxi hóa.',
  },
  {
    mon: 'Hóa học',
    cauHoi: 'Vì sao đồ vật bằng sắt để ở nơi ẩm ướt lại nhanh bị gỉ?',
    loiGiai:
      'Gỉ sắt là kết quả của sự ăn mòn: sắt bị oxi hóa khi tiếp xúc đồng thời với oxygen và nước, tạo thành gỉ có thành phần chính là iron(III) oxide ngậm nước. Không khí ẩm, nhất là có hơi muối như ở vùng gần biển, làm sắt gỉ nhanh hơn vì lớp nước chứa ion dẫn điện thúc đẩy ăn mòn điện hóa. Sơn, bôi dầu mỡ hay mạ kẽm giúp ngăn sắt tiếp xúc với nước và không khí.',
  },
  {
    mon: 'Hóa học',
    cauHoi: 'Vì sao cho bột nở (baking soda) vào thì bánh nở xốp?',
    loiGiai:
      'Bột nở là sodium hydrogencarbonate (NaHCO₃). Khi gặp nhiệt hoặc gặp acid có trong bột, nó phân hủy và giải phóng khí carbon dioxide (CO₂). Các bọt khí CO₂ bị giữ lại trong khối bột rồi giãn nở khi nóng lên, làm bánh xốp và mềm.',
  },
  {
    mon: 'Hóa học',
    cauHoi: 'Vì sao mở chai nước ngọt có ga thì nước sủi bọt?',
    loiGiai:
      'Nước ngọt có ga được nén khí CO₂ dưới áp suất cao rồi đóng kín. Độ tan của chất khí trong nước tăng khi áp suất tăng; khi mở nắp, áp suất phía trên giảm đột ngột nên lượng CO₂ đang hòa tan vượt quá mức có thể tan và thoát ra thành bọt. Chai nước ngọt để ấm sủi mạnh hơn chai để lạnh, vì chất khí tan kém hơn khi nhiệt độ tăng.',
  },
  {
    mon: 'Hóa học',
    cauHoi: 'Vì sao dùng giấm có thể tẩy được lớp cặn trắng trong ấm đun nước?',
    loiGiai:
      'Nước máy thường có ion Ca²⁺ và HCO₃⁻; khi đun sôi, chúng tạo thành calcium carbonate (CaCO₃) không tan, bám thành lớp cặn trắng. Giấm chứa acetic acid, phản ứng với CaCO₃ tạo ra muối tan, khí CO₂ và nước. Vì vậy ngâm giấm một lúc thì cặn bị hòa tan và rửa sạch dễ dàng.',
  },
  {
    mon: 'Hóa học',
    cauHoi: 'Vì sao pháo hoa có nhiều màu sắc khác nhau?',
    loiGiai:
      'Màu của pháo hoa đến từ các hợp chất kim loại trộn trong thuốc pháo. Khi bị đốt nóng, electron trong nguyên tử kim loại nhận năng lượng và chuyển lên mức năng lượng cao hơn, rồi khi trở về mức thấp sẽ phát ra ánh sáng có màu riêng của từng nguyên tố: strontium cho màu đỏ, sodium màu vàng, barium màu lục, copper màu xanh lam. Phòng thí nghiệm cũng dựa vào màu ngọn lửa để nhận biết kim loại.',
  },
  {
    mon: 'Hóa học',
    cauHoi: 'Vì sao lòng trắng trứng luộc chín thì đông lại và không thể trở lại dạng lỏng?',
    loiGiai:
      'Lòng trắng trứng chứa nhiều protein; mỗi phân tử là một chuỗi dài cuộn lại theo một hình dạng xác định. Khi đun nóng, các liên kết yếu giữ hình dạng đó bị phá vỡ, chuỗi protein duỗi ra rồi liên kết với nhau thành mạng lưới rắn, gọi là sự đông tụ protein. Quá trình này không thuận nghịch nên để nguội trứng cũng không lỏng lại được.',
  },
  {
    mon: 'Hóa học',
    cauHoi: 'Vì sao đốt than hoặc để máy phát điện chạy trong phòng kín rất nguy hiểm?',
    loiGiai:
      'Khi thiếu oxygen, nhiên liệu cháy không hoàn toàn và tạo ra khí carbon monoxide (CO), không màu, không mùi nên rất khó phát hiện. CO kết hợp với hemoglobin trong máu bền hơn oxygen khoảng 200 lần, làm máu không vận chuyển được oxygen đi nuôi cơ thể, gây ngộ độc và có thể tử vong. Vì vậy tuyệt đối không đốt than sưởi hay chạy máy phát điện trong phòng đóng kín.',
  },
]
