# Hướng dẫn sử dụng gen-chibi

> gen-chibi là **nhà máy asset chibi theo chủ đề**: từ một bộ khung chuẩn dựng nhân vật, vật phẩm, bối cảnh → cất vào thư viện theo dự án chủ đề → phát hành thành **gói bán**. **Làm phim** với AI đạo diễn là cách dùng asset — và là bản demo sống của bộ thư viện.
> © 2026 Gen Labs — All rights reserved · Tác giả: Ryan — 090.919.8823

## Nhanh nhất: 10 giây để thấy cả luồng
1. Mở gen-chibi (mặc định `http://localhost:7480`).
2. Ở màn **Chọn khu làm việc**, bấm **✨ Mở dự án mẫu "Văn phòng vui"**.
3. Bạn được đưa tới **Thư viện**: 3 nhân vật, 1 vật phẩm, 2 bối cảnh của dự án mẫu.
4. Mở **Tạo tác** → tác phẩm *Ngày đầu đi làm* (4 phân cảnh) → bấm **▶ Diễn toàn bộ**.
5. Bấm **Phim (HTML)** để tải phim về — mở tệp bằng trình duyệt bất kỳ là xem, gửi cho người xem.

Muốn thấy một **bộ chủ đề trọn vẹn** (thứ gen-chibi sinh ra để bán): bấm **🏯 Mở bộ chủ đề mẫu "Tam Quốc"** — 7 tướng (mặt nạ kinh kịch, binh khí, 8 hướng, giọng riêng), 13 trang bị, 8 bối cảnh và phim *Từ vườn đào tới Xích Bích* (6 phân cảnh có dàn dựng, giọng nói, âm thanh, một màn đấu võ). Đây là **bộ mẫu của Gen Labs**: xem, sửa thử, làm phim thoải mái, nhưng **không xuất gói bán** — muốn bán thì dựng bộ của bạn trong một dự án riêng.

## Ba khu — ba ứng dụng riêng

| Khu | Địa chỉ | Làm gì |
|---|---|---|
| **Xưởng** (hổ phách) | `/xuong` | Bộ khung chuẩn (không chủ đề), **Tạo asset mới** từ khung, bàn chỉnh, Trợ lý AI tạo asset |
| **Thư viện** (xanh dương) | `/thu-vien` | Asset đã qua cổng kiểm, **xếp theo dự án chủ đề** — xem, tải ảnh / sprite, chép mã, tải / nhập gói dự án |
| **Tạo tác** (xanh lá) | `/tao-tac` | **Tác phẩm**: chat với AI đạo diễn, kịch bản, phân cảnh, cảnh thành phẩm, sân khấu final, xuất phim |

Dòng chảy một chiều: **Xưởng → Thư viện → Tạo tác**. Thanh chuyển khu luôn ở góc trên bên trái.

## 1. Tạo dự án chủ đề (Thư viện)
**Thư viện › Dự án chủ đề › Dự án mới** — đặt tên (ví dụ "Tam Quốc", "Cổ tích Việt"). Mọi asset và tác phẩm thuộc một dự án; Studio nhớ dự án bạn dùng gần nhất.

## 2. Tạo asset từ khung (Xưởng › Tạo asset mới)
Bốn bước trên một trang:
1. **Chọn khung** — Nhân vật (ma-nơ-canh), Vật phẩm (10 khối theo dáng: que dài, que ngắn, đĩa, hộp, cầu, mũ, áo, choàng, giày, che mặt), Bối cảnh (sân khấu ngoài trời / trong nhà). Chọn dự án để lưu vào.
2. **Tham số & chi tiết** — tên, linh kiện từng bộ phận, độ dài / cỡ, bảng màu, mắt / mày, dấu nhận diện, tính cách (vật phẩm: loại, độ hiếm, chỉ số; bối cảnh: lớp phông, giờ, thời tiết, màu).
3. **Soát mọi góc** — nhân vật 8 hướng + 4 hoạt động; vật phẩm icon + thẻ + mặc lên ma-nơ-canh; bối cảnh ngày / đêm / có diễn viên.
4. **Cổng kiểm & lưu** — ✓ đạt, ✗ chặn (phải sửa), ⚠ chỉ cần khi **Phát hành** (bản nháp vẫn lưu và dùng được).

