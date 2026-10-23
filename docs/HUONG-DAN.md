# Hướng dẫn sử dụng gen-chibi

[English](USER-GUIDE.md) | **Tiếng Việt**

> gen-chibi là **nhà máy asset chibi theo chủ đề**: từ một bộ khung chuẩn dựng nhân vật, vật phẩm, bối cảnh → cất vào thư viện theo dự án chủ đề → phát hành thành **gói bán**. **Làm phim** với AI đạo diễn là cách dùng asset — và là bản demo sống của bộ thư viện.
> © 2026 Gen Labs — All rights reserved · Tác giả: Ryan — 090.919.8823

## Lần chạy đầu: tài khoản chủ và thiết lập (v0.23)

1. **Cài xong, đọc dòng cuối của trình cài.** Trên máy chưa lên mạng, dòng đó in một link — `http://localhost:7480/login#k=<khoá>` — mở link đó và đăng nhập **admin / admin** trong vòng 30 phút. **admin / admin chỉ dùng được qua link đó từ máy chủ** (`genchibi open` in và mở link mới). Qua SSH thì chuyển cổng trước: `ssh -L 7480:localhost:7480 <máy-chủ>`.
2. **admin / admin chỉ dùng được khi đủ tất cả các điều sau** — thiếu điều nào thì trang đăng nhập nói đúng lý do và cách vào:
   - chưa có tài khoản chủ;
   - một lệnh trên máy chủ đã mở cửa sổ 30 phút (trình cài, `genchibi start`, `genchibi open` — Studio không bao giờ mở được);
   - trang được mở bằng **đúng link lệnh đó in ra**: link mang khoá dùng một lần từ `run/admin-window` (0600), nên user khác hay container khác trên cùng máy không đăng nhập `admin / admin` được (khoá không bao giờ vào dòng lệnh; trang xoá khoá khỏi thanh địa chỉ, chỉ giữ cho đúng tab đó);
   - máy chưa lên mạng (không Go online, không `GC_PUBLIC_URL` / `GC_ALLOWED_HOSTS`, không edge Caddy, không tunnel);
   - app chỉ nghe trên máy này (native: loopback; Docker: CLI đã kiểm compose chỉ publish ở 127.0.0.1);
   - trình duyệt mở bằng `localhost` / `127.0.0.1` / `[::1]` và không có proxy ở giữa.
