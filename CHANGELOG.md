# Changelog

## v0.17.0 — Lời thoại không che mặt, giọng AI theo vai bằng 4 thứ tiếng, chuỗi trộn âm thanh mới
Ryan: "bong bóng chat che vào nhân vật và cách trình bày không chuyên nghiệp" · "hiệu ứng âm thanh tệ quá" · "nên có hệ thống xịn 1 chút về tiếng việt , tiếng anh và tiếng trung chuyên biệt theo nhu cầu" · "nhất là nên có nhiều loại giọng cho các loại nhân vật già trẻ lớn bé , văn võ, trai gái, ông bà lão" · "nhập token vào là chạy được ngay chứ không phải cấu hình rắc rối" · "thêm tiếng cantoness (hongkong) nữa nhé".
- **Lời thoại không che mặt ai**: bộ giải bố cục (`GC.film.solveLayout`, thuần số) đo đầu từng diễn viên từ khung xương thật (cả chu kỳ động tác, cả quãng bước tới / lùi) qua máy quay hiện tại, rồi chấm các chỗ đặt bong bóng — không đè đầu ai, đuôi không cắt ngang đầu người khác, gần miệng người nói. Hết chỗ sạch thì **phụ đề** dải dưới (thẻ tên màu nhân vật). Ô **Lời thoại: tự động / bong bóng / phụ đề** ở Sân khấu final và trong phim xuất ra. Đo trên hai phim mẫu (46 câu): 0 px² đè đầu, bố cục ~8 ms / câu (tính một lần mỗi câu).
- **Chữ lời thoại**: phông **Be Vietnam Pro** nhúng (SIL OFL 1.1, cắt Latin + tiếng Việt, ~45 KB; toàn văn giấy phép đi kèm phim xuất), một cỡ chữ theo khung, mọi từ đọc được ngay (từ chưa đọc chỉ nhạt nhẹ), thẻ tên trong bong bóng đủ tương phản 4,5 : 1; vẽ lại bong bóng nói / hét / nghĩ / thì thầm; tôn trọng giảm chuyển động.
- **Chuỗi trộn âm thanh mới**: hiệu ứng đi bus riêng có nén nhẹ + phòng vang (đáp ứng xung sinh bằng code), không bị nén "keo" của nhạc / lời làm xẹp; limiter + cắt mềm −0,3 dBFS — 12 âm chồng nhau không vỡ; 17 hiệu ứng tổng hợp lại nhiều lớp, độ to đều (chênh LUFS 24 → 7 dB). Ryan nghe bản so sánh: "mấy cái âm thanh cũ mới của bạn cũng nghe chán ngắt tôi muốn cái kiểu khoa trương như trong phim hoạt hình ấy" → bộ hiệu ứng khoa trương kiểu hoạt hình + thư viện âm thanh làm ở bản kế (bài học L-63).
- **Giọng AI theo vai** (Google Gemini TTS): 22 vai — bé trai, bé gái, thiếu niên, thiếu nữ, thanh niên, trung niên, ông lão, bà lão, võ tướng, nữ tướng, hiệp khách, quân sư, tiểu thư, vua, hoàng hậu, phản diện (nam / nữ), vai hài (nam / nữ), người kể chuyện… — vai đoán từ vai trò / tính cách / tên, chọn tay được (bộ mẫu đã chọn sẵn). **4 ngôn ngữ** của tác phẩm: tiếng Việt, tiếng Anh (Mỹ / Anh), tiếng Trung (phổ thông / Đài Loan), **tiếng Quảng Đông (Hồng Kông)** — lời thoại viết bằng ngôn ngữ đó (AI đạo diễn và hướng dẫn agent theo ngôn ngữ của tác phẩm).
- **Mỗi nhân vật một giọng, chốt theo tác phẩm**: giọng đã **thiết kế** cho vai → giọng **thư viện Google** bản ngữ hợp giới + tuổi + cao độ + chất giọng (40 giọng tiếng Việt, hơn 300 giọng Anh) → giọng dựng sẵn hợp vai. Giọng của dàn được chốt vào tác phẩm: thêm diễn viên hay Google thêm giọng không đổi giọng người cũ; Studio, MCP và phim xuất cùng một giọng; gói dự án mang theo.
- **Thiết kế giọng vai** (một nút, ~25 s, tốn một lượt): ông lão, bà lão, võ tướng, tiếng Trung / Quảng Đông… Giọng lưu trong project Google của chủ máy (Google giữ 1 năm kể từ lần dùng cuối, tối đa 200 giọng). **Giọng vùng tiếng Việt (Bắc / Trung / Nam) chỉ có ở vai đã thiết kế giọng** — thư viện Google không phân vùng; Sân khấu báo số vai đã có giọng vùng và có nút thiết kế cho cả dàn (bấm tay, báo trước số lượt). Google chặn thiết kế giọng trẻ em → vai bé lồng bằng giọng nữ cao trẻ trung có sẵn (cách lồng tiếng hoạt hình).
- **Dán key là chạy**: Cài đặt AI › Giọng AI — một ô dán key Google AI Studio → kiểm ngay bằng lệnh miễn phí → tự bật; đã có key Gemini của AI đạo diễn thì dùng luôn. Đọc qua **Interactions API** đúng hướng dẫn Google (chữ nguyên văn, cách nói của vai + cảm xúc ở `speech_metadata.style`); model quét lúc chạy, hết lượt tự chuyển model kế, hết hẳn thì báo đúng giờ thử lại Google đưa (đọc từ phản hồi thật) và rơi về giọng trình duyệt. Câu đã đọc lưu đệm theo nội dung — nghe lại, xuất phim không tốn lượt. Gói miễn phí của Google: 10 câu / ngày / model.
- **Chi tiêu chỉ chủ máy**: lồng tiếng / thiết kế giọng chỉ chạy khi chủ máy bấm (Studio, stdio, MCP có token); qua link MCP chỉ lấy câu đã lồng sẵn, AI chatroom không có tool giọng; **trần câu / ngày** (mặc định 200, đổi ở Cài đặt AI). Giọng Google báo không còn thì tạm bỏ 24 giờ, có nút thử lại.
- **Lồng tiếng AI** cả tác phẩm (Sân khấu final, có tiến độ, dừng đúng khi hết lượt); bộ phát hỏi trước clip của cả phân cảnh; **phim xuất** nhúng giọng đã lồng + ngôn ngữ (mở file:// không gọi mạng). Hồ sơ nhân vật › Giọng: vai, giọng vùng, giọng AI, cao độ / tốc độ.
- **Giọng trình duyệt dự phòng** đúng ngôn ngữ + giọng vùng + giới của vai (giọng Edge / Google / hệ điều hành; Anh Anh en-GB, Đài Loan zh-TW, Quảng Đông zh-HK), không bao giờ đọc tiếng Việt bằng giọng Anh hay tiếng Quảng Đông bằng giọng phổ thông.
- **MCP 46 tool**: `render_voice` nhận `role` / `lang` / `accent` / `work` (giọng đã chốt) / `include_audio`; mới `design_voice` (chỉ chủ máy); `save_work` nhận `lang` / `accent`; `get_catalog` có `voiceRoles`, `voiceLangs`; nhân vật lưu `voice.role` / `voice.accent` / `voice.ai`; lỗi hết lượt có `retryAt`. Hướng dẫn agent (phim bước 8, nhân vật, luật vàng 6) viết lại.
- Kiểm thử: **2k** giọng AI với mạng giả dựng từ **phản hồi thật đã đo** (`tools/fixtures/voice`, 0 lời gọi Google): dán key, Interactions / đời trước, 429 thật, trần ngày, giọng hỏng có hạn, cast theo vai + chốt theo tác phẩm, thiết kế (vai trẻ em bị chặn), tiếng Quảng Đông, kênh link / chatroom, gói dự án giữ ngôn ngữ, giọng trình duyệt; thử ngược 5 rào đỏ → test đỏ. **2l** âm thanh (render offline trong Chromium khi có Playwright: không NaN / vỡ / câm, độ to, rò node = 0, clip giọng mọi định dạng). Trình duyệt: lời thoại (46 câu, phụ đề, khung 640 / 420 px, hiệu năng, thử ngược bộ giải cũ → đỏ) + nhóm "giọng AI" (mock mọi `api/voice`, chặn mọi yêu cầu ra ngoài). Cổng cortex v0.17: 3 🔴 + 4 🟠 đã sửa trước khi nâng `VERSION`.

## v0.16.0 — Gói động tác thành asset, bộ đòn khung trung lập, MCP đầy đủ cho agent mọi hãng
Ryan chốt Q9 / Q10 theo mặc định (ADR 0006): biên đạo kéo về trục asset; khung có bộ động tác trung lập, đòn riêng chủ đề thành gói của bộ chủ đề. Thêm: "xây hệ thống api mcp cho hoàn chỉnh và skill sử dụng và bootstrap cụ thể" · "agent sau này chưa chắc là claude".
- **Gói động tác** (`gen-chibi.motion/1`) — loại asset thứ tư, dữ liệu thuần qua cổng như linh kiện / cảnh: tư thế + clip + hành động + màn diễn. Cổng kẹp mọi số, tra mọi tên trong từ vựng, không nhận hàm / HTML, chặn khoá prototype và kế thừa vòng tròn, có trần tổng (khựng hình, bóng mờ / vệt chém, **một hành động ≤ 6 s**, kích thước) + trần cứng lúc chạy; dựng thử có hạn chót 4 s (gói nặng bị từ chối, không chặn server). Tư thế / clip của gói mang tiền tố riêng (không đè được khung); id hành động chung toàn hệ → trùng khung / gói khác / tên trạng thái bị chặn. Lưu = kiểm + **dựng thử** mọi hành động trên ma-nơ-canh. Nằm trong gói dự án (nhập trước tác phẩm), sao lưu, gói bán; bộ mẫu nhận ra theo **nội dung từng clip** (tư thế giải ra số khớp): chép nguyên clip, đổi id gói / id đòn / tên clip / tên tư thế, thêm tư thế thừa vẫn bị chặn bán. Chữ ký so khớp **chính xác**: sửa số liệu của clip (dù rất nhỏ) thì app tự cài không nhận ra — phần đó do giấy phép bộ mẫu điều chỉnh, không phải kỹ thuật.
- **Bộ động tác của khung** (trung lập chủ đề): tay không + hài — **đấm** (tay cao su, đánh vào mặt: chibi đầu to tay ngắn, đấm vào thân thì hai đầu chồng nhau), **đá**, **đẩy mặt**, **ném cà chua** (đường bay tính từ tay lúc buông tới ngực đối thủ); đòn binh khí chung đâm / quét (`needs: weapon`); một mình: vẫy chào + 9 động tác cũ. Điểm đánh theo từng cú (mũi binh khí / nắm tay / bàn chân). Đòn chạm gần (đá, đẩy) đánh xong **lùi về** thay vì đứng sát rồi chồng đầu; chồng đầu trước lúc va chạm thì chỉ thu ngắn đúng phần thiếu (đá trúng rồi ngã: đòn hụt ≤ 16 thay vì 46 như bản nháp).
- **Binh khí có nguồn dữ liệu**: nhân vật có binh khí khi tay phải cầm trang bị loại *Vũ khí* hoặc linh kiện khai `grip: weapon` (quạt lông Gia Cát Lượng là đạo cụ). Linh kiện tự vẽ trước v0.16 chưa khai `grip`: vật cầm tay **dài** vẫn tính là binh khí (phim cũ không mất màn đấu) — khai `grip` để chắc chắn. Bộ kiểm chặn đòn binh khí cho người tay không và gợi ý đòn làm được; AI đạo diễn chỉ được mời đòn của khung + gói thuộc dự án của dàn diễn viên.
- **Bộ Tam Quốc**: đòn kiểu Tử Long (liên hoàn, xoay chém, tung người bổ, múa thương) + màn "Tử Long 30 giây" chuyển thành **gói động tác dữ liệu** của bộ mẫu — màn 30 giây khớp tuyệt đối số đo bản code cũ. Khung không còn tham chiếu nhân vật / tên Tam Quốc.
- **Xuất hoạt ảnh một hành động** (engine, chạy cả Node): khung cố định ôm trọn đòn + hiệu ứng, nền trong suốt → các khung SVG, sprite sheet, timeline (`gen-chibi.anim/1`: fps, khung va chạm, đoạn clip). Đòn dài hơn trần khung (120) thì **tự hạ fps** cho khung phủ trọn đòn (`requestedFps`, `truncated`); sprite sheet đặt tiền tố id riêng cho từng khung.
- **Studio · Bảng bước** (Q9 "ô chọn đòn"): soạn kịch bản một phân cảnh không cần AI — lưới kiểu bảng tính (`B01`…, ≤ 12 bước), mọi ô chọn sinh từ lược đồ đạo diễn; ô Hành động chỉ có đòn diễn viên của hàng làm được (nhãn đòn đánh / ném / cần binh khí); Đối thủ mở khi chọn đòn đánh, Phản ứng khi có đối thủ; trường phụ (máy quay, bong bóng, hiệu ứng, âm thanh…) ở ô "thêm…". Lỗi kiểm hiện cạnh hàng, cảnh báo dàn dựng hiện trước khi lưu; lưu qua đúng cổng như AI / MCP.
- **Studio · Thư viện › Động tác**: đòn của khung + từng gói động tác theo dự án (Nháp / Phát hành / Bộ mẫu); xem trước trên nhân vật thật với đối thủ + phản ứng; **tải hoạt ảnh một đòn**: PNG sprite sheet, **GIF** (bộ mã hoá GIF89a viết thuần trong Studio, nền trong suốt, lặp mãi), SVG sheet, JSON timeline; tải / nhập gói động tác (lỗi cổng hiện đủ). Phim HTML xuất ra mang theo gói động tác của đòn đã dùng (review bắt lỗi rơi gói khi đóng gói — đã sửa, có test phim Tam Quốc đủ 6/6 chương). Nhập gói chọn **dự án** (mặc định dự án vừa dùng, trừ dự án mẫu; để trống = gói chung dùng với mọi dàn diễn viên); gói / JSON hoạt ảnh của bộ mẫu mang dấu và giấy phép bộ mẫu; ô người ra đòn làm mờ người không làm được; fps tự hạ được ghi rõ; xuất PNG / GIF nhả luồng sau từng khung và hiện % (trang vẫn bấm được trong lúc xuất).
- **Bảng bước an toàn hơn** (review): sửa trong lúc đang lưu không còn bị đánh dấu "đã lưu" (mất chữ lặng lẽ); nút Lưu khoá khi đang gửi; kéo bôi chữ ra ngoài không đóng bảng; cảnh báo dàn dựng chỉ tính lại khi đổi dàn / đòn / chỗ đứng (gõ thoại không nhấp nháy); giữ tiêu điểm khi xoá hàng / bấm chip, Esc không đóng khi đang gõ dấu, hỏi trước khi rời trang còn thay đổi.
- **MCP đầy đủ cho mọi việc tạo / kiểm / dựng / xuất asset (31 → 44 tool)**: `start_here` (gọi đầu tiên), `get_guide`, `list_actions`, `list_motion_packs`, `get_motion_pack`, `get_motion_spec`, `validate_motion_pack`, `save_motion_pack`, `render_action`, `preview_shot`, `list_samples`, `install_sample`, `list_events`; `get_catalog` có hành động, `get_director_schema` có `actorsCan`, `render_character` nhận `action`. **Mọi** lời gọi hỏng ở mọi tool (cả `validate_*` không đạt) có **mã ổn định** `[VALIDATION_FAILED]` / `NOT_FOUND` / `CONFLICT` / `FORBIDDEN` / … + `structuredContent.error.details[].path` (lỗi kịch bản chỉ `steps[i].field`) + gợi ý; trường cũ (`saved`, `errors`, `gates`, `conflicts`) vẫn giữ trong `structuredContent`. **Đổi so với v0.15 (client ngoài để ý):** chữ của lời gọi lỗi không còn là JSON thuần (mở đầu `[CODE]`, JSON cũ nằm ở dòng cuối); `import_project` lỗi: `structuredContent.error` là object (trước là chuỗi); `validate_*` không đạt giờ là lỗi `isError`; lỗi `save_shot` chỉ `shot.event.steps[i].field`. Chưa có tool: xoá / thùng rác / lịch sử phiên bản (cố ý — agent không xoá), xuất storyboard / phim HTML (Studio).
- **Hướng dẫn agent một nguồn, trung lập model** (`agent/`): GUIDE.md (luật vàng, mã lỗi, thuật ngữ Việt ↔ API) + 9 quy trình theo chủ đề + ví dụ JSON được CI chạy thật. Phát qua MCP, HTTP thuần (`GET /mcp?guide=` · `?tools=openai|gemini|mcp`), và lớp bọc từng hãng sinh từ cùng nguồn (Claude skill, `AGENTS.md`, `GEMINI.md`, Cursor rule).
- **Bootstrap**: `genchibi agent connect` (cấu hình nối Claude Code / Cursor / Gemini CLI / Codex CLI / curl; không in token, link Internet không kèm token) · `agent skill <hãng>` (cài vào thư mục đang đứng / `--dir`; không ghi đè `AGENTS.md` / `GEMINI.md` / rule có sẵn của bạn trừ khi `--force`) · `agent guide [chủ đề]` · `agent tools --format openai|gemini`. Token gửi qua stdin của curl, không lộ trong `ps`.
- **Không mất đòn im lặng**: thanh Sẵn sàng báo đòn không có (thiếu gói) hoặc diễn viên không làm được; bộ phát ghi cảnh báo thay vì bỏ qua. Gói sao lưu kéo theo gói động tác mà phim của dự án dùng (cả gói của dự án khác) → khôi phục ở máy sạch đủ màn đấu.
- **Chặn quá tải**: một hành động ≤ 6 s, ≤ 4 sự kiện bóng mờ / vạch tốc độ / vệt chém mỗi clip, dựng thử ≤ 4 s, ≤ 8 gói động tác mỗi gói dự án, lô JSON-RPC ≤ 20 lời gọi; id trùng tên dành riêng của JavaScript (`toString`, `constructor`…) bị chặn; `render_action` kẹp `fps` / `cell`.
- Sửa: `weaponOf` coi `gen.core/none` là tay không (trước đây tay không bị tính như cầm binh khí dài 24). Trang demo biên đạo chỉ nhúng thứ cần dùng, không tải font ngoài (CNS-040).
- Kiểm thử: **3c** thêm lô JSON-RPC > 20 → 413 và **CLI chạy thật** (`agent skill` không ghi đè tệp của bạn, `--force`, cài vào thư mục đang đứng, `connect` không in token, token không nằm trong argv của curl). **2j** (`tools/test-motion.js`) — cổng gói động tác chặn đúng chỗ 15 kiểu tấn công (thời lượng khổng lồ, 2 000 khựng hình, NaN, hàm, prototype, chèn màu, vòng kế thừa, phần tử null, quá ngân sách vệt chém, hành động quá dài…) + gói nặng nhất cổng cho qua dựng thử dưới trần, hết hạn chót → "quá nặng" không lưu, gói dự án tối đa 8 gói động tác; hình học đấm / đá / đẩy mặt / ném **đo độc lập** từ ma trận khớp ở các cặp chỗ đứng thật × trúng / ngã / choáng, và tâm hai đầu không chồng ở 3 đòn × 5 phản ứng × mọi cặp; gói bán chặn gói mẫu ngụy trang 4 kiểu, gói tự làm bán được; sao lưu tự đủ + khôi phục máy sạch; dữ liệu trước v0.16; hoạt ảnh phủ trọn đòn; 28 lời gọi hỏng ở mọi tool + 19 trường kịch bản làm hỏng lần lượt đúng hợp đồng `[CODE]` và đường dẫn. Trình duyệt thêm bảng bước (ô hành động lọc theo binh khí, đổi đòn rồi lưu) và trang Động tác (GIF giải mã lại đủ khung + lặp, nhập gói hỏng hiện lỗi 422); 3c **"agent từ số 0"** — agent tất định chỉ dùng hướng dẫn + ví dụ nguyên văn qua JSON-RPC thuần đi trọn luồng (dự án → linh kiện → trang bị → nhân vật → cảnh → gói động tác → phim → hoạt ảnh → gói dự án), hợp đồng lỗi có mã, đường không-MCP, lớp bọc từng hãng, độ phủ hướng dẫn ↔ tool.

## v0.15.1 — Sửa màn đấu v0.15.0: binh khí xuyên người, chồng đầu, lộn đè người xem
v0.15.0 phát hành theo lệnh Ryan trước khi review mã + kiểm toàn vẹn (cortex) chạy xong; bản này sửa mọi phát hiện của hai vòng đó.
- **Đính chính v0.15.0**: changelog v0.15.0 viết "hình học binh khí đọc thẳng từ bản vẽ" và "không chồng người" — **không đúng**. Màn đấu khi đó vẫn tính tầm bằng cây thương mặc định (mũi thương bạc xuyên qua thân đối thủ), còn test đo bằng chính hàm sai nên không bắt được. Bản này dùng hình học thật; test đo độc lập từ ma trận khớp + bản vẽ.
- **Không chồng đầu**: `duel()` dựng xong thì đo khoảng cách tâm đầu hai người suốt màn; đổ người tới (đâm, quét, bổ) hoặc đối thủ gập người khi trúng mà hai đầu gần hơn ~0,9 bề rộng đầu → người ra đòn lùi lại đúng phần thiếu rồi dựng lại (gần nhất trước đây 36, nay ≥ 71 ở mọi cặp đòn × phản ứng × vị trí).
- **Tung người bổ xuống** là đòn **đập đất**: mũi thương cắm xuống ngay trước mặt đối thủ, trúng bằng chấn động (vòng sóng, RẦM!) — trường mới `shock` trong `ACTIONS`.
- **Không lộn / văng / lùi đè lên người đứng xem**: đạo diễn truyền chỗ đứng của người xem (`walls`) vào biên đạo; né lộn ngược, văng ngã, lùi lấy đà dừng trước họ một thân người. Hết chỗ lùi thì đòn **bay ngắn lại** (`tscale` theo từng bước) thay vì thu nhỏ đều mọi bước (từng làm đòn bổ hụt hẳn). Người đứng chen giữa hai đấu thủ không làm đổi màn đấu.
- Xoay người chém sang trái không còn quay lưng về đối thủ; liên hoàn canh tầm theo cú đâm (không theo cú hất lên); né canh cú đầu, trúng canh cú cuối; giữ diễn viên trong sân khấu tính đúng gốc của từng người.
- Bộ phát phim: bấm dừng giữa màn đấu gỡ sạch lớp hiệu ứng + bộ điều khiển; hết màn không còn xoay người một vòng; khung điện ảnh không loé lên lúc tắt; dựng lại màn khi vị trí lệch thì đúng hướng và không làm hỏng phim nếu lỗi.
- Cảm xúc tay đưa lên mặt (nghĩ ngợi, hả hê, thèm, van xin, nghiến răng, ủ rũ, xoa…) **cất binh khí** — không còn kiếm / thương cắt ngang mặt.
- Bảo mật bộ mẫu: dấu theo nội dung so bằng JSON chuẩn hoá (đảo thứ tự khoá không gỡ được dấu); `action` / `react` là khoá prototype (`toString`, `constructor`) bị chặn.
- **Cập nhật bộ mẫu**: máy đang giữ Tam Quốc bản cũ (chưa có *Đấu tập trước trận*) thấy nút **⟳ Cập nhật Tam Quốc** ở Thư viện › Dự án chủ đề.
- Kiểm thử: 2g đo tâm đầu ≥ 68 suốt màn, mũi binh khí bằng hình học thật, người xem sau lưng không bị đè; mỗi rào mới đã được thử ngược (tắt rào → test đỏ). Test trình duyệt: dừng giữa màn đấu, luồng cập nhật bộ mẫu; tự dọn server khi test hỏng giữa chừng.

## v0.15.0 — Biên đạo: nhân vật diễn liên hoàn, đấu võ trong phim, máy quay điện ảnh
Ryan: "các động tác quá nghèo nàn… rất khó để biểu diễn ra các chuỗi hành động liên hoàn đẹp mắt sinh động", "khi làm phim phải kết hợp hiệu ứng phóng to thu nhỏ, di chuyển nhanh chậm và rất nhiều thứ khác". Thử thách: "1 nhân vật hoạt động linh hoạt trong vòng 30s… liên hoàn, chuyển tiếp mượt mà, không trùng nhau".
- **Biên đạo** (`engine/choreo.js`, thuần dữ liệu, chạy cả trong Node): tư thế then chốt + nhịp (bật nhanh, vượt quá rồi về, rơi tự do) → **lò xo** cho phần lắc theo (đầu, vạt áo, cẳng tay, binh khí) → dịch chuyển gốc trong thế giới → **hai đồng hồ** giờ truyện / giờ thật (**slow-mo**, tua nhanh, **khựng hình** khi trúng đòn) → **máy quay** bám kiểu lò xo, dẫn khung, nghiêng, rung, **thị sai 4 lớp cảnh** → hiệu ứng (vệt chém, va chạm, bụi, vòng sóng, mảnh vỡ, bóng mờ, vạch tốc độ, khung điện ảnh, chữ tượng thanh) + âm thanh theo nhịp. Nhiều diễn viên chung một đồng hồ. Đổi chính diện ↔ nghiêng đi qua góc 45° ở giữa.
- **Màn mẫu "Tử Long 30 giây"**: Triệu Vân diễn liền 29 hành vi không lặp (rón rén, giật mình, chạy, múa thương, đâm, quét, xoay, tung người slow-mo, bổ xuống, trúng đá, lộn, choáng, bật dậy, lướt, lộn ngược, gạt đỡ, phản đòn, nhảy mừng, thi lễ…). `tools/choreo-demo.js` xuất thành trang HTML tự chạy kèm số đo.
- **Đấu võ trong phim**: bước kịch bản có `action` / `target` / `react` (xem Hướng dẫn). `GC.choreo.duel` tự tính tầm (lướt tới / lùi lại cho mũi binh khí chạm mặt trước thân đối thủ, không chồng người), đối thủ phản ứng đúng khung va chạm (trúng, ngã lộn, choáng, gạt đỡ, né), không văng khỏi sân khấu. Bộ phát chạy biên đạo ngay trên diễn viên đang có (`render.full().drive`), máy quay hai người bám theo, đẩy máy khi trúng, người xem giật mình. Hình học binh khí (dài tới mũi, nghiêng sẵn) đọc thẳng từ bản vẽ đồ cầm tay *(đính chính ở v0.15.1: bản này chưa dùng tới — sửa ở v0.15.1)*.
- AI đạo diễn được dạy các đòn / phản ứng; lược đồ + bộ kiểm chặn đòn thiếu đối thủ, đối thủ cho hành động một mình, phản ứng lạ. Phim Tam Quốc thêm phân cảnh **Đấu tập trước trận** (Triệu Vân ↔ Trương Phi).
- **18 cảm xúc thành 18 dáng toàn thân** khác nhau rõ (17 động tác mới, nghiêng thân, dồn trọng tâm, tay bất đối xứng, tay "cao su"): khoảng cách hình bóng giữa hai cảm xúc gần nhất 1,4 → 8,1.
- Engine: `finishPose`, `jointMatrices`, `sceneLayers`, `keyPoints` / `poseDistance` (đo hình bóng), `director.hide` (cất / rút binh khí).
- Dấu bộ mẫu **theo nội dung** (review bảo mật): gói bán so hình vẽ từng linh kiện với bộ mẫu app mang sẵn — gỡ dấu trong gói hay đổi id vẫn bị nhận ra.
- Kiểm thử: `tools/test.sh` 2g (đấu trong phim: chạm ±14, phản ứng đúng khung ±0,03 s, không chồng người, không văng khỏi sân khấu), 2h (cảm xúc khác dáng), 2i (màn 30 s: thời lượng, không lặp, độ mượt p99 ≤ 24 đv/khung); trình duyệt: trang biên đạo độc lập, phân cảnh đấu diễn thật trong bộ phát phim.

## v0.14.0 — Phim sống: dàn dựng, máy quay, nhép miệng, bong bóng truyện tranh, âm thanh, giọng nói
Ryan xem phim v0.13: "nhân vật chỉ biết đứng yên rồi nhúng nhúng… bong bóng chữ không chuyên nghiệp… không có âm thanh hiệu ứng… không có giọng nói… không nhép miệng". Bộ phát được làm lại từ gốc.
- **Đạo diễn tự động** (`GC.film.direct`, thuần dữ liệu, test được trong Node): nhân vật **đi / chạy ra sân** từ hai phía; **đi tới chỗ mới** khi kịch bản đổi chỗ đứng; **bước tới** người nghe khi giận / thề / van xin, **lùi lại** khi sốc / hoảng (không đè lên người khác); người nói **quay về người nghe**, khoa tay khi nói (động tác mới `talk`); người nghe quay về người nói, **gật gù** (động tác mới `nod`), **giật mình** khi bị hét.
- **Máy quay**: cận mặt người nói (đọc được biểu cảm), khung hai người khi đối đáp, toàn cảnh khi cả nhóm ăn mừng; câu hét đẩy máy vào + rung, câu sốc chớp trắng.
- **Nhép miệng**: miệng người nói đổi ngậm / mở nhỏ / mở to theo từng âm tiết của giọng đọc (chỉ thay lớp miệng — rẻ).
- **Bong bóng thoại kiểu truyện tranh** vẽ SVG: nói (bo tròn), **hét** (răng cưa, chữ đậm rung), **nghĩ** (đám mây + bọt bay về đầu), thì thầm (viền đứt); đuôi chỉ đúng miệng người nói, thẻ tên theo màu nhân vật, chữ hiện từng từ theo giọng.
- **Âm thanh** (`engine/audio.js`, Web Audio tổng hợp — không tệp, không mạng, chạy cả trong phim mở bằng file://): 17 hiệu ứng theo cảm xúc / hành động / bước chân / thẻ tiêu đề; tiếng nền theo bối cảnh (chim, dế, mưa, gió, trong nhà); nhạc nhẹ theo không khí phân cảnh (êm, căng, hùng tráng, hài, buồn), tự hạ khi có lời.
- **Giọng nói riêng từng nhân vật**: máy đọc tiếng Việt của trình duyệt (cao độ + tốc độ theo nhân vật); không có giọng Việt thì **giọng blip** kiểu game (có dấu thanh, câu hỏi lên giọng). Công thức nhân vật có trường `voice { pitch, rate }`; Thư viện › Nhân vật › **Giọng**: kéo, nghe thử, lưu. Chưa đặt thì tự chọn theo vai.
- Sân khấu Studio và phim xuất ra có nút 🔊 bật / tắt tiếng và chọn giọng (tự động / máy đọc / blip / tắt).
- Kịch bản có thể chỉ đạo từng câu: `to`, `camera` (close / two / wide), `bubble` (say / shout / think / whisper), `sfx` — AI đạo diễn được dạy các trường này và được nhắc đổi `spot` để nhân vật đi lại.
- Hai phim mẫu viết lại có dàn dựng + giọng riêng (Văn phòng vui, Tam Quốc).
- Theo kiểm toàn vẹn (cortex): **bộ mẫu Tam Quốc** mang dấu Gen Labs — xem, sửa thử, làm phim; **không xuất gói bán** (sao lưu vẫn giữ dấu; đổi tên không gỡ được); gói làm bằng bản gen-chibi mới hơn → báo cập nhật trước khi ghi; tóc dữ liệu thiếu bản sau lưng → khung tự phủ mảng tóc theo viền đầu; Lưu Bị có **song kiếm**, Triệu Vân có **thương bạc tua đỏ** — mỗi tướng một bộ dấu nhận diện riêng.
- Theo review mã: `hold` (giữ khung) lại có hiệu lực — câu "..." `hold: 5` hiện đủ 5 giây; câu hét ở toàn cảnh zoom quanh tâm khung (không lệch góc trái trên); bước thoại thiếu `say` không còn hiện chữ "undefined"; bấm diễn rồi dừng ngay trong cùng nhịp không còn bật nhạc sau khi đã dừng; phim xuất ra chốt sẵn giọng từng nhân vật (giống Studio).
- **Dấu nguồn gốc bộ mẫu theo từng mục** (review mã, CNS-022): linh kiện / trang bị / cảnh / nhân vật nhập từ bộ mẫu mang dấu riêng; gói bán của **dự án khác** dùng tới chúng bị chặn (403, nêu tên mục); gói sao lưu mang dấu theo, nhập lại ở máy khác vẫn chặn.
- Kiểm thử: `tools/test.sh` 2g (đạo diễn tự động: ra sân, đi lại, bong bóng, máy quay, khẩu hình, phản ứng mọi câu; lược đồ chặn giá trị sai), 2f mở rộng; trình duyệt đo đúng điều người xem thấy (nhân vật di chuyển, miệng nhép, máy quay cận, bong bóng có đuôi + thẻ tên, âm thanh bật).

## v0.13.0 — Bài thử khung: bộ chủ đề Tam Quốc dựng từ khung
- **Bộ chủ đề mẫu "Tam Quốc"** (`studio/mau/tam-quoc.json`): 7 tướng (Gia Cát Lượng, Quan Vũ, Trương Phi, Tào Tháo, Lưu Bị, Triệu Vân, Lính quèn), 13 trang bị, 8 bối cảnh, 26 linh kiện nhân vật + 27 phông dạng dữ liệu, phim *Từ vườn đào tới Xích Bích* (5 phân cảnh). Dựng lại bộ v0.5 (viết bằng code) thành **dự án chủ đề tạo từ khung**, đi qua đúng cổng nhập như mọi gói; mọi asset đã Phát hành → xem ngay một **Gói bán** trọn bộ. Lưu Bị và Triệu Vân phối 0 linh kiện mới.
- **Linh kiện dữ liệu ngang linh kiện code** (phát hiện khi chạy bài thử khung):
  - `d="{shape}"` — vẽ theo **dáng đầu thật** của nhân vật ở mọi góc (mặt nạ kinh kịch khít đầu tròn / vuông / oval; mảng tóc sau gáy).
  - **Đánh dấu chiếu 45°** `<g class="gc-f45 | gc-f45c | gc-b45t | gc-b45h">` trong các lớp góc nghiêng: engine thay bằng phép chiếu mặt / thân thật lúc dựng — dữ liệu không cần `clipPath`, `url()`.
  - `eyeArea` cho mặt nạ, `tall` / `upright` cho vật cầm tay.
  - Bộ lọc số nhận dạng `.25` (SVG hợp lệ, rất hay gặp ở SVG do AI / người viết).
  - `get_part_spec` mô tả đủ các năng lực trên cho agent.
- Tóc có bản **135° / sau lưng** (trước đây tóc búi / dựng / gọn biến mất khi nhân vật quay lưng).
- Engine: ở 135° mượn bản sau lưng của linh kiện là bản vẽ thật — không còn đè tóc bằng lớp tóc sau (tóc chỉ có bản sau lưng từng biến mất ở 135°).
- An toàn (theo review): đánh dấu chiếu **không được lồng nhau** (mỗi phép chiếu nhân đôi nội dung — lồng 14 tầng từng phình 336 ký tự thành 6,5 MB), phải là nhóm có nội dung chỉ mang `class`; `<g …/>` tự đóng được chuẩn hoá và không còn làm lệch cặp nhóm; thay đánh dấu là vòng lặp tuyến tính không đệ quy; id cắt theo đầu kèm góc nhìn (bàn soát nhiều góc trong một SVG); viền `{shape}` nhận mọi thứ tự thuộc tính.
- Cổng linh kiện có **lời khuyên** (không chặn) cho lỗi qua được cổng nhưng lộ ra khi nhìn: tóc thiếu bản sau lưng, mặt nạ tô kín mặt chưa dùng `{shape}`, vật cầm tay thiếu icon — trả về ở `preview_part` / `save_part`.
- Studio: chọn dự án mẫu — **Văn phòng vui** (xem luồng 10 giây) hoặc **Tam Quốc** (bộ chủ đề trọn vẹn).
- `archive/tamquoc/port.js` — công cụ dev dựng lại gói từ nguồn; `tools/test.sh` (2f) chặn gói lệch nguồn, dựng 210 ảnh (7 tướng × 10 góc × 3 biểu cảm) không còn token / đánh dấu sót, chặn 7 kiểu dữ liệu sai.

## v0.12.0 — Nháp / Phát hành, Gói bán, thư viện gen.*
Áp các quyết định Q1–Q4 của Ryan (2026-10-18) — xem `docs/spec/DAC-TA-3-GIAI-DOAN.md`.
- **Hai trạng thái asset: Nháp / Phát hành** (thay Chờ duyệt / Đã duyệt). Nháp dùng ngay trong dự án — mặc định cho mọi asset, kể cả AI tự tạo; **Phát hành** đưa asset vào gói bán (nhân vật cần dấu nhận diện). Nút **Phát hành / Về nháp** ở khu *Dùng* của Thư viện; bấm xong vẫn đứng ở asset đó. Dữ liệu cũ tự quy đổi (`approved` → Phát hành, `review` → Nháp).
- **Gói bán** (Thư viện › Dự án chủ đề): chỉ asset phát hành, không kèm tác phẩm; asset phát hành cần thứ còn nháp (ví dụ vật phẩm đang cầm) → gói vẫn kéo theo cho đủ và **cảnh báo**. **Gói sao lưu** giữ nguyên: mọi asset + tác phẩm. Gói ghi `kind: sale | backup`. MCP `export_project` có `sale: true`. Bản xem thử không server dùng cùng luật.
- **Đổi tên thư viện** `afi.core` → **`gen.core`**, `afi.khung` → **`gen.khung`** (tệp `kinds/character/gen.core.js`, `kinds/khung/gen.khung.js`). Tham chiếu, gói dự án và dữ liệu cũ `afi.*` vẫn đọc được (`aliases` của pack, `GC.canon`) và được chuẩn hoá sang tên mới khi lưu.
- Dữ liệu lưu trước v0.12 (tham chiếu `afi.*`) được chuẩn hoá ở mọi lối: tra nhân vật (MCP / phân cảnh), đọc tác phẩm (Studio, AI đạo diễn), xuất gói (gói luôn ghi tên mới, `requires` đủ), sửa phân cảnh cũ không âm thầm mất bối cảnh / lời thoại; Studio nạp bản ghi cũ trong pack khung thành bản sao *Của tôi* như server (theo review).
- **Định vị:** gen-chibi là nhà máy asset chibi theo chủ đề; làm phim là cách dùng asset và là bản demo của thư viện (README, Hướng dẫn).
- Hook dự án chặn `pkill -f` / `killall` khi làm việc trên repo (bài học vận hành).
- Sửa test tự cập nhật trượt ngẫu nhiên ~1/16 lần: bước "làm hỏng checksum" gán ký tự đầu thành `0` — no-op khi hash vốn bắt đầu bằng `0`. Nay luôn đổi sang ký tự khác và kiểm đã hỏng thật trước khi kiểm updater chặn.
- Kiểm thử: gói bán (rỗng khi toàn nháp, chỉ asset phát hành, cảnh báo phụ thuộc nháp), quy đổi trạng thái cũ, phát hành thiếu dấu nhận diện bị chặn / nháp thì không, MCP `export_project` sale, tham chiếu `afi.*` cũ (nhân vật, item, gói, bản ghi trong pack khung), luồng trình duyệt Phát hành → Gói bán.

## v0.11.1 — Hoàn thiện theo kiểm toàn vẹn (cortex)
- Menu Xưởng tách hai nhóm: **Xưởng — tạo asset từ khung** (Tạo asset mới, bàn chỉnh, Trợ lý AI tạo asset) và **Khung chuẩn — quy cách · kiểm** (việc của Gen Labs). Mở Xưởng vào thẳng *Tạo asset mới*.
- Bảng tình trạng tác phẩm: phân cảnh thiếu diễn viên / bối cảnh có nút **+ Nhân vật ở Xưởng** / **+ Bối cảnh ở Xưởng** (đúng dự án của tác phẩm).
- Nhập gói lưu đè: báo rõ các mục trùng sẽ chuyển sang dự án nào.

## v0.11.0 — Thành phẩm: xuất phim, storyboard, gói dự án, dự án mẫu
- **Xuất phim HTML độc lập** (Tạo tác › Tác phẩm › Xuất): một tệp .html chứa bộ phát + nhân vật + bối cảnh + lời thoại; mở bằng trình duyệt bất kỳ, không cần cài, không cần mạng — thẻ tiêu đề từng phân cảnh, bóng thoại có tên người nói, danh sách phân cảnh, toàn màn hình, phím cách. Chỉ nhúng trường cần để dựng hình; bộ phát mang giấy phép *chỉ để xem phim đó*.
- **Storyboard SVG / PNG**: ảnh từng phân cảnh + mô tả + lời thoại; an toàn với emoji / ký tự điều khiển. Cùng **JSON** của tác phẩm.
- **Trình diễn dùng chung** `engine/player.js` (`GC.film`): một định nghĩa "sẵn sàng" cho bảng tình trạng, sân khấu Studio và phim xuất ra; ngân sách ≤ 8 diễn viên sống, hết cảnh là huỷ.
- **Bảng tình trạng tác phẩm**: "Sẵn sàng x/y phân cảnh" + cảnh nào thiếu gì (bối cảnh, diễn viên, lời thoại, quá chỗ đứng) — bấm để tới đúng phân cảnh.
- **Gói dự án** `gen-chibi.project/1`: xuất (nhân vật, vật phẩm, bối cảnh, linh kiện tự vẽ, tác phẩm — tự đủ, kéo theo asset dự án khác mà phân cảnh dùng, khai báo `requires`) và **nhập** (mọi mục qua đúng cổng kiểm; trùng id → hỏi lưu đè thành phiên bản mới; gói cần thư viện chưa cài / id trùng trong gói / > 200 phân cảnh bị chặn; không tạo dự án rỗng). MCP thêm `export_project`, `import_project` (31 tool).
- **Dự án mẫu một chạm** "Văn phòng vui": 3 nhân vật, 1 vật phẩm, 2 bối cảnh, phim 4 phân cảnh — người mới xem trọn luồng trong 10 giây.
- **Gom luồng Tạo tác**: Tác phẩm là lối vào duy nhất; *Kịch bản lẻ* agent gửi qua MCP (`save_event`) hiện ngay trong Tác phẩm → **+ Thành phân cảnh**. Trang "Diễn thử một cảnh" cũ đã gỡ; *Trợ lý AI tạo asset* chuyển về Xưởng; nút "+ mới" ở bàn chỉnh đi qua Tạo asset mới (luôn có dự án).
- Thuật ngữ thống nhất: **Vật phẩm**, **Bối cảnh** (asset), **Phân cảnh** (một cảnh của phim).
- **Sửa (review + cortex):** khung không bao giờ bị sửa — lưu vào khung từ Studio thành bản sao trong "Của tôi"; sửa ở bàn chỉnh không còn đẩy asset ra khỏi dự án; nhập gói không còn treo server (một lần đọc đĩa, ghi tác phẩm một lần); `/xuong/`, `/thu-vien/`, `/tao-tac/` chuyển về địa chỉ không có `/`; chế độ tối: chữ trên nút đủ tương phản.
- Tài liệu: **`docs/HUONG-DAN.md`** (hướng dẫn người dùng), README định vị lại + đủ 31 tool, QUY-TRINH-LINH-KIEN mục 8 theo 3 ứng dụng.
- Test mới: dự án mẫu qua cổng 100%, gói hỏng / trùng / thiếu thư viện, khung bất biến, giữ dự án khi sửa; trình duyệt: phim xuất ra mở bằng `file://` (không server) và diễn được, storyboard, dự án mẫu một chạm, kịch bản lẻ → phân cảnh.

## v0.10.0 — Ba ứng dụng độc lập · luồng làm việc liền mạch · Gen Labs
- **Tách 3 lớp thành 3 ứng dụng riêng** (yêu cầu của Ryan): `/xuong`, `/thu-vien`, `/tao-tac` — mỗi ứng dụng một địa chỉ, chỉ có menu của lớp mình (+ Hệ thống), màu riêng phủ toàn giao diện, tự nhớ trang đang mở. Bấm sang việc của lớp khác thì mở đúng ứng dụng đó. Bản xem thử không server dùng `?app=…`.
- **Màn chọn khu** (`/`): 3 thẻ ứng dụng + **Bắt đầu nhanh** 3 bước (tạo dự án → tạo asset từ khung → làm phim), tự đánh dấu bước đã xong và đưa nút cho bước kế tiếp.
- **Luồng không đứt đoạn:** lưu asset xong có *Tạo tiếp* (cùng khung, cùng dự án) · *Xem trong Thư viện* · *Làm phim với dự án này*; trang dự án có *Làm phim với dự án này*; Xưởng và Tạo tác nhớ **dự án dùng gần nhất**; vào Tạo tác từ một dự án thì mở tác phẩm của dự án đó (chưa có thì gợi ý đặt tên); diễn viên / bối cảnh cùng dự án xếp lên trước; Thư viện trống thì Tạo tác chỉ đường sang Xưởng.
- Cổng kiểm ở trang tạo asset: mục không chặn bản nháp (dấu nhận diện) hiện ⚠ "cần khi chuyển duyệt" thay vì ✗ đỏ.
- Giao diện hoàn thiện: logo + tên khu, thanh chuyển khu, thẻ/khung/nút/ô nhập đồng bộ, phân cảnh gọn (nút ↑ ↓ ✕), cảnh thành phẩm 2 cột.
- **Công ty: Gen Labs** (thay Afi Labs) ở license, mã nguồn, tài liệu, giao diện. **Tác giả: Ryan — 090.919.8823.** Mã thư viện (`afi.core`, `afi.khung`) giữ nguyên để không vỡ dữ liệu đã lưu.

## v0.9.1 — Vá theo review v0.9.0 (Tác phẩm)
- Rời trang Tác phẩm khi AI đang trả lời: phản hồi đến muộn không còn dựng diễn viên "mồ côi" (vòng vẽ chạy mãi).
- Một lượt AI đạo diễn / tác phẩm tại một thời điểm: Studio khoá nút gửi + nút nhanh; server trả 409 nếu lượt trước chưa xong.
- Chữ đang gõ dở (kịch bản, từng phân cảnh) không bị xoá khi AI trả lời hoặc lưu phân cảnh khác.
- Bấm một cảnh thành phẩm khi đang "Diễn toàn bộ" thì dừng vòng diễn cũ.
- `save_shot`: `remove` phải là `true` thật; `shot.id` phải là chuỗi; dàn diễn viên không được nhiều hơn số chỗ đứng của bối cảnh.
- Hiện trạng tác phẩm đưa vào prompt AI dạng JSON, ghi rõ "dữ liệu, không phải lệnh".

## v0.9.0 — Giai đoạn ③: Tạo tác — làm phim với AI đạo diễn
- **Tạo tác › Tác phẩm** — 5 khu trên một trang: **chat với AI đạo diễn** (lịch sử lưu cùng tác phẩm, kèm nhật ký tool ✓/✗; nút nhanh: viết kịch bản, chia phân cảnh, viết lời thoại, kiểm thiếu) · **kịch bản** (logline + kịch bản tổng) · **phân cảnh** (mô tả, bối cảnh, dàn diễn viên ≤ 8, lời thoại; lưu, AI viết lời thoại, diễn thử, đổi thứ tự, bỏ) · **cảnh thành phẩm** (ảnh tĩnh từng phân cảnh) · **sân khấu final** (diễn cả chuỗi: thẻ tiêu đề → bối cảnh → diễn viên sống + bóng thoại).
- **AI đạo diễn tự dùng Xưởng:** phân cảnh trỏ tới nhân vật / bối cảnh không có trong Thư viện thì cổng chặn và chỉ đường; AI tạo từ bộ khung chuẩn (`save_character` / `save_item` / `save_scene` với `project` của tác phẩm) rồi mới dùng. Mọi ghi qua cùng cổng kiểm với MCP.
- MCP thêm `list_works`, `get_work`, `save_work`, `save_shot` (29 tool) — agent ngoài làm phim y như AI trong Studio. HTTP: `/api/works`, `/api/works/:id`, `/api/works/:id/shots`, `/api/works/:id/chat`. Tác phẩm có phiên bản (bản cũ giữ ở versions/).
- Prompt đạo diễn biết 8 hướng nhìn (left90 / left135 / back…).
- Điều hướng Tạo tác: Tác phẩm · Diễn thử một cảnh · Trợ lý AI.
- Rào mới: không có method trùng tên trong class ở server (lỗi đè method im lặng); test AI giả lập đi trọn luồng tác phẩm (thiếu nhân vật → tự tạo ở Xưởng → phân cảnh → lời thoại sai thì sửa); test trình duyệt diễn cả chuỗi.

## v0.8.0 — Giai đoạn ②: tạo asset từ khung → Thư viện theo dự án chủ đề
- **Xưởng › Tạo asset mới** — 4 bước trên một trang: ① chọn khung (ma-nơ-canh · 10 khối vật phẩm · 2 sân khấu chuẩn) + dự án; ② tham số & chi tiết (linh kiện từng bộ phận, tham số, bảng màu, mắt / mày, dấu nhận diện, tính cách — vật phẩm: loại, độ hiếm, độ dài / cỡ, màu, chỉ số — bối cảnh: lớp phông, giờ, thời tiết, màu); ③ soát (nhân vật 8 hướng + 4 hoạt động; vật phẩm icon + thẻ + mặc lên ma-nơ-canh 4 góc; bối cảnh như chọn / đêm / có diễn viên); ④ cổng kiểm & lưu. Khung không bị sửa — bản của bạn là bản sao.
- **Dự án chủ đề:** mọi asset của người dùng có trường `project`. Trang **Thư viện › Dự án chủ đề** (tạo dự án, xem asset theo dự án, **tải gói dự án JSON** gồm công thức + linh kiện tự vẽ đang dùng). Thư viện nhân vật / trang bị / cảnh chia mục theo dự án; đổi dự án ngay ở khung "Dùng".
- Điều hướng theo đúng dòng chảy **Xưởng → Thư viện → Tạo tác**: Xưởng gồm Bộ khung chuẩn, Tạo asset mới, các bàn chỉnh, kho linh kiện, khung chuyển động, cổng kiểm; Tạo tác dành cho làm phim / truyện với AI.
- Server: `GET/POST /api/projects` (projects.json). MCP thêm `list_projects`, `save_project` (25 tool); `save_character` / `save_item` / `save_scene` nhận `project` (slug, kiểm chặt).
- Test: MCP dự án (tạo, lưu vào dự án, đếm, chặn id lạ); trình duyệt đi trọn luồng tạo nhân vật / vật phẩm / bối cảnh vào dự án rồi kiểm Thư viện.

## v0.7.0 — 8 hướng nhìn (2.5D)
- **Engine:** thêm góc 90° (nhìn ngang), 135° (quay lưng chéo) và sau lưng — đủ 8 hướng: `front · left45/right45 · left90/right90 · left135/right135 · back` (giữ `left/right` 3/4 nhẹ). Bên phải = lật gương; sau lưng engine tự giấu mặt, đưa vật sau lưng (áo choàng…) lên trước thân, vật cầm tay ra sau thân; 90° chỉ một mắt.
- Linh kiện thiếu góc nào thì **mượn góc gần nhất** (90° → 45°; 135° → sau lưng → 45°; sau lưng → chính diện); cổng kiểm có mục thông tin "Bản vẽ 8 hướng".
- **Khung vẽ đủ 8 hướng:** đầu, thân, chân, bàn chân ma-nơ-canh; khối mũ, áo, áo choàng, giày, che mặt. Test chặn: linh kiện khung thiếu góc nào là trượt; dựng 32 hoạt động × 10 góc không NaN.
- Linh kiện dữ liệu (MCP `save_part`) khai báo được `views.q90 | q135 | q180` = `drawn` | `same` | `front` | `hide`.
- Studio: chọn được 10 góc ở Thư viện, Tư thế & hoạt động, Bộ khung chuẩn; bàn soát linh kiện 5 góc; nút **Sprite 8 hướng** (một hàng PNG, vòng theo chiều kim đồng hồ). MCP `render_character` / `render_item` nhận 10 góc.

## v0.6.0 — Xưởng: bộ khung chuẩn không chủ đề
- **Bộ khung chuẩn** cho mọi asset (kiểu greybox của làm game), thay cho nội dung Tam Quốc:
  - **Nhân vật:** ma-nơ-canh đầu trọc, không quần áo — đủ 18 biểu cảm × 32 hoạt động × 5 góc nhìn; mọi nhân vật mới bắt đầu từ ma-nơ-canh.
  - **Vật phẩm:** 10 khối đại diện theo dáng (que dài, que ngắn, đĩa dẹt, hộp, cầu, đội đầu, khoác thân, sau lưng, giày, che mặt), có tham số, mỗi khối kèm một vật phẩm khung.
  - **Bối cảnh:** khối trời / tường, chân trời, khối nhà, nền có lưới tỉ lệ (vạch hàng trước / hàng sau), tiền cảnh, khối hộp / trụ / cây / đá / bàn / cờ; 2 sân khấu chuẩn (ngoài trời, trong nhà).
  - **Đạo cụ của hoạt động** (ghế, nệm, chiếu, chăn, bàn, nước, bát, đũa, chén, sách, bút) chuyển thành khối xám, giữ đúng vị trí theo tư thế.
  - Bảng màu mặc định xám trung tính; asset chủ đề đổi token để "thay áo".
- **Quy cách thống nhất** `docs/QUY-CACH-KHUNG.md` (kích thước, điểm gắn, lớp, góc nhìn, tham số, màu, quy trình tạo asset từ khung). Đặc tả 3 giai đoạn v3 theo lời Ryan.
- `afi.core` thành **khung lõi** (khuôn mặt, biểu cảm, chuyển động, hoạt động, thân ma-nơ-canh); khối vật phẩm / bối cảnh ở `kinds/khung/afi.khung.js`.
- **Tam Quốc đã cất** ở `archive/tamquoc/` (không nạp vào bản chạy, không nằm trong gói phát hành); sau này dựng lại như một dự án chủ đề từ khung.
- Studio: trang **Xưởng › Bộ khung chuẩn** (quy cách + ma-nơ-canh mọi góc và hoạt động + khối vật phẩm + khối bối cảnh). Thư viện không bày đồ của khung; bản cài mới có thư viện trống kèm lời dẫn.
- MCP / Trợ lý AI / Đạo diễn mặc định dùng ma-nơ-canh; toàn bộ test chuyển sang khung.

## v0.5.3 — Studio ba lớp: Thư viện · Tạo tác · Xưởng
- **Thư viện** (xanh dương): hàng mẫu Afi đã duyệt — xem, tải ảnh, chép mã.
- **Tạo tác** (xanh lá, mới): nhân vật / trang bị / cảnh của tôi, Đạo diễn AI, Trợ lý AI (chat) — nơi người dùng phối và xuất thành phẩm.
- **Xưởng** (hổ phách): chỉ còn khuôn của Afi — kho linh kiện & phông, khung tư thế & hoạt động, khung biểu cảm & động tác, cổng kiểm.
- Dòng chảy Xưởng → Thư viện → Tạo tác; `docs/QUY-TRINH-LINH-KIEN.md` mục 8 viết lại theo ba lớp.

## v0.5.2 — Hỗ trợ repo private: token cập nhật
- **`GC_GITHUB_TOKEN`** (fine-grained, chỉ Contents: Read-only): bộ cập nhật gọi API GitHub có `Authorization: Bearer`, tải gói và SHA256SUMS qua URL API của asset (`Accept: application/octet-stream`). Token **chỉ gửi tới đúng host đầu tiên** — khi GitHub chuyển hướng sang host lưu trữ, token bị bỏ. Không token thì hành vi cũ giữ nguyên.
- Repo private mà thiếu / sai token → báo lỗi rõ (nêu cách sửa), vẫn chạy bản cũ; không đoán qua trang công khai.
- `install.sh` nhận `GC_GITHUB_TOKEN`: đọc release qua API, chọn asset theo tên, tải qua URL API; token đi bằng tệp cấu hình curl (không nằm trên dòng lệnh), ghi vào `.env` (thêm dòng nếu thiếu, giữ nguyên dòng khác). Không token mà repo private → hướng dẫn tạo token.
- Lệnh mới `genchibi token [giá-trị|--clear]`: nhập ẩn (hoặc stdin) để token không vào lịch sử shell, ghi `.env`, khởi động lại. `docker-compose.yml` truyền `GC_GITHUB_TOKEN` vào container.
- Rào mới `tools/test-token.js` (GitHub giả: 404 khi thiếu token, asset redirect sang host khác — host đích mà nhận Authorization là trượt; token sai; installer; `genchibi token`; token không lọt vào trạng thái/lịch sử/output).
- README: mục "Repo private: token cập nhật".

## v0.5.1 — Vá theo review v0.5.0 (cảnh)
- Review: không có blocker; không chèn được script/markup vào SVG cảnh, không prototype pollution, không ghi đè thư viện chính thức, không path traversal.
- **Phông "Trời quang" thiếu tham số màu ở hai đám mây** → 6 cảnh mất mây và SVG chứa `NaN`/`undefined`. Đã sửa; **rào mới**: test quét mọi cảnh × giờ × thời tiết và mọi phông × giờ, cấm `NaN`, `undefined`, `null`, `[object`, `Infinity`.
- **Mã nhúng web**: JSON trong `<script>` được escape (`<` `>` `&` U+2028/2029) — tên do agent đặt chứa `</script>` không thoát ra trang của người dùng. Test hồi quy trên trình duyệt.
- Đạo diễn: `spot` chỉ dùng khi có `scene`, phải là chỗ đứng cảnh mở, hai diễn viên không đứng cùng chỗ; Studio báo khi diễn viên nhiều hơn chỗ đứng.
- Sân khấu đạo diễn dựng hai lớp (nền sau diễn viên · lớp trước: đạo cụ trước, tiền cảnh, thời tiết, màu giờ) — hết nhuộm màu giờ hai lần, đúng thứ tự như ảnh tĩnh.
- `render_scene` giờ / thời tiết lạ → lỗi rõ ràng; lỗi cảnh tối đa 20 dòng, giá trị lặp lại bị cắt (không khuếch đại dữ liệu); mô tả cảnh không tạo dòng giả trong prompt đạo diễn; id gradient trời theo giờ (bàn soát ngày/đêm không lẫn); tra chỗ đứng qua `own()`.

## v0.5.0 — Loại asset thứ ba: cảnh · Studio tách Thư viện / Xưởng
- **Cảnh** = phối phông có sẵn theo 6 lớp (trời, cảnh xa, công trình, mặt đất, đạo cụ, tiền cảnh) + bảng màu + giờ (ngày / bình minh / hoàng hôn / đêm) + thời tiết (mưa, tuyết, hoa rơi, lá bay, sương, đom đóm). Phông chỉ dùng token màu cảnh nên đổi giờ không phải vẽ lại.
- Thư viện chính thức `afi.scenes`: 27 phông → 8 cảnh (Thảo lư Long Trung, Doanh trại lúc chiều, Dưới chân thành, Bờ sông Xích Bích, Thư phòng, Rừng trúc đêm, Vườn đào, Núi tuyết). Rào test: mọi phông chính thức phải được ít nhất một cảnh dùng.
- **Chỗ đứng chuẩn của engine** (8 chỗ, hai hàng): mọi dàn diễn viên đặt được vào mọi cảnh, dựng bằng đúng khung nhân vật (45°, 32 hoạt động, trang bị). Từ hai diễn viên, ai chưa chọn góc tự quay 45° về giữa. Ngân sách: diễn viên ≤ 8, đạo cụ ≤ 10, hạt thời tiết ≤ 60; mưa/tuyết có hạt giống → ảnh ổn định.
- **Một cổng ghi**: `saveSceneChecked` cho MCP (4 tool mới — 23 tool), `POST /api/scenes` và AI trong chatroom. Phông mới đi qua chính `get_part_spec` → `preview_part` (bàn soát ngày/đêm kèm diễn viên) → `save_part`, cùng bộ lọc SVG an toàn với token màu cảnh. Không ghi đè cảnh chính thức.
- **Đạo diễn AI diễn trong cảnh**: kịch bản có `"scene"`, mỗi bước có `"spot"`; Studio đặt diễn viên đúng chỗ, phủ màu giờ.
- **Studio tách hai khu**: **Thư viện** (xanh) — thành phẩm duyệt theo nhóm (Chính thức / Của tôi… rồi phe / loại / ngoài trời–trong nhà), xem biến thể và **lấy về dùng**: ảnh (SVG, PNG, avatar, sprite 18 biểu cảm, icon/thẻ item, cảnh 1280/1920, nền trống) và mã (mã tham chiếu, lệnh MCP, mã nhúng web, SVG, JSON công thức). **Xưởng** (hổ phách) — bàn phối nhân vật / trang bị / cảnh, kho linh kiện & phông (bàn soát phông), khung tư thế & biểu cảm, Xưởng AI, Đạo diễn AI, cổng kiểm. Trang "Xuất bản" cũ gộp vào khu Dùng của Thư viện.
- `docs/QUY-TRINH-LINH-KIEN.md`: mục 7 có hai ví dụ (item, cảnh) + chuẩn phông; mục 8 mới: Thư viện và Xưởng.

## v0.4.1 — Vá độ bền cho item (review v0.4.0)
- Review bảo mật v0.4.0: **không có lỗ hổng** (escape chữ, hex, prototype, path traversal, ghi đè chính thức đều đứng vững). Vá 4 điểm độ bền:
- Item bị lưu lại sang bộ phận khác không còn làm vỡ nhân vật đang mặc nó (engine bỏ qua item lệch bộ phận); cổng ghi chặn đổi bộ phận của item đã lưu — muốn đổi thì tạo id mới.
- `equip.part` không phải chuỗi → báo lỗi rõ ràng thay vì lỗi nội bộ.
- Lọc ký tự điều khiển trong tên / Hán tự / mô tả / truyền thuyết (trước đây làm thẻ SVG hỏng).
- `render_item` chế độ `equipped` mặc thử được **item nháp chưa lưu** (đăng ký tạm, xoá ngay sau khi dựng).
- Test hồi quy cho cả 4 điểm.

## v0.4.0 — Loại asset thứ hai: item trang bị
- **Item trang bị** = phối: trỏ tới linh kiện có sẵn + bảng màu riêng (chỉ áp lên linh kiện đó) + tham số + độ hiếm + chỉ số. Một linh kiện cho nhiều phẩm cấp (Đao sắt thường ↔ Thanh Long Yển Nguyệt Đao huyền thoại) — không vẽ thêm.
- Từ vựng đóng: 8 loại (vũ khí, tay phụ, pháp khí, mũ/khăn, giáp/áo, áo choàng, giày, mặt nạ) → bộ phận mặc; 5 độ hiếm; 6 chỉ số.
- **Tự đứng được**: icon theo độ hiếm và thẻ item (tên, Hán tự, loại, độ hiếm, chỉ số, mô tả). Khung icon là thuộc tính của linh kiện (`part.icon`) — vẽ một lần, mọi item dùng chung.
- **Mặc được**: nhân vật có `look.equip.<slot>`; mọi thứ của khung tự áp dụng (45°, 32 hoạt động, bàn soát, trait theo linh kiện).
- Thư viện chính thức `afi.items`: 13 item (Thanh Long đao, Xà mâu, Đao sắt, Thương gỗ, Kiếm sắt, Quạt lông vũ, Bầu rượu, Khăn cuốn, Khăn chiến đỏ, Giáp đồng, Giáp bạc Thường Sơn, Áo choàng đỏ, Ủng da).
- **Một cổng ghi**: `saveItemChecked` cho MCP (4 tool mới: `list_items`, `validate_item`, `save_item`, `render_item` — 19 tool), HTTP `POST /api/items` và AI trong chatroom. Item chính thức không bị ghi đè — sửa sẽ tạo bản trong "Của tôi".
- Studio › **Trang bị**: lưới icon theo loại, thẻ, mặc thử lên mọi nhân vật (chính diện / 45° / tấn công / chạy), sửa độ hiếm, linh kiện, bảng màu, chỉ số.
- Linh kiện dữ liệu (agent tạo) khai báo được khung icon.
- `docs/QUY-TRINH-LINH-KIEN.md` mục 7: **quy trình thêm một loại asset** (8 phần), item là ví dụ mẫu.

## v0.3.1 — Vá bảo mật cho tạo linh kiện (review v0.3.0)
- **ReDoS** (cao): regex kiểm `transform` có thể bị chuỗi ~1 300 ký tự làm treo server (mọi lối ghi, kể cả link MCP). Viết lại không chồng lấn; gộp khoảng trắng trước khi tách thẻ để bộ lọc chạy tuyến tính.
- **MCP / AI trong chatroom không còn ghi đè được nhân vật của thư viện chính thức** (trước đây truyền `pack: "afi.tamquoc"` là đè được). Chỉ Studio của chủ máy được lưu bản chỉnh trong thư viện chính thức.
- Bảng tra của bộ lọc không còn dính prototype (`constructor`…); chặn thuộc tính lặp; token màu chỉ nhận hex; lỗi trong tool không làm hỏng cả lượt AI.
- Linh kiện của người dùng không được trùng id với linh kiện chính thức cùng bộ phận.
- Test hồi quy cho cả 5 điểm.

## v0.3.0 — Tạo linh kiện qua MCP + một cổng ghi duy nhất cho mọi agent
- **Linh kiện dạng dữ liệu**: agent/người dùng tạo linh kiện bằng SVG thuộc tập con an toàn (path, circle, ellipse, rect, line, polyline, polygon, g), màu là hex hoặc token bảng màu `{robe}`. Engine đọc rồi dựng lại SVG — chặn script, on*, url(), style, href, image, text, comment, entity (16 kiểu tấn công trong test). Bắt buộc khai báo 45°: `drawn` | `same` | `face45` | `body45`.
- **3 tool MCP mới** (15 tool): `get_part_spec` (khung sườn dạng máy đọc + ví dụ), `preview_part` (bàn soát: ma-nơ-canh × 4 góc × 4 tình huống, một ảnh SVG), `save_part` (lưu vào "Của tôi", có phiên bản). Nhân vật dùng ngay qua `look.parts.<slot> = "local.my/<id>"`.
- **Một cổng ghi duy nhất**: MCP, API HTTP của Studio (`PUT /api/assets`, `POST /api/parts`) và AI trong chatroom cùng đi qua `saveAssetChecked` / `savePartChecked`. Trước đây `PUT /api/assets` lưu thẳng không qua cổng kiểm — đã đóng.
- **Luật chặn chung** `GC.blockingGates`: lỗi cấu trúc/an toàn chặn mọi trạng thái; dấu nhận diện bắt buộc khi chờ duyệt / đã duyệt.
- **Xưởng AI (chat)** trong Studio: AI chạy bằng LLM API của người dùng nhưng chỉ làm việc qua đúng bộ tool MCP (trừ cập nhật/rollback app), cùng chỉ dẫn; hiện từng lượt gọi tool và ảnh bàn soát/dựng hình.
- Cổng nhận diện so theo mã linh kiện (khớp cả `ci-hat` lẫn `local.my/ci-hat`).
- Test mới: bộ lọc SVG (tấn công), luồng MCP tạo linh kiện → phối → dựng 45°, `tools/test-agent.mjs` (AI chatroom với LLM giả lập đi đúng cổng).

## v0.2.3 — Phủ đủ 45° + quy trình tạo lập linh kiện
- **Toàn bộ 24 linh kiện chính thức có bản 45° vẽ thật** (thêm: tóc búi, tóc dựng, râu ba chòm, râu hổ, râu dài mảnh, khăn buộc trán, mũ vải mềm, mũ quan, áo bào, giáp trận, áo choàng, 3 mặt nạ kinh kịch) → cả 5 nhân vật tự đủ 45° mà không sửa nhân vật nào.
- **Công cụ chiếu 45° dùng chung** `GC.helpers.face45` (chi tiết bám mặt, cùng phép chiếu với mắt/miệng của engine) và `body45` (chi tiết trên thân, dồn về đường giữa áo mới).
- **Quy trình tạo lập linh kiện** thành chuẩn: `docs/QUY-TRINH-LINH-KIEN.md` (khung sườn, góc nhìn, công cụ, 6 bước tạo).
- **Bàn soát linh kiện** (Studio › Thư viện linh kiện › bấm một linh kiện): mặc lên ma-nơ-canh chuẩn × 4 góc nhìn × đứng/kinh ngạc/chạy/ngồi + bảng kiểm (45°, tham số, license, nguồn). Thư viện xem trước bằng ma-nơ-canh, không dựa vào nhân vật cụ thể.
- **Rào tự động**: test chặn phát hành khi linh kiện chính thức thiếu bản 45°, license hoặc nguồn.

## v0.2.2 — Góc nghiêng 45° vẽ thật (ở mức linh kiện)
- **Trục góc nhìn trong hệ linh kiện**: linh kiện có thể kèm bản vẽ `views.q45`; nhân vật phối linh kiện nào cũng tự có 45° (`view: left45 | right45`). Bản chuẩn quay mặt sang trái màn hình, 45° phải = lật gương.
- Linh kiện chưa có bản 45°: engine tự trượt parallax (φ = 32°) để vẫn dùng được. Cổng kiểm **"Bản vẽ nghiêng 45°: x/y linh kiện"** cho biết còn thiếu linh kiện nào; Thư viện linh kiện gắn nhãn "45°".
- Vị trí mặt 45° (mắt gần/xa, mày, miệng) thuộc engine → mọi kiểu mắt/mày/miệng đều hưởng. Hiệu ứng bám mặt (nước mắt, má hồng, mặt tái, bong bóng) tự ánh xạ theo mắt gần/xa. Tay đưa lên mặt (che miệng, vuốt râu, uống) tự đi theo miệng.
- Bản vẽ 45° đã có: dáng đầu tròn / hàm vuông / trái xoan (tai phía gáy nằm trên đầu), mái gọn, tóc dài sau lưng, râu dê, quần ống gọn, ủng, khăn cuốn, áo hạc sưởng → **Gia Cát Lượng đủ bộ 45° vẽ thật**.
- Studio: chọn góc 45° trái/phải; sân khấu báo linh kiện nào đang dùng bản trượt. MCP: `get_catalog` liệt kê `views` của từng linh kiện, `render_character` nhận `left45/right45`.
- Test: 32 hoạt động × mọi nhân vật × 3 thời điểm × 2 hướng × 5 góc nhìn; khẳng định bộ Gia Cát Lượng phủ đủ 45°.

## v0.2.1 — Góc nghiêng 3/4
- **Góc nhìn 3/4** (`view: front | left | right`, theo màn hình) cho mọi nhân vật, không vẽ lại linh kiện: quay kiểu parallax trên mặt cầu (x = R·sin(θ − φ)) — mắt xa hẹp lại, mắt gần rộng ra, miệng/râu/mái trượt theo, tóc sau và tai trượt ngược, thân quay ít hơn đầu, phía sau đầu lộ tóc (lưỡi liềm tóc tới ngang tai), tay phía xa lùi ra sau thân khi đang buông.
- Đang di chuyển mà chưa chọn góc: tự nghiêng 3/4 về hướng đi.
- Studio › Tư thế & hoạt động: chọn góc nhìn (Tự động · Chính diện · 3/4 trái · 3/4 phải); Đạo diễn AI và MCP `render_character` nhận `view`.
- Test: 32 hoạt động × mọi nhân vật × 3 thời điểm × 2 hướng × 3 góc nhìn.

## v0.2.0 — Tư thế & hoạt động (engine 0.3)
- **Khung xương có chân**: hông, đùi, gối, cổ chân; vạt áo tách khỏi thân trên và co giãn theo tư thế. Thêm khớp sân khấu cho đạo cụ đứng yên.
- **Ghép 4 trục** như animation layer của game engine: tư thế nền × di chuyển × động tác tay × biểu cảm, cộng đạo cụ và hướng (quay trái/phải).
  - 12 tư thế: đứng, đứng tấn, ngồi ghế, ngồi xếp bằng, quỳ, ngồi xổm, co rúm, nằm, bò, trên không, bay, bơi.
  - 10 di chuyển: đi, chạy, rón rén, nhảy, bò, bơi, bay lượn, lơ lửng, run rẩy, nhún nhảy.
  - 15 động tác mới: ăn, uống, đọc, viết, chém, đâm, đỡ, ôm đầu, vẫy, chỉ, cúi chào, ôm quyền, cổ vũ, vung tay, thả lỏng.
  - 11 đạo cụ (ghế, nệm, chiếu + gối, chăn, bàn, mặt nước, bát, đũa, chén, sách, bút lông) và 5 hiệu ứng (bụi chân, vệt tốc độ, gió, bọt nước, run).
  - **32 hoạt động đặt sẵn** theo nhóm Tư thế · Di chuyển · Sinh hoạt · Chiến đấu · Cảm xúc · Giao tiếp — agent gọi theo tên (`eat`, `sleep`, `attack`, `flee`…).
- Bóng đổ co lại khi nhảy/bay, giãn khi nằm; chữ hiệu ứng (Zzz, !!) luôn đứng thẳng và đọc xuôi kể cả khi nằm hoặc quay trái.
- Studio: trang **Tư thế & hoạt động** — lưới hoạt động theo nhóm, sân khấu ghép tự do từng trục, tải SVG khung hình.
- Đạo diễn AI và MCP: mỗi cảnh nhận `activity`, `posture`, `move`, `facing`; `get_catalog` liệt kê hoạt động/tư thế/di chuyển/đạo cụ; `render_character` dựng theo hoạt động và theo thời điểm `t` trong chu kỳ.
- Cổng kiểm "Dựng đủ hoạt động" (chạy ở hồ sơ asset, khi lưu qua MCP, trong test — không chạy ở danh sách để giữ nhanh với hàng trăm nhân vật).

## v0.1.9
- Bảo mật `genchibi expose`: chỉ nhận `cert.pem` trình duyệt tải về **sau** khi lần đăng nhập bắt đầu (đúng tên, tệp thường) và hỏi xác nhận trước khi dùng — không còn tự lấy tệp có sẵn trong thư mục Tải xuống (tránh tệp bị cài sẵn đưa tunnel sang tài khoản Cloudflare khác).

## v0.1.8
- `genchibi expose`: bước đăng nhập Cloudflare chịu lỗi — tự thử lại 3 lần khi hết 1 phút chờ bấm Authorize, tự nhận `cert.pem` trình duyệt đã tải về (thư mục Tải xuống, 2 giờ gần đây), dùng lại chứng chỉ có sẵn; chỉ in link cần mở, không in đường dẫn bên trong container.

## v0.1.7
- Sửa: cài đặt và tự cập nhật lỗi 403 khi GitHub API hết lượt gọi của IP (giới hạn 60 lượt/giờ, mạng dùng chung IP hay gặp). Giờ tự chuyển sang đọc bản mới nhất từ trang `github.com/.../releases/latest` và tải gói trực tiếp; vẫn kiểm SHA-256 như cũ.

## v0.1.6
- **`genchibi expose <tên-miền>`**: một lệnh mở MCP ra Internet qua Cloudflare Tunnel — tạo tunnel, trỏ DNS (không ghi đè bản ghi có sẵn trừ khi thêm `--overwrite-dns`), chỉ cho đường `/mcp` đi qua, sinh khoá, khởi động lại, thử gọi qua Internet và in link. Thêm `--quick` (link tạm trycloudflare), `--rotate`, `--off`; `genchibi link [--check]`. Docker: tunnel là container `gen-chibi-tunnel` tự bật lại cùng app.
- **Link MCP có khoá** `/mcp/<GC_MCP_KEY>`: agent dán link là nối được, không cần header (Claude web/desktop Connectors, Cursor…). Link chỉ cấp quyền MCP; sai khoá trả 404. Qua link chỉ được kiểm và cập nhật bình thường; `rollback_app` và `force` cần token chủ máy hoặc stdio (chống xoá vòng backup bằng rollback lặp).
- **MCP tự cập nhật**: tool `get_app_version`, `update_app`, `rollback_app` — agent tự kiểm và cập nhật từ GitHub Releases (SHA-256, sao lưu, tự rollback khi bản mới lỗi). MCP có 12 tool.
- Studio › Cài đặt AI: hiện link MCP, nút sao chép link và lệnh Claude Code.
- CLI `genchibi` đi theo bản cài: lệnh mới đến cùng bản cập nhật (cài lại một lần từ v0.1.5 trở về trước). `genchibi start` đồng bộ `docker-compose.yml` theo bản đang chạy.
- `GC_ALLOWED_HOSTS` nhận tên con dạng `*.trycloudflare.com`.
- Bảo mật tunnel: chứng chỉ tài khoản Cloudflare (`cert.pem`) chỉ dùng lúc thiết lập rồi xoá — container tunnel chỉ giữ khoá của riêng tunnel; tên miền được kiểm chặt trước khi ghi `.env`; link không lộ trong danh sách tiến trình khi kiểm.
- Test: `tools/test-auth.sh` 16 ca (link, wildcard host); `tools/test-update.sh` thêm bước agent cập nhật qua MCP (16 ca).

## v0.1.5
- Bảo mật (sửa v0.1.4): khi có `GC_API_TOKEN`, **mọi** `/api` (trừ `/api/health`) và `/mcp` đều cần token — không còn miễn cho Host `localhost`, vì tunnel có thể đổi Host thành localhost và chạy trên chính máy này. So token bằng thời gian hằng.
- Bảo mật: chưa có token mà request đi qua tunnel/reverse proxy (`X-Forwarded-For`, `Forwarded`, `Cf-Connecting-Ip`, `X-Real-Ip`) thì từ chối toàn bộ — app không bao giờ lộ ra Internet khi chưa khoá.
- Studio: màn đăng nhập bằng token cho bản cài có khoá (giữ trong trình duyệt), báo token sai.
- README: hướng dẫn mở MCP qua tunnel/tên miền riêng.

## v0.1.4
- Sửa lỗi: mắt của mọi nhân vật đứng yên khi đầu nghiêng/nhún. Nguyên nhân: animation chớp mắt (CSS `transform`) đặt trên chính nhóm lớp `eyes` nên đè mất transform của khung xương. Giờ chớp mắt chạy trên nhóm con `.gc-eyes`.
- Mở MCP qua tunnel/tên miền riêng: khi đã đặt `GC_API_TOKEN`, `/mcp` luôn cần token; `/api` chỉ cần token khi truy cập qua tên miền ngoài. Studio mở bằng `localhost` vẫn dùng như cũ.
- Test: luật cấu trúc chặn CSS animation/transform trên nhóm lớp `[data-l]`; `tools/test-browser.mjs` kiểm mọi lớp gắn vào đầu đi cùng đầu (Chromium).

## v0.1.3
- Studio: dải báo "Có bản mới" trên mọi trang, bấm để xem ghi chú và cập nhật.
- `genchibi start` gọn hơn với Docker.

## v0.1.2
- Mạng có proxy: tự cập nhật và gọi LLM đi qua `HTTPS_PROXY` (tôn trọng `NO_PROXY`, hỗ trợ proxy có mật khẩu và chứng chỉ CA bổ sung). Trước đây Node bỏ qua proxy nên máy sau proxy công ty không cập nhật được.
- `install.sh` ghi cấu hình proxy và CA của máy vào `.env`.

## v0.1.1
- MCP: `get_character` và `render_character` nhận cả id ngắn (vd. `trieu-van`), không bắt buộc key đầy đủ.
- Bảo mật: không có token thì server chỉ phục vụ kết nối từ chính máy này (kiểm địa chỉ thật, không tin header Host); CLI từ chối chạy khi mở ra mạng mà thiếu `GC_API_TOKEN`.
- Phát hành tự động khi `VERSION` trên `main` thay đổi.

## v0.1.0
Bản MVP đầu tiên.
- Engine 0.2: khung xương có khuỷu tay, thư viện theo nhóm (pack), kế thừa 4 tầng (kho → trait → nhân vật → đạo diễn), tham số linh kiện.
- Thư viện chính thức `afi.core` (18 biểu cảm, 28 động tác, 21 hiệu ứng) và `afi.tamquoc` (5 tướng).
- Tầng vẽ có ngân sách: ảnh cache cho danh sách, thở bằng CSS cho avatar, diễn đủ tối đa 8 nhân vật.
- Studio: quản lý nhân vật, chỉnh linh kiện + tham số + màu, ghi đè biểu cảm, phiên bản, xuất SVG/PNG/sprite sheet.
- Đạo diễn AI qua LLM API (OpenRouter, DeepSeek, MiniMax, tuỳ chỉnh), có kiểm tra model.
- MCP server (HTTP + stdio) cho agent.
- Cài một lệnh, tự cập nhật từ GitHub Releases, sao lưu trước khi cập nhật, tự rollback.