Lưu xong: **+ Tạo tiếp** (cùng khung, cùng dự án) · **Xem trong Thư viện** · **Làm phim với dự án này**.
Khung không bao giờ bị sửa — asset của bạn là bản sao của khung + tham số của bạn.

## 3. Làm phim (Tạo tác › Tác phẩm)
- **Tác phẩm mới**: đặt tên, chọn dự án.
- **Kịch bản lẻ**: agent ngoài gửi kịch bản qua MCP (`save_event`) → hiện ở khung *Kịch bản lẻ* → **+ Thành phân cảnh**.
- **AI đạo diễn** (cần API key ở *Cài đặt AI*): kể ý tưởng hoặc bấm nút nhanh *Viết kịch bản · Chia phân cảnh · Viết lời thoại · Kiểm thiếu*. AI chỉ dùng asset trong Thư viện; **thiếu nhân vật / bối cảnh thì AI tự vào Xưởng tạo** (đúng dự án, qua cổng kiểm) rồi mới dùng. Mỗi câu trả lời kèm nhật ký việc AI đã làm (✓ / ✗).
- **Không có AI vẫn làm được**: tự thêm phân cảnh, chọn bối cảnh, bấm chọn diễn viên (≤ 8), rồi *AI viết lời thoại* cho từng cảnh hoặc chỉnh JSON qua MCP.
- **Bảng bước** (không cần AI): ở mỗi phân cảnh bấm **Bảng bước** → một bảng kiểu bảng tính, mỗi hàng một bước (`B01`…, tối đa 12): diễn viên, biểu cảm, lời thoại, nói với ai, chỗ đứng, **hành động**, đối thủ, phản ứng, thời gian giữ.
  - Mọi ô chọn lấy từ lược đồ đạo diễn — không gõ tay được tên sai. Ô **Hành động** chỉ liệt kê đòn diễn viên của hàng đó làm được (người tay không không thấy "Đâm thẳng"), có nhãn *đòn đánh* / *ném* / *cần binh khí*.
  - Chọn đòn đánh thì ô **Đối thủ** mới mở (tự gợi ý một người); có đối thủ thì mới chọn **Phản ứng**. Ô **thêm…** mở các trường phụ: máy quay, bong bóng, hoạt động, góc nhìn, hướng, tư thế, di chuyển, động tác tay, hiệu ứng (≤ 3), âm thanh (≤ 3).
  - Lỗi hiện ngay cạnh hàng; **Lưu bước** khoá khi còn lỗi và đi qua đúng cổng kiểm như AI / MCP. Đóng bảng khi chưa lưu là bỏ thay đổi (có hỏi lại; đóng tab / tải lại trang trình duyệt cũng hỏi). Sửa tiếp trong lúc đang lưu thì phần mới vẫn báo *Chưa lưu*. Bấm ra ngoài bảng đóng được, nhưng kéo bôi chữ rồi nhả chuột ra ngoài thì không đóng; **Esc** đóng bảng, **Tab** xoay vòng trong bảng.