3. **Tạo tài khoản chủ** (màn duy nhất phiên admin thấy; phiên dài 30 phút, không nhớ thiết bị): tên đăng nhập (3–32 ký tự, không phải `admin`), tên hiển thị, email (tuỳ chọn — chỉ dùng làm email liên hệ Let's Encrypt cho đường Caddy; đổi ở *Hệ thống › Tài khoản chủ*), mật khẩu ×2 (ít nhất 12 ký tự). Xong bước này, `admin / admin` mất hẳn.
4. **Bước 2 · Tên miền:** *Đưa lên mạng* chạy đúng các bậc của *Hệ thống › Lên mạng*; *Chỉ dùng trên máy này* bỏ qua. Một bậc Internet đỏ hoặc chờ lâu: *Tạm dùng trên máy này* cho bạn vào; trang chủ khi đó hiện dải *Lên mạng chưa xong* tới khi xong.
5. **Bước 3 · Chẩn đoán MCP:** tự kiểm thật chạy ngay (MCP-01 HTTP `/mcp`, MCP-02 token chủ, MCP-03 cầu stdio của chính app — chạy trong app, ở Docker là trong container). **MCP-04** là đúng lệnh agent sẽ chạy trên máy chủ, `<đường đầy đủ>/genchibi mcp`: `genchibi setup check` chạy thật (initialize + tools/list) rồi báo về đây; `genchibi start` / `open` cũng tự chạy. Thẻ nối dùng đường đầy đủ đó, vì ứng dụng mở từ Dock / menu không thấy `PATH` của terminal. Bên dưới là các thẻ nối (Claude Code, claude.ai, agent khác dạng JSON) — cùng các thẻ ở *Hệ thống › Kết nối agent*. Ô kiểm thật chuyển ✓ khi một agent gọi MCP lần đầu; lúc đó *Xong* mở. *Tôi nối agent sau* cũng kết thúc (trang chủ nhắc tới khi có agent nối).

Tới khi thiết lập xong, Studio chỉ hiện *Thiết lập lần đầu*, *Lên mạng* và *Tài khoản chủ*; đăng nhập lại thì về đúng bước đang dở. Agent và CLI dùng token chủ vẫn chạy ở mọi bước (`genchibi mcp` dùng được ngay sau khi cài). Lên mạng cần có tài khoản chủ (bị từ chối khi máy còn chỉ có `admin / admin`). Lối thoát chỉ trên máy chủ: `genchibi setup` (trạng thái), `genchibi setup skip [lý do]` (có ghi log — khi chính phần kiểm bị lỗi), `genchibi setup reset` (làm lại wizard; không bao giờ mở lại `admin / admin`).

**Cài thẳng lên tên miền** (`--domain` / `--cloudflare`): trình cài hỏi trước tên đăng nhập và mật khẩu chủ (nhập ẩn), hoặc đọc `GC_OWNER_USER` / `GC_OWNER_PASSWORD` khi không có terminal — không bao giờ ghi vào `.env`, dòng lệnh hay log. Không có thì không lên mạng và in các lệnh cần chạy tiếp.

**Nâng cấp từ v0.22:** mật khẩu cũ vẫn dùng với tên đăng nhập `owner`; dải *Kiểm tra thiết lập* hiện một lần, mở tự kiểm MCP và các thẻ nối.

**Ai làm được gì (v0.23):**

| Ai | Bằng gì | Được gì |
|---|---|---|
| admin | `admin / admin` qua link của máy chủ (khoá dùng một lần), chỉ khi đủ các điều trên | chỉ màn tạo tài khoản chủ (30 phút) |
| Chủ (phiên) | tên đăng nhập + mật khẩu ở `/login` | Studio — trong lúc thiết lập chỉ ba trang thiết lập; không bao giờ `/mcp` |
| Token chủ | `Authorization: Bearer` (CLI, `genchibi mcp`, agent trên máy này) | mọi API và `/mcp` ở mọi bước; `genchibi setup skip / reset` |
| Agent OAuth | `https://tên-miền/mcp`, chủ bấm *Cấp phép* | `/mcp` trong phạm vi đã chọn (`mcp:read` · `mcp:write` · `mcp:owner`) |
| Link có khoá | `https://tên-miền/mcp/<khoá>` (agent cũ) | `/mcp`, như `mcp:write` |

## Nhanh nhất: 10 giây để thấy cả luồng
1. Mở gen-chibi (mặc định `http://localhost:7480`).
2. Ở màn **Chọn khu làm việc**, bấm **✨ Mở dự án mẫu "Văn phòng vui"**.
3. Bạn được đưa tới **Thư viện**: 3 nhân vật, 1 vật phẩm, 2 bối cảnh của dự án mẫu.
4. Mở **Tạo tác** → bảng tác phẩm → bấm hàng *Ngày đầu đi làm* (4 phân cảnh) để vào **phòng làm phim** của nó → tab **Xem & duyệt** → **▶ Cả phim**.
5. Sang tab **Xuất bản** → **Phim (HTML)** để tải phim về — mở tệp bằng trình duyệt bất kỳ là xem, gửi cho người xem.

Lời thoại của dự án mẫu là tiếng Việt. Bản tiếng Anh cùng câu chuyện (*Fun Office*) mở một chạm ở **Thư viện › Dự án chủ đề** → **✨ Fun Office (mẫu tiếng Anh)**; hai bản cài cạnh nhau được.

Muốn thấy một **bộ chủ đề trọn vẹn** (thứ gen-chibi sinh ra để bán): bấm **🏯 Mở bộ chủ đề mẫu "Tam Quốc"** — 7 tướng (mặt nạ kinh kịch, binh khí, 8 hướng, giọng riêng), 13 trang bị, 8 bối cảnh và phim *Từ vườn đào tới Xích Bích* (6 phân cảnh có dàn dựng, giọng nói, âm thanh, một màn đấu võ). Đây là **bộ mẫu của Gen Labs**: xem, sửa thử, làm phim thoải mái, nhưng **không xuất gói bán** — muốn bán thì dựng bộ của bạn trong một dự án riêng.

## Ba khu — ba ứng dụng riêng

| Khu | Địa chỉ | Làm gì |
|---|---|---|
| **Xưởng** (hổ phách) | `/xuong` | **Bộ khung chuẩn** (không chủ đề, Gen Labs giữ), **Tạo asset mới** từ khung, bàn chỉnh nhân vật / vật phẩm / bối cảnh |
| **Thư viện** (xanh dương) | `/thu-vien` | Asset đã qua cổng kiểm, **xếp theo dự án chủ đề** — xem, tải ảnh / sprite, chép mã, tải / nhập gói dự án; thêm **Động tác**, **Âm thanh**, **Giọng** (bảng, nghe ngay) |
| **Tạo tác** (xanh lá) | `/tao-tac` | **Tác phẩm**: bảng tác phẩm → **phòng làm phim** riêng cho từng tác phẩm (kịch bản · phân cảnh · xem & duyệt · giọng & âm thanh · xuất bản) |

Dòng chảy một chiều: **Xưởng → Thư viện → Tạo tác**. Thanh chuyển khu luôn ở góc trên bên trái.

## Trợ lý AI — một dock ở cột phải, có mặt ở mọi khu
Mọi việc nhờ AI (tạo asset, giải thích khung xương, tìm / ghép asset, làm phim) đều ở **một chatroom cột phải** (rộng mặc định 380 px) — không có trang chat riêng. Cần **API key LLM** ở *Cài đặt AI*; chưa có thì dock vẫn hiện, kèm lời nhắc và nút **Mở Cài đặt AI**.
- **Thu gọn / mở**: nút **Trợ lý AI** ở góc trên phải hoặc phím **Alt+J**; **kéo mép trái** của dock (hoặc bấm ← → khi mép đang chọn, giữ Shift cho bước lớn) để đổi độ rộng. Máy nhớ trạng thái + độ rộng. Màn hẹp hơn 1100 px thì dock thành **ngăn kéo phủ** bên phải.
- **Đổi vai theo khu**: *Xưởng* → nhân viên xưởng (tạo / sửa asset từ khung) · *Bộ khung* → giải thích khung, tạo asset từ khung, dựng **gói động tác / tư thế** trên khung xương (không bao giờ sửa khung gốc) · *Thư viện* → thủ thư (tìm, xem, ghép asset **đã có**; máy chủ từ chối tạo asset mới từ đầu ở đây — nhờ tạo thì AI mời sang Xưởng bằng một nút **Mở Xưởng**) · *Tạo tác* → **AI đạo diễn** của tác phẩm đang mở. Cùng một khung chat, cùng cách ghim / soi; bộ tool và chỉ dẫn đổi theo khu (đều đi qua đúng cổng kiểm như agent MCP).
- **Đang xem**: thanh trên cùng của dock ghi *Khu › Trang › đối tượng* (vd. *Tạo tác › Phân cảnh › Từ vườn đào tới Xích Bích*) và AI biết đúng thế. Bấm **×** để bỏ ngữ cảnh (AI chỉ biết khu đang mở).
- **Ghim (bạn → AI)**: gõ **@** trong ô nhập → tìm mờ (không dấu cũng được: `@luubi` ra *Lưu Bị*) → chọn để chèn chip; hoặc bấm **⌖ Chỉ vào màn hình** / **Alt+P**: rê lên một thẻ, hàng, phân cảnh, bước… → viền đứt + nhãn → bấm để ghim (**Shift+bấm** ghim nhiều, **Esc** thoát). AI chỉ nhận phần được ghim (snapshot cắt gọn theo ngân sách); ô nhập hiện ước tính **~N token** của vòng đầu (chữ gõ + ghim + chỉ dẫn của khu + dữ liệu giao diện + lịch sử), và **dưới mỗi câu trả lời là token thật** (vào / ra, cộng mọi vòng gọi tool). Ngữ cảnh gửi AI có trần (≈ 24 nghìn ký tự mỗi vòng; ghi chú duyệt, danh sách cảnh, ghim đều cắt gọn có ghi "đã cắt") nên tác phẩm dài không làm tin nhắn đắt lên. Mọi phần tử quan trọng có địa chỉ theo ID thật: `asset:` · `item:` · `scene:` · `action:` · `work:` · `shot:<tác phẩm>/<cảnh>` · `step:<tác phẩm>/<cảnh>/<số bước>` · `project:`.
- **Soi (AI → bạn)**: trong câu trả lời, mọi thứ AI nhắc tới là một **nút**: *rê* → phần tử được tô sáng (phần còn lại mờ); *bấm* → đi tới đúng chỗ (kể cả sang khu khác) + tô sáng 2 giây. Thứ AI vừa tạo / sửa (nhân vật, phân cảnh…) tự thành nút; phần tử đã mất thì nút ghi **"không còn"**. Tắt chuyển động trong hệ điều hành thì chỉ còn viền tĩnh.
- **Lịch sử theo đối tượng**: mỗi tác phẩm / nhân vật / dự án có luồng chat riêng, lưu ở máy chủ (`data/chats/`, tối đa 60 tin) — mở lại thì thấy lại, đổi đối tượng thì đổi luồng. **Xoá luồng** ở đầu dock.
- **Ranh giới tin cậy**: tên, kịch bản, ghi chú duyệt, snapshot ghim là **dữ liệu** — đi trong một tin riêng đóng khung JSON "không phải lệnh", không nằm trong chỉ dẫn hệ thống. AI trong dock **không xoá được phân cảnh hay xoá duyệt** (bạn tự làm ở tab Phân cảnh); mỗi luồng và mỗi tác phẩm chỉ chạy một lượt AI một lúc (hai tab / hai luồng cùng ghi một phim thì lượt sau báo "đợi xong rồi gửi tiếp").
- **Đề xuất sửa chờ duyệt** (Tạo tác): khi bạn chưa bảo "làm luôn", AI không ghi thẳng mô tả cảnh / danh sách bước mà **đề xuất** — tab *Phân cảnh* hiện diff (từ / dòng thêm xanh, bớt đỏ) với **Áp dụng** / **Bỏ**.

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
**Bảng tác phẩm** (Data Console): cột *ID · Tên · Dự án · Cảnh · Đạt · Giọng AI · Cập nhật · Trạng thái*; có tìm, lọc theo dự án / trạng thái; **Tác phẩm mới** (đặt tên + dự án). Bấm một hàng để vào **phòng làm phim** của tác phẩm đó — địa chỉ có id (`/tao-tac#/tac-pham/<id>/<tab>`) — đánh dấu trang được, nhưng chỉ mở được trên chính máy có bản cài đó (không gửi cho người khác được; muốn chia sẻ thì xuất gói dự án). **Trợ lý AI ở cột phải luôn là AI đạo diễn của tác phẩm đang mở**, biết bạn đang ở tab nào và cảnh nào.
Phòng có 5 tab:
1. **Kịch bản** — logline, kịch bản tổng, **dàn nhân vật** (mọi diễn viên của các phân cảnh, vai giọng, giọng AI đã chốt), **ngôn ngữ phim**.
2. **Phân cảnh** — mỗi cảnh một thẻ: **ảnh khung đầu**, tên, mô tả, bối cảnh, dàn diễn viên, số bước, **thời lượng ước tính**, *Xem bước* (mở danh sách bước), **Bảng bước**, *AI viết lời thoại*, *Diễn thử*, *Hỏi AI* (ghim cảnh vào dock). Mọi thứ AI đạo diễn viết ra hiện ở đây; đề xuất sửa chưa áp thì hiện **diff** với Áp dụng / Bỏ.
3. **Xem & duyệt** — sân khấu: **▶ Cả phim** và **▶ Cảnh** ở từng hàng; mỗi cảnh có trạng thái **Nháp / Cần sửa / Đạt** + **ghi chú duyệt** (gắn cả cảnh hoặc một bước), lưu vào tác phẩm (`work.review`) qua cổng kiểm của máy chủ; **Gửi AI sửa theo ghi chú** ghim cảnh + bước vào dock và soạn sẵn câu nhờ sửa. Số **Đạt x/y** hiện ở đầu phòng và ở bảng tác phẩm. Cảnh sửa sau khi "Đạt" tự về "Nháp". **Chỉ bạn đặt "Đạt"** (trong Studio): AI ở cột phải và agent qua MCP / link chỉ đặt Nháp / Cần sửa và **thêm** ghi chú (mang nhãn AI / agent) — máy chủ chặn, không chỉ là lời dặn; AI cũng không xoá hay sửa ghi chú của bạn. Agent đọc ghi chú duyệt qua MCP `get_work › review`.
4. **Giọng & âm thanh** — ngôn ngữ + giọng vùng, **Lồng tiếng AI**, **MỘT bảng "Giọng chốt theo nhân vật"** và ô **Âm thanh**: kết quả chấm luật ghép S1–S7 của cả tác phẩm (lỗi / cảnh báo, bấm để tới cảnh). Bảng giọng chốt là **nơi duy nhất chốt giọng cho một tác phẩm**: mỗi hàng một nhân vật → **vai giọng** → **giọng chốt** (`work.voices`) · **nguồn** (*Đã chốt* / *Chọn tay* / *Chưa chốt*) · giọng vùng · số câu thoại · câu mẫu, **▶ giọng máy** (miễn phí) và **▶ AI** dùng đúng giọng đã chốt (clip có sẵn nghe miễn phí; chưa có thì bấm 2 lần, tốn 1 lượt); chưa chốt thì nút AI mờ. Nút **Chốt giọng cả dàn (miễn phí)** nhờ máy chủ chọn giọng cho cả dàn và chốt vào tác phẩm (không đọc câu nào). Bảng theo **ngôn ngữ phim** ở ô trên; bấm một hàng để xem chi tiết ở khung bên phải. Muốn nghe / thiết kế bộ 22 vai: nút **Bộ giọng vai ›** → *Thư viện › Giọng*.
5. **Xuất bản** — **Phim (HTML)**, **Xuất video** (MP4 / WebM + phụ đề + ảnh bìa), Storyboard SVG / PNG, JSON, gói dự án.

Chi tiết từng phần:
- **Tác phẩm mới**: đặt tên, chọn dự án.
- **Kịch bản lẻ**: agent ngoài gửi kịch bản qua MCP (`save_event`) → hiện ở khung *Kịch bản lẻ* → **+ Thành phân cảnh**.
- **AI đạo diễn** (dock bên phải; cần API key ở *Cài đặt AI*): kể ý tưởng hoặc bấm nút nhanh *Viết kịch bản · Chia phân cảnh · Viết lời thoại · Sửa theo ghi chú duyệt · Kiểm thiếu*. AI chỉ dùng asset trong Thư viện; **thiếu nhân vật / bối cảnh thì AI tự vào Xưởng tạo** (đúng dự án, qua cổng kiểm) rồi mới dùng. Mỗi câu trả lời kèm nhật ký việc AI đã làm (✓ / ✗).
- **Không có AI vẫn làm được**: tự thêm phân cảnh, chọn bối cảnh, bấm chọn diễn viên (≤ 8), rồi *AI viết lời thoại* cho từng cảnh hoặc chỉnh JSON qua MCP.
- **Bảng bước** (không cần AI): ở mỗi phân cảnh bấm **Bảng bước** → một bảng kiểu bảng tính, mỗi hàng một bước (`B01`…, tối đa 12): diễn viên, biểu cảm, lời thoại, nói với ai, chỗ đứng, **hành động**, đối thủ, phản ứng, thời gian giữ.
  - Mọi ô chọn lấy từ lược đồ đạo diễn — không gõ tay được tên sai. Ô **Hành động** chỉ liệt kê đòn diễn viên của hàng đó làm được (người tay không không thấy "Đâm thẳng"), có nhãn *đòn đánh* / *ném* / *cần binh khí*.
  - Chọn đòn đánh thì ô **Đối thủ** mới mở (tự gợi ý một người); có đối thủ thì mới chọn **Phản ứng**. Ô **thêm…** mở các trường phụ: máy quay, bong bóng, hoạt động, góc nhìn, hướng, tư thế, di chuyển, động tác tay, hiệu ứng (≤ 3), âm thanh (≤ 3).
  - Lỗi hiện ngay cạnh hàng; **Lưu bước** khoá khi còn lỗi và đi qua đúng cổng kiểm như AI / MCP. Đóng bảng khi chưa lưu là bỏ thay đổi (có hỏi lại; đóng tab / tải lại trang trình duyệt cũng hỏi). Sửa tiếp trong lúc đang lưu thì phần mới vẫn báo *Chưa lưu*. Bấm ra ngoài bảng đóng được, nhưng kéo bôi chữ rồi nhả chuột ra ngoài thì không đóng; **Esc** đóng bảng, **Tab** xoay vòng trong bảng.
- **Tình trạng**: thanh "Sẵn sàng x/y phân cảnh" + danh sách cảnh còn thiếu gì — bấm để tới đúng phân cảnh.
- **Xem & duyệt**: ▶ Cả phim — phim có **dàn dựng tự động**:
  - nhân vật **đi ra sân**, **đi tới chỗ mới** khi kịch bản đổi chỗ đứng, **bước tới** khi giận / thề / van xin và **lùi lại** khi sốc / hoảng;
  - người nói **quay về người nghe**, khoa tay khi nói; người nghe gật gù, giật mình khi bị hét;
  - **máy quay** cận mặt người nói, khung hai người khi đối đáp, đẩy vào + rung khi hét, chớp trắng khi sốc;
  - **nhép miệng** theo lời; **lời thoại** trình bày gọn như phim: bong bóng truyện tranh — nói, **hét** (viền răng cưa nhỏ), **nghĩ** (đám mây), thì thầm (viền đứt nét) — thẻ tên màu nhân vật nằm trong bong bóng, một phông chữ (Be Vietnam Pro, dấu tiếng Việt đúng ở mọi máy, nhúng sẵn nên phim xuất ra vẫn đúng khi mở không mạng), chữ đọc được ngay, từ đang đọc có vệt sáng nhẹ;
  - **bong bóng không che mặt ai**: mỗi câu thoại, bộ phát đo vị trí đầu của mọi diễn viên trên khung hình (kể cả khi máy quay đang cận) rồi chọn chỗ không đè đầu — trên đầu, cạnh đầu, góc khung — gần miệng người nói; đuôi chỉ về phía miệng nhưng dừng cách mặt một đoạn và không cắt ngang đầu người khác. Cùng một người nói liên tiếp thì bong bóng giữ chỗ cũ, không nhảy. Cận cảnh quá chật không còn chỗ sạch thì câu đó hiện thành **phụ đề dải dưới** (thẻ tên màu nhân vật + chữ trắng trên nền tối mờ);
  - ô **Lời thoại** cạnh nút âm thanh (tab Xem & duyệt): *tự động* (bong bóng khi có chỗ sạch, không thì phụ đề — mặc định) · *bong bóng* (luôn bong bóng) · *phụ đề* (luôn phụ đề, hợp khi cần đọc nhanh hoặc quay video). Nhớ theo máy; **phim HTML xuất ra mang kiểu đang chọn** làm mặc định và người xem tự đổi được bằng ô cùng tên trên thanh điều khiển. Hệ điều hành bật "giảm chuyển động" thì bong bóng không nảy;
  - **âm thanh**: hiệu ứng theo cảm xúc / hành động, nền theo bối cảnh (chim, dế, mưa, gió), nhạc nhẹ theo không khí, **giọng riêng từng nhân vật**.
  - Nút 🔊 bật / tắt tiếng; chọn giọng: *tự động* (giọng AI đã lồng tiếng nếu có, không thì máy đọc đúng ngôn ngữ + giới của vai, không có thì blip), *AI Google* (đọc bằng giọng AI ngay khi diễn — tốn lượt), *máy đọc*, *blip kiểu game*, *tắt*. Ô **Âm thanh** (bật / tắt tiếng, kiểu giọng, kiểu lời thoại) nằm cạnh sân khấu ở tab *Xem & duyệt*; **Ngôn ngữ · Giọng vùng · Lồng tiếng** ở tab *Giọng & âm thanh*; **Xuất** ở tab *Xuất bản*. Xem mục **Giọng AI theo vai** ngay dưới.
  - Muốn chỉ đạo kỹ hơn: mỗi câu thoại có thể đặt `to` (nói với ai), `camera` (close / two / wide), `bubble` (say / shout / think / whisper), `sfx`; AI đạo diễn biết các trường này. Đổi `spot` giữa các câu để nhân vật đi lại.
  - **Hành động & đấu võ**: một bước kịch bản có thể là một màn biên đạo — `action` + `target` (người bị đánh) + `react` (`hit` trúng, `fall` ngã lộn rồi bật dậy, `ko` ngã choáng, `block` gạt đỡ, `dodge` lộn ra sau né).
    - **Đòn của khung** (ai cũng dùng được): `punch` đấm (vào mặt), `kick` đá, `push` đẩy mặt, `throw` ném cà chua từ xa; cần cầm binh khí: `weaponThrust` đâm, `sweep` quét; một mình: `stompRage`, `hero`, `joyHop`, `dance`, `fistSalute`, `waveHello`, `stretch`, `scratch`, `startle`, `flip`. (v0.23: id đòn không trùng tên hoạt động / trạng thái của kịch bản — id cũ `thrust` · `rage` · `victory` · `salute` · `wave` vẫn đọc được và tự chuyển sang id mới khi mở / lưu tác phẩm.)
    - **Đòn của gói động tác** trong dự án (vd. bộ Tam Quốc: `combo` liên hoàn, `spin` xoay chém, `leap` tung người bổ, `twirl` múa thương).
    - Nhân vật **có binh khí** khi tay phải cầm trang bị loại *Vũ khí* (hoặc linh kiện khai `grip: weapon`). Ai không có thì đòn binh khí bị chặn kèm gợi ý đòn làm được; quạt, sách… là đạo cụ.
    - Người ra đòn tự áp sát / lùi cho đòn chạm đúng; hai đầu không chồng nhau; không lộn / văng đè lên người đứng xem; đối thủ phản ứng đúng khung va chạm. `say` để `""` nếu chỉ ra đòn.
    - Viết bằng **AI đạo diễn**, qua MCP, hoặc ngay trong Studio bằng **Bảng bước** (ở trên). Thanh **Sẵn sàng** báo nếu một đòn không có (thiếu gói động tác) hoặc diễn viên không làm được.
    - Máy đang giữ bộ Tam Quốc cũ? Ở **Thư viện › Dự án chủ đề**, bấm **⟳ Cập nhật Tam Quốc** để nhập bản mới (có gói động tác).

### Giọng AI theo vai
Giọng theo **vai** (tuổi · giới · văn / võ · quyền quý · hài · phản diện · kể chuyện — 22 vai, có ông lão, bà lão, bé trai, bé gái, võ tướng, quân sư…) cho **tiếng Việt** (Bắc / Nam / Trung), **tiếng Anh** (Mỹ / Anh), **tiếng Trung** (phổ thông / Đài Loan), **tiếng Quảng Đông** (Hồng Kông). Lưu ý: giọng vùng đúng chất (Bắc / Trung / Nam, Đài Loan) **chỉ có qua Thiết kế giọng** — xem bullet *Giọng vùng thật* bên dưới.
- **Dán key là chạy**: *Cài đặt AI › Giọng AI (Google Gemini)* — dán key Google AI Studio vào ô duy nhất, bấm **Kết nối**; máy kiểm key (miễn phí) rồi **tự bật**. Đã dán key Gemini cho AI đạo diễn thì dùng được ngay, khỏi dán lại. Key chỉ nằm trên máy chủ, không hiện lại trong trình duyệt. Có nút **Tắt / Bật**. Trang này **chỉ giữ phần cài đặt**: key, Tắt / Bật, *Trần câu / ngày*, giọng tạm hỏng (nút *Thử lại giọng hỏng*), số câu đã dùng hôm nay (dòng trạng thái) và liên kết **Xem bộ giọng vai → Thư viện › Giọng** — không còn bảng 22 vai ở đây.
- **Bộ giọng vai** — chỉ ở **Thư viện › Giọng** (xem mục *Giọng — xem, nghe, thiết kế giọng theo vai* bên dưới): bảng 22 vai theo ngôn ngữ + giọng vùng đã chọn — giọng đang dùng và nguồn (*thiết kế* / *thư viện Google* / *có sẵn*), **▶** nghe giọng máy đọc (miễn phí), **AI** nghe một câu mẫu bằng giọng AI (**tốn 1 lượt** nếu chưa có clip), **Thiết kế giọng** (~25 giây, **tốn 1 lượt**; làm lại bằng *Thiết kế lại*). **Vai trẻ em** (bé trai, bé gái, thiếu niên, thiếu nữ) **không thiết kế được** — Google chặn giọng trẻ em; dùng giọng trẻ trung có sẵn. Giọng vùng chỉ có hiệu lực ở vai đã *Thiết kế giọng*; chưa thiết kế = giọng chung của ngôn ngữ.
- **Từng nhân vật**: *Thư viện › Nhân vật › Giọng* — vai giọng ("Tự đoán" nếu chưa chọn), giọng vùng, giọng AI (khi đã có key), cao độ + tốc độ. **Lưu giọng** chỉ ghi cao độ / tốc độ khi bạn đã kéo.
- **Ngôn ngữ phim** (ô *Ngôn ngữ* ở tab Giọng & âm thanh — hoặc *Ngôn ngữ lời thoại* ở tab Kịch bản; lưu vào tác phẩm. Tác phẩm mới lấy ngôn ngữ giao diện lúc tạo — Studio tiếng Anh thì phim tiếng Anh; tác phẩm do agent tạo theo mặc định của máy; tác phẩm làm trước v0.20 là tiếng Việt): giọng máy đọc, giọng AI và lồng tiếng đọc theo ngôn ngữ này — lời thoại phải viết đúng ngôn ngữ đó (tiếng Quảng Đông: chữ phồn thể + khẩu ngữ như 喺 / 咩 / 我哋, không dùng văn phổ thông). Mỗi nhân vật một giọng AI khác nhau.
- **Giọng của nhân vật được chốt theo tác phẩm**: lần đầu máy chọn giọng AI cho dàn diễn viên của một tác phẩm (theo ngôn ngữ + giọng vùng), giọng đó được **chốt** vào tác phẩm — Studio, agent (MCP `render_voice` kèm `work`) và phim xuất dùng cùng một giọng. Thêm diễn viên mới, hay Google thêm giọng mới, **không đổi** giọng người cũ; giọng chỉ đổi khi bạn chủ động (Thiết kế giọng cho vai, hoặc chọn giọng AI ở Hồ sơ nhân vật). Xem và chốt ở phòng tác phẩm › tab **Giọng & âm thanh** › bảng *Giọng chốt theo nhân vật* (nút **Chốt giọng cả dàn (miễn phí)**). Một tác phẩm chọn giọng AI cho tối đa **48 diễn viên**; người thừa chưa có giọng AI — Studio báo một dòng "N diễn viên vượt 48 chưa có giọng AI" ở khối *Lồng tiếng*, câu của họ dùng giọng máy đọc.
- **Giọng vùng thật chỉ qua Thiết kế giọng**: Google chỉ cho giọng Bắc / Trung / Nam, Đài Loan… đúng chất khi *Thiết kế giọng* từng vai (mỗi vai 1 lượt, ~25 giây); giọng có sẵn và thư viện giọng tiếng Việt của Google **không phân** Bắc / Trung / Nam nên đọc giọng chung (riêng *Anh Anh* có thư viện giọng riêng). Ở tab **Giọng & âm thanh**, dòng *Giọng vùng* (dưới ô Ngôn ngữ) hiện **"giọng vùng có ở N/M vai (đã thiết kế)"** — M là số vai khác nhau trong dàn diễn viên của tác phẩm (vai trẻ em không tính vì không thiết kế được), N là số vai đã thiết kế cho đúng ngôn ngữ + giọng vùng của phim. Nút **Thiết kế giọng vùng cho các vai** thiết kế cùng lúc các vai còn thiếu: bấm xong hiện hộp xác nhận ngay trong trang ghi số vai ≈ số lượt Google và ~25 giây mỗi vai; bạn bấm *Bắt đầu thiết kế* thì mới chạy — lần lượt từng vai, có thanh tiến độ và nút *Dừng thiết kế*; hết lượt (hoặc chạm trần ngày) thì dừng đúng chỗ và báo giờ thử lại; xong thì giọng cả dàn được chọn lại. gen-chibi không bao giờ tự thiết kế ngầm.
- **Trần câu / ngày** (Cài đặt AI › Giọng AI): ô *Trần câu / ngày* — mặc định **200**, `0` = không giới hạn, tối đa 5000. Đủ trần thì máy chủ không đọc mới (cũng không thiết kế thêm) tới 00:00 hôm sau, mọi đường qua máy chủ đều bị chặn; Studio báo **"Đã chạm trần N câu hôm nay (Cài đặt AI)"** — khác với "Hết lượt hôm nay" (Google hết lượt) và "Google giới hạn mỗi phút". Câu đã đọc rồi vẫn phát lại miễn phí. Dòng trạng thái hiện **"hôm nay N / trần câu"**. Trần để giữ chi phí trong tầm tay nếu project Google của bạn đã bật thanh toán.
- **Giọng tạm hỏng**: khi Google báo riêng một giọng không dùng được, gen-chibi tránh giọng đó **24 giờ** rồi tự thử lại (giọng dựng sẵn không bị đánh dấu vì lỗi chung của Google). Cài đặt AI hiện **"M giọng tạm hỏng (tự thử lại sau 24 h)"** kèm nút **Thử lại giọng hỏng** để thử lại ngay; kết nối lại key cũng gỡ dấu.
- **Lồng tiếng AI** (tab Giọng & âm thanh): đọc lần lượt mọi câu và **lưu lại** ("Lồng tiếng AI 7/31"); câu đã đọc thì nhanh, không tốn lượt. Google **giới hạn mỗi phút** (giờ thử lại cách ≤ 2 phút) thì **không dừng**: hiện "Google giới hạn mỗi phút — tự lồng tiếp lúc HH:MM:SS", chờ rồi đọc tiếp đúng câu đó (tối đa 10 lần chờ mỗi lượt bấm; **Dừng lồng tiếng** huỷ cả lúc chờ). **Hết lượt hôm nay** (hoặc chạm trần câu / ngày) thì dừng, báo giờ thử lại + số câu đã xong — bấm lại sau để đọc tiếp. Chưa có key: nút mờ, kèm lối tới *Cài đặt AI*.
- **Phát và xuất phim**: kiểu giọng *tự động* chỉ dùng giọng AI **đã lồng** (không tốn lượt); *AI Google* đọc ngay khi diễn. **Phim HTML** nhúng sẵn giọng AI của các câu đã lồng (toast "N/M câu có giọng AI" + cỡ tệp), mở bằng `file://` không gọi mạng — còn câu chưa có giọng AI thì bấm **Phim (HTML)** sẽ hỏi trước: **Lồng tiếng rồi xuất** · **Xuất luôn** (câu thiếu đọc bằng giọng máy / blip) · **Huỷ**. Phim chưa đủ clip hiện nhãn **"Giọng AI 19/31"** cạnh ô Giọng. Thẻ ngôn ngữ của trang phim (`<html lang>`) đặt theo ngôn ngữ phim (vi · en · zh-CN · zh-TW · zh-HK).
- **Gói miễn phí của Google rất ít lượt mỗi ngày** (cỡ vài chục câu); câu đã đọc lưu đệm nên không tốn lại. Bật thanh toán ở Google AI Studio là quyết định của chủ máy — gen-chibi không tự bật.
- **Giọng trình duyệt dự phòng**: không key, hết lượt, tắt giọng AI hay clip lỗi thì phim vẫn chạy bằng giọng máy đọc của trình duyệt, đúng ngôn ngữ + giới của vai (không có giọng đúng ngôn ngữ thì dùng blip, không đọc sai tiếng). Giọng máy chia hai hạng — **cơ bản** (espeak, giọng Microsoft đời cũ, giọng đùa của macOS…) và **tốt** (mọi giọng còn lại: Edge "Online / Natural", Google, Apple Linh, Google TTS trên Android…). Phim đã có giọng AI mà để robot đọc lẫn vào thì nghe giật cục, nên ở kiểu giọng *tự động* câu thiếu clip chỉ đọc bằng giọng máy hạng **tốt**, không có thì dùng blip; chọn hẳn *Máy đọc* thì không lọc hạng giọng. Giọng máy bị kẹt (không lên tiếng sau ~1,5 giây) thì thử lại một lần — trình duyệt báo đang nạp giọng thì chờ tới 4 giây — vẫn không được thì chuyển sang blip, và 30 giây sau mới thử lại giọng máy (mọi kiểu giọng); dấu "…" và "—" được đổi thành dấu phẩy khi đưa cho giọng máy (chữ trên màn hình giữ nguyên).

### Xuất thành phẩm (tab Xuất bản)
| Nút | Ra gì |
|---|---|
| **Phim (HTML)** | Một tệp .html tự chứa (bộ phát + nhân vật + bối cảnh + lời thoại + **giọng AI đã lồng tiếng**). Mở bằng trình duyệt, không cần cài, không cần mạng. Có danh sách phân cảnh, toàn màn hình, phím cách để xem / dừng. Bộ phát bên trong thuộc Gen Labs — giấy phép **chỉ để xem phim đó** (ghi trong tệp) |
| **Xuất video** | Tệp video đăng YouTube / TikTok (**MP4** hoặc **WebM**) + phụ đề `.srt` + ảnh bìa `.jpg` + tệp `.txt` gồm tiêu đề, mô tả và dòng ghi công — xem mục [Xuất video](#xuất-video) bên dưới |
| **Storyboard SVG / PNG** | Bảng phân cảnh: ảnh từng cảnh + mô tả + lời thoại — để duyệt, in, gửi khách |
| **JSON** | Kịch bản + phân cảnh + ghi chú duyệt dạng dữ liệu |
| **Gói dự án (.json)** | Gói sao lưu cả dự án của tác phẩm (asset + tác phẩm kèm ghi chú duyệt + gói động tác + gói âm) — nhập lại ở máy khác |

### Xuất video
**Xuất bản › Xuất video** biến tác phẩm thành một tệp video đăng thẳng lên YouTube hay TikTok, không phải đổi định dạng. Việc này chạy **ngay trong trình duyệt của bạn** — không tải gì lên đâu cả.

- **Trình duyệt**: Chrome hoặc Edge trên máy tính. Studio phải mở qua **https** hoặc **localhost** (`http://127.0.0.1:7480` được; `http://<IP-LAN>:7480` thì không — trình duyệt chỉ cho mã hoá video ở trang an toàn). Firefox và Safari chưa hỗ trợ. App dò thật xem trình duyệt *này* làm được gì; thiếu thứ gì thì nút bị khoá và lý do ghi ngay cạnh (ví dụ "Mở Studio qua https hoặc localhost để xuất video.").
- **Cùng câu hỏi với phim HTML**: còn câu chưa có giọng AI thì hỏi trước — **Lồng tiếng rồi xuất** · **Xuất luôn** · **Huỷ**. Trong video, câu chưa có giọng AI **im lặng**; bong bóng / phụ đề của câu đó vẫn hiện (giọng máy đọc của trình duyệt không ghi được vào tệp). Giọng AI đang tắt thì mọi câu đều im lặng.
- **Tuỳ chọn**: khung **Ngang 16:9** hoặc **Dọc 9:16** (cho TikTok / Shorts — khung dọc thật: máy quay tự bám người đang nói, bong bóng và phụ đề xếp lại cho vừa khung; tác phẩm nhớ lựa chọn này); chất lượng **1080p** (mặc định) hoặc **720p**. Bảng báo trước định dạng trình duyệt này sẽ ra, độ dài, thời gian và dung lượng ước tính, cùng trần độ dài.
- **Định dạng**: **MP4** (H.264 + AAC) nếu trình duyệt mã hoá được (Chrome / Edge trên Windows, macOS); không thì **WebM** (VP9 + Opus) — ví dụ Chrome / Chromium trên Linux. YouTube và TikTok nhận cả hai. Có cả hai thì bạn chọn được.
- **Thời gian**: khoảng **2–3,5 lần độ dài phim** (phim 1 phút mất 2–3,5 phút; 1080p và phim đông nhân vật ở mức chậm). **Giữ tab ở phía trước** trong lúc xuất — trình duyệt làm chậm tab bị ẩn; tab từng bị ẩn thì bảng báo.
- **Trần độ dài**: MP4 giữ cả tệp trong bộ nhớ tới khi xong nên trần **5 phút ở 1080p**, **10 phút ở 720p**; WebM ghi dần ra tệp, trần **15 phút** ở cả hai chất lượng (tiếng của cả phim vẫn dựng trong bộ nhớ). Phim vượt trần bị chặn ngay từ đầu, kèm gợi ý (720p hoặc WebM).
- **Bắt đầu**: trình duyệt hỏi **thư mục lưu** ngay lúc bấm Bắt đầu, 4 tệp vào đó (`<tên>.mp4|webm`, `.srt`, `.jpg`, `.txt`; trùng tên thì thêm `-2`, `-3`…). Trình duyệt không cho chọn thư mục thì tải về từng tệp khi xong. **Huỷ** dừng ngay, không để lại tệp dở.
- **Xong**: có trình **Xem thử**, danh sách tệp và ảnh bìa. Ảnh bìa là khung có thoại đầu tiên; **Chọn khung khác** cho chọn bất kỳ khung nào của bản xem thử và thay tệp bìa.
- **Video làm từ bộ mẫu**: video làm từ bộ mẫu Gen Labs (Văn phòng vui, Tam Quốc) đăng công khai được — giữ dòng ghi công **"Made with gen-chibi · Gen Labs"** có sẵn trong tệp mô tả `.txt` (điều khoản bộ mẫu: xem, thử, làm phim; được đăng phim / video làm từ bộ mẫu kèm dòng ghi công đó; không bán lại, không phân phối lại tệp hay asset của bộ mẫu).
- **Agent AI (MCP)** chưa xuất được video ở bản này — chỉ chủ, từ Studio.

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
Thư viện › Nhân vật › khu **Dùng** › **Giọng**: chọn **vai giọng** và giọng vùng, kéo cao độ (trầm ↔ cao) và tốc độ (chậm ↔ nhanh), bấm **▶ Nghe thử**, **Lưu giọng** để dùng trong mọi phim. Chưa đặt thì gen-chibi tự đoán vai (tướng / sếp trầm hơn, lính / bé cao hơn). Chi tiết giọng AI: mục **Giọng AI theo vai** ở phần Làm phim.

## 5. Dùng asset ở nơi khác
Ở Thư viện, mỗi asset có khu **Dùng**: tải SVG / PNG / avatar / sprite biểu cảm / **sprite 8 hướng**, chép mã tham chiếu, mã gọi MCP, mã nhúng web, JSON công thức.
Mã tham chiếu có dạng `<thư viện>/<id>`: khung chuẩn là `gen.khung/…` và `gen.core/…`, asset của bạn là `local.my/…`. Tên cũ `afi.khung/…`, `afi.core/…` (trước v0.12) vẫn đọc được và được tự đổi sang tên mới khi lưu.

### Động tác — xem trước và tải hoạt ảnh một đòn
**Thư viện › Động tác** liệt kê đòn của bộ khung và của từng **gói động tác** (theo dự án, có nhãn Nháp / Phát hành / Bộ mẫu).
- Chọn một đòn → chọn **người ra đòn** (nhân vật không làm được bị mờ, ghi lý do — vd. *— cần binh khí* với đòn `weaponThrust`; đang chọn sẵn một người không làm được thì báo vì sao và không dựng), **đối thủ** và **phản ứng** → xem trước ngay, dừng / chạy, 8 · 12 · 24 khung/giây.
  - Đòn dài (vd. gói tự viết có clip nhiều giây) cần nhiều khung hơn mức cho phép (120) thì Studio **tự hạ fps** cho đủ cả đòn và ghi rõ *"tự hạ còn N fps"*; GIF / JSON theo đúng fps thật đó. Dài tới mức ngay cả 4 fps cũng không đủ thì hiện cảnh báo *bị cắt phần cuối* — rút ngắn clip.
- **Tải hoạt ảnh**: **PNG sprite sheet**, **GIF** (lặp mãi, nền trong suốt), **SVG sheet** (vectơ), **JSON timeline** (`gen-chibi.anim/1`: fps, số khung, khung va chạm, toạ độ từng khung trong sheet). Chọn **Cỡ khung khi tải**. Khung cố định ôm trọn cả đòn nên các khung không giật cỡ — dùng thẳng cho game, web, sticker chat.
- **Tải gói (.json)** / **Nhập gói động tác (.json)**: gói đi qua cổng kiểm (lỗi hiện đủ danh sách). Ô **Nhập vào dự án** (cạnh nút nhập; mặc định là dự án bạn vừa dùng) quyết định gói mới thuộc dự án nào — để *Chưa xếp dự án* thì giữ dự án ghi trong tệp, tệp không ghi thì gói là **gói chung**, dùng được với mọi dàn diễn viên. Gói động tác cũng nằm trong gói sao lưu / gói bán của dự án; gói của bộ mẫu Gen Labs không xuất bán (tệp tải về từ bộ mẫu mang dấu `sample`, JSON hoạt ảnh ghi giấy phép bộ mẫu: xem, thử, làm phim; được đăng phim / video làm từ bộ mẫu kèm dòng ghi công "Made with gen-chibi · Gen Labs"; không bán lại, không phân phối lại tệp hay asset của bộ mẫu).
- Agent: cùng việc đó qua MCP `render_action` (xem `agent/workflows/animation.md`).

### Âm thanh — thư viện hiệu ứng kiểu hoạt hình, dùng lại được
Âm thanh trong phim là một **thư viện** (không phải tệp âm thanh): mỗi âm là một **công thức tổng hợp** bằng code — khoa trương như phim hoạt hình (BONK, BOING, ZIP, WHAM, SPLAT, TA-DA…): nhảy cao độ lớn, có nốt nhạc, đuôi rung, hơi "đồ chơi". Nhẹ, không bản quyền bên thứ ba, chạy cả khi mở phim HTML bằng `file://`.
- **Bộ chuẩn** (62 âm, 8 nhóm: *Va chạm & đánh · Di chuyển · Hài hước · Cảm xúc & nhấn · Phép & năng lượng · Thiên nhiên · Đồ vật & chuông · Nhạc cụ hiệu ứng*) có sẵn ở mọi dự án. 17 tên âm cũ (pop, whoosh, step, sting, hit, boing…) vẫn dùng được, chỉ là nghe khác — kịch bản cũ không phải sửa gì.
- **Gói âm của dự án**: mỗi dự án chủ đề thêm âm riêng (bộ mẫu Tam Quốc: *trống trận, tù và, vó ngựa, kiếm cổ, mưa tên, ngựa hí, bắn tên*). Âm của dự án nào chỉ dùng trong dự án đó. Gói âm **đi theo gói dự án** (sao lưu, nhập, gói bán — kèm cả gói âm mà tác phẩm hoặc gói động tác gọi tên, kể cả gói dùng chung / của dự án khác; gói bán báo nếu gói âm đó còn nháp) và **theo phim HTML xuất ra**. Quy tắc: mỗi dự án ≤ 32 gói âm (bằng trần khi nhập, nên sao lưu nào cũng nhập lại được) · gói **không có dự án** là gói *dùng chung* — thêm âm gọi được ở mọi dự án nhưng **không có cue** (không đổi được âm tự gán của khung) · bỏ một âm đang được gọi, hoặc đổi dự án của gói khi còn chỗ gọi, sẽ báo xung đột kèm danh sách từng chỗ (chủ máy mới ép được) · qua link MCP / AI chatroom gói phải thuộc một dự án và không ghi đè gói của dự án khác · **gỡ gói**: `DELETE /api/sound-packs/<id>` hoặc MCP `delete_sound_pack` (chỉ chủ máy; còn chỗ gọi thì báo xung đột, tệp vào thùng rác).
- Mỗi âm có nhãn, thẻ, thời lượng và câu **"dùng khi"**. **Thư viện › Âm thanh** (mô tả ngay dưới): lọc theo nhóm / thẻ / chữ / dự án, **▶ nghe thử**, **tải WAV** (cả một âm lẫn một "công thức ghép" nhiều âm) để dùng ở nơi khác.
- **Gán âm vào phim**: hầu hết bước **không cần chọn gì** — bộ phát tự gán tối đa 2 âm theo biểu cảm / hiệu ứng / hoạt động (gói của dự án thắng bộ chuẩn; cảnh hùng tráng hay hài có thể đổi lựa chọn). Chỉ chọn tay ở Bảng bước (**thêm… › Âm thanh**, tối đa 3 âm) khi muốn **nhấn** một khoảnh khắc; chọn `[]` (không âm nào) để bước im. **Đòn đánh** cứ để nguyên — âm va chạm tự phát đúng điểm đánh.
- **Luật ghép** (Studio và agent đều kiểm bằng cùng một bộ luật, ở `engine/sounds.js`): **lỗi** thì không lưu được, **cảnh báo** thì vẫn lưu và được báo lại.
  | Luật | Mức | Nội dung (nguyên văn `GC.sounds.RULES` — test 2n chặn lệch) |
  |---|---|---|
  | **S1** | lỗi | ≤ 3 âm mỗi bước; ≤ 1 âm NHẤN (nhóm cam-xuc / nhac-cu) mỗi bước — hai cú nhấn cùng lúc triệt tiêu nhau. |
  | **S2** | cảnh báo | Mật độ ≤ 4 âm trong 2 giây phim (kể cả âm tự gán và tiếng bật bong bóng thoại, không tính step / tick) — dày hơn là "ồn", khán giả mất điểm nhấn. |
  | **S3** | cảnh báo | Âm nhấn không đè câu thoại: đặt ở bước không có lời, hoặc chọn âm ngắn xong trước câu ≥ 0,3 s. |
  | **S4** | cảnh báo | Âm va chạm (nhóm danh) để động tác tự phát ở điểm đánh; đặt tay chỉ khi bước có cú va thấy được (attack, thrust, defend, kowtow, faint, jump, injured, dizzy). |
  | **S5** | cảnh báo | Cùng một âm không quá 3 bước liền (trừ step / tick) — đổi âm cùng nhóm hoặc bỏ. |
  | **S6** | lỗi | Âm phải có trong thư viện của dự án (khung + gói dùng chung + gói của dự án) — tên lạ / âm của dự án khác là lỗi, có gợi ý tên gần nhất. |
  | **S7** | cảnh báo | Âm dài > 2 s (gong, dun-dun, trống trận…) chỉ ở bước đầu / cuối cảnh (mở màn, chuyển cảnh). |
- **Công thức ghép mẫu** (đà → va → hậu quả, mỗi bước một âm): *rón rén → giẫm vỏ chuối → trượt ngã → bẹp → thất bại* (`tiptoe → slip → slide-down → splat → sad`) · *lấy đà → WHAM → ngã → chim bay vòng* · *loé ý tưởng → chạy biến* · *tích lực → biến hình → ta-da* · *bóp còi → ba-dum-tss*. Danh sách đầy đủ trong Thư viện › Âm thanh.
- **Thêm âm của riêng bạn**: nhờ agent (MCP `get_sound_spec` → `validate_sound_pack` → `save_sound_pack`, xem `agent/workflows/sound.md`) hoặc nhập gói `gen-chibi.sound/1` (.json). Gói đi qua cổng kiểm: chỉ nhận số + chuỗi trong danh sách cho phép (không mã), tối đa 60 node Web Audio mỗi âm. Tên âm là **chung toàn thư viện** — trùng tên thì báo rõ gói nào đang giữ tên. Bạn nghe thử rồi mới giữ: agent không nghe được, chỉ kiểm bằng cổng.

#### Thư viện › Âm thanh — bảng, luật ghép, gói
Bảng kiểu Data Console (desktop): mỗi hàng một âm — **ID âm** (tên dùng trong `step.sfx`), nhãn, nhóm, thời lượng, **"dùng khi"**, thẻ, gói (*Khung* / tên gói), dự án, **cảnh tự gán (cue)**. Bảng có **3 tab**:
- **Âm** — 8 nhóm bấm lọc (có số đếm), ô **tìm không dấu** (tên, nhãn, thẻ, câu "dùng khi": `dau` ra cả "đầu"), lọc **thẻ** / **gói** / **dự án** (chỉ hiện âm dự án đó dùng được — chính là luật S6), bấm tiêu đề cột để sắp xếp.
  - **▶ nghe ngay trên hàng**; bàn phím: `↑` `↓` (hoặc `J` `K`) đổi hàng, `Space` nghe hàng đang chọn, `/` nhảy vào ô tìm, `Esc` xoá ô tìm.
  - **Inspector bên phải** (400 px): nghe, **Tải WAV**, **Chép tên**, "dùng khi", thẻ (bấm để lọc), cảnh tự gán, và hộp **Dùng trong kịch bản**: *Bước kịch bản (JSON)* — một bước `{ actor, state, say | hold, sfx: ["tên"] }` chép dán được ngay (âm **nhấn** để ở bước không lời) — và *Gọi MCP* (`lint_sound_track` kèm `project` + cách tra `list_sounds` / `get_sound_pack`).
- **Luật ghép** — nơi duy nhất trong Studio nói **cách ghép âm**, lấy thẳng từ engine (`GC.sounds.RULES`, `RECIPES`, `guide()`) nên luôn khớp với agent: **quy trình 5 bước**, **bảy luật S1–S7** (mức *Lỗi* chặn lưu / *Cảnh báo* chỉ nhắc), **công thức ghép mẫu** — mỗi công thức có **▶ Nghe chuỗi**, **Tải WAV**, **Chép các bước** (mảng bước kịch bản) — và ô **Thử kiểm luật**: dán các bước JSON, chọn dự án, bấm **Kiểm S1–S7** để thấy lỗi / cảnh báo kèm vị trí, như `lint_sound_track`.
- **Gói âm** — danh sách gói (ID, tên, dự án, phiên bản, số âm, trạng thái), **Tải JSON** (gói người dùng / bộ mẫu), **Xem âm** của gói, **Gỡ gói** (chỉ gói của người dùng đã lưu trên máy — gói khung `gen.am` và gói của bộ mẫu không có nút; bấm **2 lần** mới gỡ). Gói còn được gọi ở đâu đó (bước kịch bản, gói động tác…) thì máy chủ từ chối và Studio hiện **danh sách các chỗ đang gọi** kèm **Vẫn gỡ** (các chỗ đó sẽ báo lỗi S6 / bị bỏ âm lúc nạp) hoặc **Giữ gói**; máy chủ cũ chưa có tính năng gỡ thì báo "Máy chủ chưa hỗ trợ gỡ gói". **Nhập gói**: chọn tệp `.json` hoặc dán JSON → **Kiểm gói (không lưu)** → **Nhập vào thư viện** (chọn dự án). Lỗi cổng kiểm hiện **kèm đường dẫn** (vd. `sounds.am-hong.layers[0].hz: ngoài khoảng…`); trùng tên âm với gói khác bị chặn ngay. Bản xem thử không có máy chủ thì chỉ kiểm được, chưa lưu được.

**Quy trình ghép âm cho người và agent** (cùng một bộ luật): ① để trống `sfx` ở phần lớn các bước — bộ phát tự gán ≤ 2 âm theo cue; ② chỉ đặt `sfx` khi muốn **nhấn** (≤ 3 âm, ≤ 1 âm nhấn, âm nhấn ở bước không lời); ③ cú va dùng `action`, không đặt tay; ④ hài: "đà → va → hậu quả" mỗi bước một âm (xem công thức); ⑤ kiểm S1–S7 (tab Luật ghép hoặc `lint_sound_track`) trước khi lưu. Agent: `list_sounds` → `get_sound_spec` → `lint_sound_track` (xem `agent/workflows/sound.md`).

### Giọng — xem, nghe, thiết kế giọng theo vai
**Thư viện › Giọng** là nơi **duy nhất** để **xem, nghe và thiết kế** bộ giọng vai (22 vai × ngôn ngữ / giọng vùng); dán key, Tắt / Bật và trần câu / ngày ở *Cài đặt AI › Giọng AI* (trang đó chỉ có liên kết sang đây). Giọng **chốt cho từng nhân vật của một tác phẩm** không ở đây mà ở **phòng làm phim** (Tạo tác › tác phẩm › tab *Giọng & âm thanh*). Thanh trên cùng chọn **ngôn ngữ + giọng vùng** (tiếng Việt Bắc / Nam / Trung · tiếng Anh Mỹ / Anh · tiếng Trung phổ thông / Đài Loan · tiếng Quảng Đông Hồng Kông), **dự án** (để biết nhân vật nào dùng vai), kiểu vai và ô tìm không dấu.
- **Bộ giọng vai**: 22 vai — ID vai, vai, nhóm tuổi, giới, văn / võ / quyền quý / hài…, **phong cách nói**, **thiết kế được?** (4 vai trẻ em: *Google chặn* theo chính sách an toàn), giọng AI sẽ dùng (cast), nhân vật trong dự án dùng vai đó, **câu mẫu** theo vai × ngôn ngữ (vd. ông lão: "Con à, đời người như chén trà…"; sửa ở hằng `VOICE_LINES` trong `studio/app.js`).
  - Mỗi hàng có **▶** *giọng máy* (trình duyệt, miễn phí) và **AI**: nếu clip mẫu **đã có** thì nghe ngay, **không tốn lượt**; chưa có thì nút thành **"Đọc AI · 1 lượt"** — bấm **2 lần** để xác nhận (lần đầu chỉ báo trước tốn lượt). Hết lượt thì hiện **giờ thử lại**.
  - **Inspector**: mô tả vai (phong cách nói, chân dung gửi Google, tuổi hợp vai, giọng dựng sẵn), câu mẫu + nghe, **giọng AI sẽ được chọn** ở ngôn ngữ / vùng đang chọn, **giọng đã thiết kế** (nếu có, nghe mẫu), nút **Thiết kế giọng cho vai này** (tốn 1 lượt, ~25 giây, bấm 2 lần; vai trẻ em mờ kèm lý do) và danh sách **nhân vật trong dự án đang dùng vai** (bấm để mở hồ sơ; *đã chọn* / *đoán*).
- **Giọng của tác phẩm → phòng làm phim**: Thư viện không chốt giọng cho tác phẩm (đó là việc của Tạo tác). Ở đây có cột **Nhân vật dùng vai** (nhân vật trong dự án đang lọc dùng vai đó) và nút **Chốt giọng cho tác phẩm › phòng làm phim** ở đầu trang: dự án có đúng một tác phẩm thì mở thẳng tab *Giọng & âm thanh* của nó, nhiều hơn thì tới danh sách tác phẩm của dự án.
- **Chưa có key Google**: vẫn xem và nghe được giọng máy; trang nhắc và có nút tới *Cài đặt AI › Giọng AI*. Bản xem thử (không máy chủ) chỉ có giọng máy.
## 6. Cho agent AI (MCP) — agent của hãng nào cũng dùng được
- Chạy **`genchibi agent connect`**: in sẵn cấu hình nối cho Claude Code, Claude app, Cursor, Gemini CLI, Codex CLI và lệnh `curl` (không in token ra màn hình). Từ v0.21 bản cài nào cũng có token chủ, nên agent trên máy này dùng HTTP phải gửi `Authorization: Bearer` — agent đã nối trước v0.21 mà không có token thì nối lại bằng các cấu hình này; `genchibi mcp` (stdio) tự đọc token.
- Muốn agent "thuộc bài" từ đầu: **`genchibi agent skill claude`** (hoặc `cursor`, `gemini`, `codex`, `generic`) — cài hướng dẫn thành skill / `AGENTS.md` / `GEMINI.md` vào thư mục bạn đang đứng (hoặc `--dir`). Đã có `AGENTS.md` / `GEMINI.md` của riêng bạn thì lệnh dừng lại, không ghi đè (thêm `--force` nếu muốn thay).
- Dặn agent: **"gọi `start_here` trước"**. Agent sẽ nhận trạng thái Thư viện, 11 luật vàng, 10 chủ đề hướng dẫn (nhân vật, linh kiện, trang bị, cảnh, gói động tác, âm thanh, hoạt ảnh, phim, gói dự án, hệ thống), rồi làm theo từng bước có ví dụ chạy được.
- 53 tool; agent đi qua **cùng cổng kiểm** với Studio. Lỗi trả về có mã (`[VALIDATION_FAILED]`, `NOT_FOUND`…) và chỉ đúng trường sai — agent tự sửa được.
- Agent không có MCP client vẫn dùng được qua HTTP thuần (xem `agent/GUIDE.md` mục 1).

### Ra Internet: tên miền, HTTPS và MCP một bước (beta, v0.21)
Đưa app lên `https://tên-miền` (Studio, sau mật khẩu chủ) và `https://tên-miền/mcp` (cho agent) mà không sửa `.env`, Caddyfile hay DNS bằng tay. *Beta:* đường A đã kiểm với Caddy thật (TLS nội bộ) trong Docker, đường B với Cloudflare API giả lập, link tạm với `cloudflared` giả lập — chưa chạy trên VPS hay tài khoản Cloudflare thật. Ở đường B còn hai việc có thể phải làm trong dashboard Cloudflare, mỗi việc là một bậc có hướng dẫn: luật WAF Skip khi token không có quyền WAF, và tắt *Bot Fight Mode* ở gói Free. Mở **Studio › Hệ thống › Lên mạng**, hoặc dùng `genchibi online` trên máy chủ — hai nơi chạy cùng các bậc và hiện từng bậc ✓ / ✗ kèm cách sửa.

1. **Chọn đường.** *VPS có IP công khai* (đường A): tạo bản ghi A `tên-miền → IP máy`, mở cổng 80 và 443, rồi `genchibi online caddy tên-miền` (Docker; edge Caddy lấy chứng chỉ HTTPS). *Máy nhà, sau router, hoặc 80/443 bận* (đường B): tên miền phải ở Cloudflare; tạo API token bằng link điền sẵn mà app đưa (Account › Cloudflare Tunnel › Edit, Zone › DNS › Edit, Zone › Zone › Read, tuỳ chọn Zone › WAF › Edit; TTL ngắn), rồi `genchibi online cloudflare tên-miền` và dán token khi được hỏi (ẩn; không có terminal: `GC_CF_TOKEN`, không bao giờ là đối số). *Đã có reverse proxy riêng:* `genchibi online proxy tên-miền` in đoạn cấu hình để dán. *Chỉ thử:* `genchibi online quick` cho link tạm `*.trycloudflare.com`.
2. **Theo dõi từng bậc.** Tên miền / DNS, edge, cổng, chứng chỉ, địa chỉ công khai, **MCP từ Internet** (thử bằng agent `Claude-User` của claude.ai, nên Cloudflare chặn bot sẽ lộ ra ở đây). Bậc ✗ in cách sửa; sửa xong chạy `genchibi online recheck` (hoặc bấm *Kiểm lại*).
3. **Tài khoản chủ trước.** Lên mạng bị từ chối tới khi có tài khoản chủ (màn lần đầu, hoặc `genchibi password` trên máy chủ) — mật khẩu không bao giờ được đặt qua địa chỉ công khai.
4. **Xong:** lệnh in `https://tên-miền` và `https://tên-miền/mcp`. Đọc tiếp bên dưới để nối claude.ai.

Làm hết lúc cài cũng được: `--domain tên-miền` (đường A) hoặc `--domain tên-miền --cloudflare` (đường B) — xem [README › Ra Internet](../README.vi.md#ra-internet-tên-miền-https-mcp-một-bước). Thôi ra Internet: `genchibi online off` (có `GC_CF_TOKEN` thì app dọn cả tunnel, bản ghi DNS và luật WAF nó đã tạo). Máy cấu hình tay trước v0.21 (`GC_PUBLIC_URL` / `GC_ALLOWED_HOSTS` trong `.env`) vẫn chạy; `genchibi online migrate` chuyển sang Go online.

**Sao lưu và khôi phục.** Bản sao lưu (`genchibi backup`) chứa tài khoản chủ (mật khẩu đã băm) và các phiên Studio. `genchibi restore` giữ tài khoản đó, đăng xuất mọi phiên và thiết bị, thu hồi mọi kết nối OAuth (agent nối lại và chủ duyệt lại), và tắt Go online trên máy này (mã bản cài mới, tunnel dừng) — khôi phục xong thì chạy lại Go online. Hai bản sao lưu trong cùng một giây không còn đè nhau. **Trang đăng nhập riêng đứng trước app:** chỉ chặn đường của người và để `/login`, `/oauth/authorize` của app đi qua sau lớp đăng nhập của bạn (`/setup` của v0.21 / v0.22 nay chuyển về `/login`); đường máy vẫn mở.

### Nối claude.ai bằng một địa chỉ `https://tên-miền/mcp` (OAuth, từ v0.19)
Agent tự tìm cách đăng nhập, tự đăng ký, còn bạn chỉ cần bấm **Cấp phép** một lần trên trang web của app. Không phải chép khoá hay dán token vào agent.

1. **Ra Internet trước** (mục ở trên): Go online đặt địa chỉ công khai và kiểm các đường máy từ ngoài vào. Máy còn cấu hình tay trong `.env` (`GC_PUBLIC_URL` đúng địa chỉ Internet, không `/` ở cuối, không cổng; `GC_ALLOWED_HOSTS`) vẫn chạy.
2. **Tự đặt proxy (Caddy, nginx…) thì mở các đường cho máy**, xem *Đứng sau proxy và trang đăng nhập riêng* bên dưới.
3. **Thêm connector trên claude.ai:** vào *Customize › Connectors › Add custom connector*, dán `https://tên-miền/mcp`, bấm **Add**, rồi bấm **Connect**. Để trống *Advanced settings*: không nhập Client ID / Secret, app tự đăng ký.
4. **Cấp phép.** Trình duyệt mở trang **Cấp phép kết nối agent** của app. Xem tên agent và **địa chỉ nó sẽ quay về** (phải là `claude.ai` hoặc `claude.com`), chọn mức quyền, rồi bấm **Cấp phép**. Trình duyệt này đã đăng nhập Studio (mật khẩu chủ) thì trang dùng phiên đó; chưa thì trang mời đăng nhập (máy dùng token chủ vẫn dùng token được).
5. **Mở một phiên mới** trên claude.ai hoặc Claude Code: tool gen-chibi sẽ xuất hiện. Phiên đang mở không tự nạp connector mới.

| Mức quyền | Agent làm được |
|---|---|
| **Chỉ xem** (`mcp:read`) | Đọc thư viện, tác phẩm, kiểm công thức, dựng ảnh xem thử. Không lưu gì. |
| **Tạo và sửa** (`mcp:write`, mặc định) | Tạo và sửa nhân vật, vật phẩm, cảnh, tác phẩm trong dự án. Không tốn lượt giọng AI, không gỡ gói âm, không cập nhật app hay quay lại bản cũ (chặt hơn link có khoá cũ một bậc: link cũ vẫn cập nhật được app). |
| **Toàn quyền chủ máy** (`mcp:owner`) | Giống token chủ máy: thêm giọng AI (tốn lượt), gỡ gói âm, cập nhật hoặc quay lại bản cũ. Chỉ cấp cho agent bạn tin hoàn toàn. |

- **Quản lý ở Studio › Hệ thống › Kết nối agent:** xem agent nào đang nối, mức quyền và lần dùng cuối. Bấm **Thu hồi** thì agent mất quyền ngay, kể cả token làm mới. Muốn đổi mức thì bấm **Đổi phạm vi** trên hàng của agent (có hiệu lực ngay).
- **Token:** dùng được 1 giờ và tự làm mới. Không dùng 30 ngày thì hết hạn. App chỉ lưu bản băm trong `data/oauth.json`.
- **Claude Code CLI:** chạy `claude mcp add --transport http gen-chibi https://tên-miền/mcp`, rồi gõ `/mcp` trong Claude Code và chọn **Authenticate**. Trang Cấp phép sẽ mở trong trình duyệt.
- **Link có khoá cũ** (`/mcp/<khoá>`) vẫn chạy như trước, dành cho agent không hỗ trợ OAuth.

#### Đứng sau proxy và trang đăng nhập riêng
claude.ai gọi các đường dưới đây **từ máy chủ của Anthropic**, nên không có cookie đăng nhập của bạn. Các đường này phải đi **thẳng** tới app, và chúng vẫn được khoá bằng token OAuth của chính app:

`/mcp` · `/.well-known/oauth-protected-resource…` · `/.well-known/oauth-authorization-server` · `/oauth/register` · `/oauth/token` · `/oauth/revoke`

Nếu có trang đăng nhập riêng trước app (forward_auth, Authelia, basic auth…), đặt nó **bên trong một `handle`**. Đừng đặt ở cấp site: khi đó nó chạy cho cả `/mcp`, Claude nhận trang đăng nhập (302 / 401 của cổng) thay vì câu trả lời "chỉ đường" của app, và connector báo không kết nối được. Trang Cấp phép (`/oauth/authorize`, `/api/oauth/approve`) cứ để sau cổng đăng nhập: bạn đăng nhập trước rồi bấm Cấp phép, app vẫn hỏi token chủ máy.

Mẫu đầy đủ có chú thích nằm ở `docs/Caddyfile.oauth.example`. Bản rút gọn:

```caddy
tên-miền {
	@machine path /mcp /mcp/* /.well-known/oauth-protected-resource* /.well-known/oauth-authorization-server* /oauth/register /oauth/token /oauth/revoke
	handle @machine {
		reverse_proxy 127.0.0.1:7480
	}
	handle {
		# cổng đăng nhập riêng của bạn (forward_auth …) đặt ở đây
		reverse_proxy 127.0.0.1:7480
	}
}
```

- **Mạng:** dùng cổng 443. Tên miền phải có bản ghi A (IPv4 công khai). Không chuyển hướng `tên-miền` ↔ `www.tên-miền`, vì chuyển hướng làm rơi header `Authorization`.
- **Cloudflare:** *Bot Fight Mode*, *Block AI bots* và *AI Crawl Control* trả 403 cho agent `Claude-User`. Đường B của Go online tự tạo luật WAF **Skip** cho các đường máy khi token có quyền *Zone › WAF › Edit* (không có thì in luật để bạn thêm); Bot Fight Mode gói Free không skip được bằng luật — hãy tắt nó. Tự cấu hình: tạo luật Skip cho dải IP của Anthropic `160.79.104.0/21`, hoặc tắt các tính năng đó cho các đường máy ở trên.
- **Cloudflare + giới hạn tốc độ:** app giới hạn đăng ký / thử sai theo IP khách. Mặc định chỉ đọc mục cuối của `X-Forwarded-For` (và chỉ khi kết nối tới app đến từ loopback hoặc mạng riêng). Đứng sau Cloudflare thì thêm `GC_CLIENT_IP_HEADER=cf-connecting-ip` vào `.env` (hoặc `x-real-ip`) để app thấy IP thật của khách thay vì IP của proxy.
- **Tự thêm service vào Docker** (Caddy, trang đăng nhập…): ghi vào `docker-compose.override.yml` cạnh `docker-compose.yml`. Docker Compose tự gộp hai file, còn `genchibi update` không bao giờ đụng tới file override.

## Câu hỏi thường gặp
- **AI tự tạo asset có cần duyệt không?** Không — lưu dạng **nháp** trong dự án của tác phẩm và dùng ngay. Chỉ khi muốn đưa vào gói bán bạn mới bấm **Phát hành**.
- **Phim HTML gửi đi có lộ engine không?** Bộ phát nằm trong tệp phim với giấy phép **chỉ để xem phim đó**. Muốn chia sẻ mà không kèm bộ phát thì dùng **Xuất video** (v0.22); bản SaaS sau này còn có trình phát do Gen Labs lưu trữ.
- **Lỡ sửa hỏng?** Mọi asset và tác phẩm có phiên bản; bản cũ nằm trong thư mục dữ liệu (`versions/`).
- **Bấm Cập nhật báo "yêu cầu từ nguồn lạ bị chặn"?** Máy chủ chỉ nhận lệnh thay đổi từ chính trang Studio của nó. Câu báo (từ v0.18.1) ghi rõ *trang đang mở ở đâu* và *máy chủ nhận địa chỉ nào*: mở lại Studio bằng đúng địa chỉ máy chủ (thường là `http://127.0.0.1:7480`), hoặc cập nhật ngay trong terminal bằng `genchibi update` (không đi qua trình duyệt). `localhost` / `127.0.0.1` / `[::1]` cùng cổng được coi là một; proxy đứng trước thì cho proxy gửi `X-Forwarded-Host` hoặc đặt `GC_PUBLIC_URL`.
- **Thêm connector trên claude.ai báo lỗi, hoặc không thấy trang Cấp phép?** Kiểm theo thứ tự:
  1. `curl -i -X POST https://tên-miền/mcp -H 'Content-Type: application/json' -d '{}'` phải trả **401** kèm `WWW-Authenticate: Bearer resource_metadata="…"`. Nếu ra trang đăng nhập, 302 hay 403 thì proxy hoặc Cloudflare đang chặn (xem *Đứng sau proxy*).
  2. `curl https://tên-miền/.well-known/oauth-authorization-server` phải trả JSON có `issuer` đúng `https://tên-miền`.
  3. Địa chỉ công khai (`genchibi online` in ra; `GC_PUBLIC_URL` ở máy cấu hình tay) phải khớp **từng chữ** với địa chỉ đã dán vào claude.ai.

  Nếu đổi địa chỉ, xoá connector rồi thêm lại, vì claude.ai nhớ kết quả dò khoảng 5 phút.
- **Có trang đăng nhập riêng trước app (do agent khác dựng) thì cập nhật có mất không?** Không mất, miễn là trang đó nằm **ngoài** thư mục cài: Caddyfile, service riêng, hoặc `docker-compose.override.yml`. Sẽ mất nếu nó được ghi vào `docker-compose.yml` hay sửa file trong `current/`: mỗi lần cập nhật hoặc khởi động, genchibi chép lại `docker-compose.yml` gốc, còn bản mới được giải nén vào thư mục riêng.
- **`start` / `update` dừng với "Dừng trước khi đụng container nào"?** Từ v0.23.1, trên bản cài Docker, `genchibi` (bằng root hay bằng user của bạn) không dùng tệp app ghi được (cả thư mục cài) khi bạn chưa quyết, và cũng không lặng lẽ bỏ `docker-compose.override.yml` (có thể chứa trang đăng nhập của bạn). Container đang chạy giữ nguyên. Xem nội dung lệnh in ra — gồm cả các biến `.env` override dùng — rồi quyết một lần bằng đúng lệnh nó in (đường tuyệt đối, `sudo` tìm được): `… override approve` (dùng, kèm đúng các biến đó — bản chép giữ ở `~/.local/lib/gen-chibi/override.yml`) hoặc `… override off` (chạy không có nó); không có terminal thì thêm `--yes`. Sửa hay xoá tệp về sau → được hỏi lại. Lần gõ `genchibi` đầu tiên sau khi app cập nhật cần github.com một lần (kiểm bản phát hành mới). Chi tiết: [README › Chạy genchibi an toàn](../README.vi.md#chạy-genchibi-an-toàn-không-bao-giờ-tin-thư-mục-cài-v0231).
- **Bản cài có gì đó không ổn?** `genchibi doctor` kiểm một lượt (app, lệnh và tệp compose đã kiểm, user của container, cổng, thiết lập lần đầu, thư mục edge Caddy, tunnel) và nói cách sửa từng ✗. Bản cài bằng root không qua sudo ở v0.21.0–0.21.2 cho container chạy bằng uid 1000. Khi bản cài ghi rõ root đã cài (trình cài v0.23.1) hoặc uid 1000 không thuộc ai, `doctor` chạy bằng root đề nghị chuyển sang tài khoản hệ thống `genchibi`. Bản cài cũ hơn thì nó không phân biệt được, nên chỉ in một dòng; nếu uid 1000 không phải bạn, chạy `sudo -i` rồi `~/.local/bin/genchibi doctor --migrate` (thêm `--yes` để không hỏi). Không bao giờ chuyển bản cài thuộc chính người đang gõ, hay khi uid đó còn tiến trình đang chạy.
- **Khôi phục sao lưu trên chính máy này — Go offline còn dọn Cloudflare được không?** Được (v0.23.1): bản sao lưu làm trên máy này giữ mã bản cài, nên Go offline xoá tunnel và bản ghi DNS của chính máy. Bản sao lưu từ máy khác nhận mã mới và không đụng tới tài nguyên của máy kia.
- **Đổi giao diện sang tiếng Việt thế nào?** Cho cả bản cài: `genchibi lang vi` (hoặc `--lang vi` lúc cài). Chỉ cho riêng bạn: nút chuyển ngôn ngữ trong Studio. Chi tiết: [README › Ngôn ngữ](../README.vi.md#ngôn-ngữ).
- **Hiệu năng?** Mỗi sân khấu tối đa 8 diễn viên sống; ảnh tĩnh được cache; hết phân cảnh là huỷ diễn viên.