- **Tình trạng**: thanh "Sẵn sàng x/y phân cảnh" + danh sách cảnh còn thiếu gì — bấm để tới đúng phân cảnh.
- **Sân khấu final**: ▶ Diễn toàn bộ — phim có **dàn dựng tự động**:
  - nhân vật **đi ra sân**, **đi tới chỗ mới** khi kịch bản đổi chỗ đứng, **bước tới** khi giận / thề / van xin và **lùi lại** khi sốc / hoảng;
  - người nói **quay về người nghe**, khoa tay khi nói; người nghe gật gù, giật mình khi bị hét;
  - **máy quay** cận mặt người nói, khung hai người khi đối đáp, đẩy vào + rung khi hét, chớp trắng khi sốc;
  - **nhép miệng** theo lời; **lời thoại** trình bày gọn như phim: bong bóng truyện tranh — nói, **hét** (viền răng cưa nhỏ), **nghĩ** (đám mây), thì thầm (viền đứt nét) — thẻ tên màu nhân vật nằm trong bong bóng, một phông chữ (Be Vietnam Pro, dấu tiếng Việt đúng ở mọi máy, nhúng sẵn nên phim xuất ra vẫn đúng khi mở không mạng), chữ đọc được ngay, từ đang đọc có vệt sáng nhẹ;
  - **bong bóng không che mặt ai**: mỗi câu thoại, bộ phát đo vị trí đầu của mọi diễn viên trên khung hình (kể cả khi máy quay đang cận) rồi chọn chỗ không đè đầu — trên đầu, cạnh đầu, góc khung — gần miệng người nói; đuôi chỉ về phía miệng nhưng dừng cách mặt một đoạn và không cắt ngang đầu người khác. Cùng một người nói liên tiếp thì bong bóng giữ chỗ cũ, không nhảy. Cận cảnh quá chật không còn chỗ sạch thì câu đó hiện thành **phụ đề dải dưới** (thẻ tên màu nhân vật + chữ trắng trên nền tối mờ);
  - ô **Lời thoại** cạnh nút âm thanh (Sân khấu final): *tự động* (bong bóng khi có chỗ sạch, không thì phụ đề — mặc định) · *bong bóng* (luôn bong bóng) · *phụ đề* (luôn phụ đề, hợp khi cần đọc nhanh hoặc quay video). Nhớ theo máy; **phim HTML xuất ra mang kiểu đang chọn** làm mặc định và người xem tự đổi được bằng ô cùng tên trên thanh điều khiển. Hệ điều hành bật "giảm chuyển động" thì bong bóng không nảy;
  - **âm thanh**: hiệu ứng theo cảm xúc / hành động, nền theo bối cảnh (chim, dế, mưa, gió), nhạc nhẹ theo không khí, **giọng riêng từng nhân vật**.
  - Nút 🔊 bật / tắt tiếng; chọn giọng: *tự động* (máy đọc tiếng Việt nếu trình duyệt có, không thì giọng blip), *máy đọc*, *blip kiểu game*, *tắt*.
  - Muốn chỉ đạo kỹ hơn: mỗi câu thoại có thể đặt `to` (nói với ai), `camera` (close / two / wide), `bubble` (say / shout / think / whisper), `sfx`; AI đạo diễn biết các trường này. Đổi `spot` giữa các câu để nhân vật đi lại.
  - **Hành động & đấu võ**: một bước kịch bản có thể là một màn biên đạo — `action` + `target` (người bị đánh) + `react` (`hit` trúng, `fall` ngã lộn rồi bật dậy, `ko` ngã choáng, `block` gạt đỡ, `dodge` lộn ra sau né).
    - **Đòn của khung** (ai cũng dùng được): `punch` đấm (vào mặt), `kick` đá, `push` đẩy mặt, `throw` ném cà chua từ xa; cần cầm binh khí: `thrust` đâm, `sweep` quét; một mình: `rage`, `hero`, `victory`, `dance`, `salute`, `wave`, `stretch`, `scratch`, `startle`, `flip`.
    - **Đòn của gói động tác** trong dự án (vd. bộ Tam Quốc: `combo` liên hoàn, `spin` xoay chém, `leap` tung người bổ, `twirl` múa thương).
    - Nhân vật **có binh khí** khi tay phải cầm trang bị loại *Vũ khí* (hoặc linh kiện khai `grip: weapon`). Ai không có thì đòn binh khí bị chặn kèm gợi ý đòn làm được; quạt, sách… là đạo cụ.
    - Người ra đòn tự áp sát / lùi cho đòn chạm đúng; hai đầu không chồng nhau; không lộn / văng đè lên người đứng xem; đối thủ phản ứng đúng khung va chạm. `say` để `""` nếu chỉ ra đòn.
    - Viết bằng **AI đạo diễn**, qua MCP, hoặc ngay trong Studio bằng **Bảng bước** (ở trên). Thanh **Sẵn sàng** báo nếu một đòn không có (thiếu gói động tác) hoặc diễn viên không làm được.
    - Máy đang giữ bộ Tam Quốc cũ? Ở **Thư viện › Dự án chủ đề**, bấm **⟳ Cập nhật Tam Quốc** để nhập bản mới (có gói động tác).

### Xuất thành phẩm
| Nút | Ra gì |
|---|---|
| **Phim (HTML)** | Một tệp .html tự chứa (bộ phát + nhân vật + bối cảnh + lời thoại). Mở bằng trình duyệt, không cần cài, không cần mạng. Có danh sách phân cảnh, toàn màn hình, phím cách để xem / dừng. Bộ phát bên trong thuộc Gen Labs — giấy phép **chỉ để xem phim đó** (ghi trong tệp) |
| **Storyboard SVG / PNG** | Bảng phân cảnh: ảnh từng cảnh + mô tả + lời thoại — để duyệt, in, gửi khách |
| **JSON** | Kịch bản + phân cảnh dạng dữ liệu |

## 4. Nháp, Phát hành và gói dự án — sao lưu, chuyển máy, bán bộ asset theo chủ đề
Mỗi asset có một trong hai trạng thái:

| Trạng thái | Nghĩa | Ai đặt |
|---|---|---|
| **Nháp** | Dùng ngay trong dự án (diễn, làm phim, xuất ảnh). Không cần dấu nhận diện | Mặc định — mọi asset mới, kể cả AI tự tạo |
| **Phát hành** | Đủ chất lượng để **bán / chia sẻ**: vào *Gói bán* của dự án. Nhân vật phải có dấu nhận diện (cổng kiểm báo nếu thiếu) | Bạn bấm **Phát hành** ở khu *Dùng* của asset trong Thư viện (bấm **Về nháp** để rút lại) |

Ở **Thư viện › Dự án chủ đề**, chọn một dự án:
- **Gói sao lưu (JSON)** — mọi asset (cả nháp) + linh kiện / phông tự vẽ đang dùng + **tác phẩm** + gói động tác mà phim dùng (kể cả của dự án khác). Để sao lưu, chuyển máy.
- **Gói bán · N asset phát hành** — chỉ asset **Phát hành**, **không** kèm tác phẩm. Nếu asset phát hành cần một thứ còn nháp (ví dụ nhân vật cầm vật phẩm nháp), gói vẫn kéo theo cho đủ và **báo cảnh báo** — phát hành nốt thứ đó trước khi bán.
- **Nhập gói…** — mọi mục đi qua đúng cổng kiểm như khi tạo mới. Trùng id thì hỏi lưu đè — lưu đè tạo **phiên bản mới**, bản cũ vẫn trong lịch sử. Gói khai báo thư viện cần có (`requires.packs`); thiếu thì báo rõ.

### Giọng nhân vật
Thư viện › Nhân vật › khu **Dùng** › **Giọng**: kéo cao độ (trầm ↔ cao) và tốc độ (chậm ↔ nhanh), bấm **▶ Nghe thử**, **Lưu giọng** để dùng trong mọi phim. Chưa đặt thì gen-chibi tự chọn theo vai (tướng / sếp trầm hơn, lính / bé cao hơn).

## 5. Dùng asset ở nơi khác
Ở Thư viện, mỗi asset có khu **Dùng**: tải SVG / PNG / avatar / sprite biểu cảm / **sprite 8 hướng**, chép mã tham chiếu, mã gọi MCP, mã nhúng web, JSON công thức.
Mã tham chiếu có dạng `<thư viện>/<id>`: khung chuẩn là `gen.khung/…` và `gen.core/…`, asset của bạn là `local.my/…`. Tên cũ `afi.khung/…`, `afi.core/…` (trước v0.12) vẫn đọc được và được tự đổi sang tên mới khi lưu.

### Động tác — xem trước và tải hoạt ảnh một đòn
**Thư viện › Động tác** liệt kê đòn của bộ khung và của từng **gói động tác** (theo dự án, có nhãn Nháp / Phát hành / Bộ mẫu).
- Chọn một đòn → chọn **người ra đòn** (nhân vật không làm được bị mờ, ghi lý do — vd. *— cần binh khí* với đòn `thrust`; đang chọn sẵn một người không làm được thì báo vì sao và không dựng), **đối thủ** và **phản ứng** → xem trước ngay, dừng / chạy, 8 · 12 · 24 khung/giây.
  - Đòn dài (vd. gói tự viết có clip nhiều giây) cần nhiều khung hơn mức cho phép (120) thì Studio **tự hạ fps** cho đủ cả đòn và ghi rõ *"tự hạ còn N fps"*; GIF / JSON theo đúng fps thật đó. Dài tới mức ngay cả 4 fps cũng không đủ thì hiện cảnh báo *bị cắt phần cuối* — rút ngắn clip.
- **Tải hoạt ảnh**: **PNG sprite sheet**, **GIF** (lặp mãi, nền trong suốt), **SVG sheet** (vectơ), **JSON timeline** (`gen-chibi.anim/1`: fps, số khung, khung va chạm, toạ độ từng khung trong sheet). Chọn **Cỡ khung khi tải**. Khung cố định ôm trọn cả đòn nên các khung không giật cỡ — dùng thẳng cho game, web, sticker chat.
- **Tải gói (.json)** / **Nhập gói động tác (.json)**: gói đi qua cổng kiểm (lỗi hiện đủ danh sách). Ô **Nhập vào dự án** (cạnh nút nhập; mặc định là dự án bạn vừa dùng) quyết định gói mới thuộc dự án nào — để *Chưa xếp dự án* thì giữ dự án ghi trong tệp, tệp không ghi thì gói là **gói chung**, dùng được với mọi dàn diễn viên. Gói động tác cũng nằm trong gói sao lưu / gói bán của dự án; gói của bộ mẫu Gen Labs không xuất bán (tệp tải về từ bộ mẫu mang dấu `sample`, JSON hoạt ảnh ghi giấy phép bộ mẫu: chỉ để xem, thử, quay phim).
- Agent: cùng việc đó qua MCP `render_action` (xem `agent/workflows/animation.md`).

## 6. Cho agent AI (MCP) — agent của hãng nào cũng dùng được
- Chạy **`genchibi agent connect`**: in sẵn cấu hình nối cho Claude Code, Claude app, Cursor, Gemini CLI, Codex CLI và lệnh `curl` (không in token ra màn hình).
- Muốn agent "thuộc bài" từ đầu: **`genchibi agent skill claude`** (hoặc `cursor`, `gemini`, `codex`, `generic`) — cài hướng dẫn thành skill / `AGENTS.md` / `GEMINI.md` vào thư mục bạn đang đứng (hoặc `--dir`). Đã có `AGENTS.md` / `GEMINI.md` của riêng bạn thì lệnh dừng lại, không ghi đè (thêm `--force` nếu muốn thay).
- Dặn agent: **"gọi `start_here` trước"**. Agent sẽ nhận trạng thái Thư viện, 10 luật vàng, 9 chủ đề hướng dẫn (nhân vật, linh kiện, trang bị, cảnh, gói động tác, hoạt ảnh, phim, gói dự án, hệ thống), rồi làm theo từng bước có ví dụ chạy được.
- 45 tool; agent đi qua **cùng cổng kiểm** với Studio. Lỗi trả về có mã (`[VALIDATION_FAILED]`, `NOT_FOUND`…) và chỉ đúng trường sai — agent tự sửa được.
- Agent không có MCP client vẫn dùng được qua HTTP thuần (xem `agent/GUIDE.md` mục 1).

## Câu hỏi thường gặp
- **AI tự tạo asset có cần duyệt không?** Không — lưu dạng **nháp** trong dự án của tác phẩm và dùng ngay. Chỉ khi muốn đưa vào gói bán bạn mới bấm **Phát hành**.
- **Phim HTML gửi đi có lộ engine không?** Bộ phát nằm trong tệp phim với giấy phép **chỉ để xem phim đó**. Bản SaaS sau này sẽ chuyển sang trình phát do Gen Labs lưu trữ hoặc xuất video.
- **Lỡ sửa hỏng?** Mọi asset và tác phẩm có phiên bản; bản cũ nằm trong thư mục dữ liệu (`versions/`).
- **Hiệu năng?** Mỗi sân khấu tối đa 8 diễn viên sống; ảnh tĩnh được cache; hết phân cảnh là huỷ diễn viên.
