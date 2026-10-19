# Quy trình tạo lập linh kiện — chuẩn nhà xưởng gen-chibi

> Giá trị của nhà xưởng là **khung sườn + quy trình**, không phải từng nhân vật.
> Nhân vật = phối linh kiện. Một linh kiện tốt dùng được cho hàng trăm nhân vật, ở mọi biểu cảm, tư thế, góc nhìn.

## 1. Khung sườn (bất biến — mọi linh kiện phải theo)

| Thành phần | Quy ước |
|---|---|
| Khung vẽ | 200 × 240, mặt đất y = 228, tâm thân x = 100 (`RIG.box`) |
| Khớp | `stage` (đạo cụ, đứng yên) · `root` → `pelvis` → `body` → `head` / `arm·fore·hand` L,R · `hem` (vạt) · `thigh·shin·foot` L,R |
| Neo | `RIG.anchors`: mắt (80,108)/(120,108), miệng (100,131), cằm (100,146), tay (72,193)/(128,193)… — vẽ theo neo, không theo nhân vật |
| Lớp | Một linh kiện trả về `{ lớp: svg }`; lớp quyết định thứ tự vẽ và khớp gắn (`RIG.layers`). Ví dụ trang phục: `body` (thân trên tới thắt lưng y=194), `hem` (vạt dưới, mép trên giấu dưới đai), `arm/fore L,R` (tay áo) |
| Màu | Chỉ dùng bảng màu `C.P.*` (skin, hair, robe, trim, accent…) — nhân vật đổi màu không cần vẽ lại |
| Nét | Viền ngoài 2.6–3.2 (`stroke()`), chi tiết trong 1.4–2, bóng đen 8–14 % (`shadow()`) |
| Tham số | `params`: scale / scaleX / scaleY / dx / dy quanh `pivot`, có min–max — AI và người chỉnh trong khoảng an toàn |

## 2. Góc nhìn (trục bắt buộc của mọi linh kiện chính thức)

- **Chính diện** — `draw(C, st, vals)`.
- **45° vẽ thật** — `views.q45(C, st, vals)`. Bản chuẩn **quay mặt sang trái màn hình** (tay phải màn hình ở phía gần); 45° phải = engine lật gương.
- **90° / 135° / sau lưng** (8 hướng, v0.7.0) — `views.q90` (nhìn ngang), `views.q135` (quay lưng chéo), `views.q180` (sau lưng). Cùng quy ước quay sang trái; bên phải = lật gương. Thiếu thì engine **mượn góc gần nhất** (q90 → q45; q135 → q180 → q45; q180 → chính diện). Linh kiện **của khung** phải đủ cả 4 (test chặn).
  Ở góc lưng engine tự giấu mặt, đưa vật sau lưng lên trước thân, vật cầm tay ra sau thân. Linh kiện dữ liệu khai báo `views.q90|q135|q180` = `drawn` (kèm layers) | `same` (= bản 45°) | `front` | `hide`.
- **3/4 nhẹ** — engine tự trượt parallax, không cần vẽ.
- Thiếu `q45`: engine trượt tạm (φ = 32°) để vẫn dùng được, cổng kiểm báo thiếu. **Thư viện chính thức không được thiếu** (test chặn phát hành).

Engine lo phần chung — linh kiện **không** tự xử lý:
vị trí mắt/mày/miệng ở 45° (`GC.Q45`), hiệu ứng bám mặt (`fx.face = true` → tự ánh xạ), tay đưa lên mặt đi theo miệng, tay xa ra sau thân, lật gương, đảo chiều nghiêng thân, tư thế × di chuyển × động tác.

## 3. Công cụ chiếu 45° (`GC.helpers`)

| Loại chi tiết | Công cụ | Ví dụ |
|---|---|---|
| Bám lên mặt (râu, ria, hoa văn mặt nạ) | `face45(C, svg, clipHead?)` — nửa xa nén theo mắt xa, nửa gần dịch theo mắt gần, cùng phép chiếu với mắt/miệng | râu ba chòm, râu hổ, mặt nạ kinh kịch |
| Trên thân (cổ áo, đai, giáp ngực, đường giữa vạt) | `body45(svg, TORSO_UP \| HEM)` — dồn về đường giữa mới x = 88, cắt theo dáng | áo bào, giáp trận |
| Có dáng riêng (tóc, mũ, khăn, áo choàng, giày) | **vẽ tay** theo bản chuẩn quay trái: phía gáy (phải) lộ tóc/khối sau, chi tiết giữa dịch trái, mặt bên tối hơn | khăn cuốn, mũ quan, tóc dựng |
| Không đổi khi quay (ống quần chibi…) | khai báo `views.q45 = draw` — nói rõ là đã soát | quần ống gọn |

### Linh kiện DỮ LIỆU dùng được đủ các công cụ trên (v0.13)
Linh kiện của agent / người dùng là dữ liệu SVG, không gọi được hàm — nên khung cho ba thứ thay thế, đều qua bộ lọc an toàn:

| Cần | Viết trong dữ liệu | Engine làm lúc dựng |
|---|---|---|
| Phủ kín đầu theo đúng dáng (mặt nạ, sơn mặt, mảng tóc sau gáy) | `<path d="{shape}" …/>` | thay bằng viền đầu thật của nhân vật — tròn / vuông / oval, đúng góc nhìn đang dựng |
| Chi tiết bám mặt ở góc nghiêng | `<g class="gc-f45">…</g>` · cắt theo đầu: `gc-f45c` | `face45` (cắt bằng viền đầu với `gc-f45c`) |
| Chi tiết trên thân / vạt ở góc nghiêng | `<g class="gc-b45t">…</g>` · vạt: `gc-b45h` | `body45` với `TORSO_UP` / `HEM` |
| Mặt nạ tô kín vùng mắt | `"eyeArea": "#rrggbb"` | màu vùng quanh mắt |
| Binh khí dài | `"tall": true` (· `"upright": false` nếu không dựng thẳng theo cổ tay) | cất khi động tác cần hai tay |

Đánh dấu chiếu chỉ hợp lệ trên `<g>` trong `views.*` (bản chính diện không chiếu); `{shape}` chỉ ở `d` của linh kiện nhân vật (phông cảnh không có đầu).
Mẫu thật: bộ chủ đề Tam Quốc (`studio/mau/tam-quoc.json`) — 26 linh kiện nhân vật dữ liệu, dựng lại từ bộ v0.5 viết bằng code bằng `archive/tamquoc/port.js`, đạt cùng chất lượng 45° và có thêm bản 135° / sau lưng cho tóc.

## 4. Các bước tạo một linh kiện

1. **Chọn bộ phận + lớp**: linh kiện thuộc slot nào (`hat`, `outfit`…), trả về lớp nào. Không tạo lớp mới nếu lớp có sẵn đủ dùng.
2. **Vẽ chính diện** theo neo và bảng màu; khai báo `params` nếu có biến thể (độ cao mũ, độ dài râu…).
3. **Vẽ 45°** bằng công cụ ở mục 3 (ưu tiên `face45` / `body45`; vẽ tay khi linh kiện có dáng riêng).
4. **Soát trên ma-nơ-canh**: Studio › Thư viện linh kiện › bấm linh kiện → Bàn soát (5 góc: chính diện · 45° · 90° · 135° · sau lưng × đứng, kinh ngạc, chạy, ngồi). Không soát trên một nhân vật cụ thể.
5. **Cổng kiểm + test**: `bash tools/test.sh` (license, tham số, dựng đủ 18 biểu cảm × 32 hoạt động × 2 hướng × 10 góc nhìn, phủ đủ 45°; linh kiện khung đủ 8 hướng).
6. **Phát hành**: đổi `VERSION` + `CHANGELOG.md`, đẩy `main` — CI tạo Release, các bản cài tự cập nhật.

## 5. Nhân vật = phối, không vẽ

Nhân vật chỉ là công thức JSON: chọn linh kiện + tham số + màu + nét riêng (`expressions`, `identity`). Muốn nhân vật có thêm khả năng (góc nhìn, tư thế mới…) → **bổ sung linh kiện / khung**, không sửa nhân vật.

## 6. Một cổng ghi duy nhất — mọi agent dùng cùng chuẩn

Ba lối vào, **một** cổng: không có đường nào ghi thẳng vào kho.

| Ai tạo | Đi qua | Cổng kiểm |
|---|---|---|
| Agent ngoài (Claude Code, Claude web/desktop, Cursor…) | MCP — 53 tool (`genchibi agent tools`) | `saveAssetChecked` / `savePartChecked` |
| AI trong chatroom Studio (LLM API: OpenRouter, DeepSeek, MiniMax…) | Vòng function-calling trên **đúng bộ tool MCP** (trừ tool hệ thống và tool giọng AI tốn lượt — `render_voice`, `design_voice`: chỉ chủ máy), cùng chỉ dẫn MCP | như trên |
| Người dùng Studio / gọi API HTTP | `PUT /api/assets`, `POST /api/parts` → cùng hai hàm | như trên |

- Luật chặn duy nhất `GC.blockingGates`: lỗi cấu trúc/an toàn (linh kiện lạ, license, tham số, không dựng được biểu cảm/hoạt động) chặn ở mọi trạng thái; dấu nhận diện bắt buộc khi **Phát hành** (nháp dùng ngay trong dự án, không cần dấu nhận diện — quyết định Q3 ngày 2026-10-18).
- Linh kiện của agent là **dữ liệu SVG** (tập con an toàn, token màu) — engine đọc rồi dựng lại, kiểm lại cả khi Studio nạp.
- Tool `preview_part` trả bàn soát; `get_part_spec` trả chính khung sườn này ở dạng máy đọc được — agent luôn nhận chuẩn từ hệ thống, không tự đoán.
- Test `tools/test-agent.mjs` dùng LLM giả lập để khẳng định: AI chỉ ghi qua tool, SVG độc bị chặn, tool hệ thống bị từ chối, API HTTP không lách được cổng.

## 7. Thêm một LOẠI asset (hai ví dụ mẫu: item trang bị, cảnh)

Một loại asset mới không phải "một bộ vẽ mới" mà là **một cách phối mới trên cùng khung**. Đủ 8 phần thì cắm vào nhà xưởng:

| # | Phần | Item trang bị | Cảnh |
|---|---|---|---|
| 1 | **Từ vựng đóng** (enum) | `GC.ITEM`: loại → bộ phận mặc, độ hiếm, chỉ số | `GC.SCENE`: 6 lớp phông, 8 chỗ đứng, 4 giờ, 7 thời tiết, token màu cảnh, ngân sách |
| 2 | **Dữ liệu phối, không vẽ lại** | trỏ tới linh kiện có sẵn + bảng màu riêng + tham số; một linh kiện → nhiều item | trỏ tới phông có sẵn theo lớp (+ dịch, lật) + đạo cụ (vị trí, cỡ, lớp sâu) + bảng màu + giờ + thời tiết; 27 phông → 8 cảnh, đổi giờ chỉ đổi token |
| 3 | **Hàm kiểm** (`check…`) | `checkItem` | `checkScene` (phông có thật đúng lớp, hex theo token cảnh, số kẹp khoảng, chữ thuần), `checkCast` (dàn diễn viên) |
| 4 | **Cổng kiểm** (`…Gate`) | `itemGate`: dữ liệu, license, 45° (thông tin), dựng được | `sceneGate`: dữ liệu, license phông, dựng được, **đặt được diễn viên ở mọi chỗ đứng**, ngân sách (thông tin) |
| 5 | **Tự đứng được** | `itemSvg`: icon, thẻ | `sceneSvg`: ảnh 640×360 (nền trống hoặc có diễn viên) |
| 6 | **Nối với loại khác** | nhân vật mặc qua `look.equip.<slot>` | nhân vật đứng vào **chỗ đứng chuẩn của engine** (`cast`), dựng bằng đúng `svgBody` → đủ 45°, hoạt động, trang bị; kịch bản đặt vào cảnh bằng `event.scene` + `step.spot` |
| 7 | **Một cổng ghi** | `saveItemChecked` (MCP, `POST /api/items`, AI chatroom) | `saveSceneChecked` (MCP `list_scenes` / `validate_scene` / `save_scene` / `render_scene`, `POST /api/scenes`, AI chatroom); phông mới đi qua chính `get_part_spec` → `preview_part` → `save_part` của linh kiện |
| 8 | **Studio + test** | Thư viện › Trang bị; Xưởng › Bàn phối trang bị; test với mẫu hợp lệ làm mốc | Thư viện › Cảnh; Xưởng › Bàn phối cảnh + Kho linh kiện & phông; test với mẫu hợp lệ làm mốc + **rào "phông chính thức phải được ít nhất một cảnh dùng"** |

### Phông cảnh (nguyên liệu của cảnh)
- Khung 640×360. `sky` / `far` / `mid` / `ground` / `front` vẽ trên cả khung (chân trời ≈ y 230–260, mặt đất từ y ≈ 258); `deco` (đạo cụ) vẽ quanh gốc (0,0) = chân vật, cao lên phía y âm — engine đặt theo x, y, cỡ, lật.
- Chỉ dùng **token màu cảnh** (`{sky}`, `{grass}`, `{wood}`…) — đổi giờ (đêm, hoàng hôn) và bảng màu riêng của từng cảnh không phải vẽ lại. Không dùng token nhân vật.
- Phong cách phẳng, mềm, viền mảnh hoặc không viền: nhân vật viền đậm phải nổi lên trên phông.
- Thứ tự vẽ: trời → (sao khi đêm) → cảnh xa → (sương) → công trình → mặt đất → đạo cụ sau → hàng sau → đạo cụ giữa → hàng trước → đạo cụ trước → tiền cảnh → thời tiết → màu giờ → (đom đóm).
- Ngân sách (L-42): cảnh là tầng ảnh (SVG tĩnh); diễn viên ≤ 8, đạo cụ ≤ 10, hạt thời tiết ≤ 60; mưa/tuyết sinh bằng số giả ngẫu nhiên có hạt giống → cùng cảnh luôn ra cùng ảnh (cache ổn định).

## 8. Ba lớp — ba ứng dụng: Xưởng · Thư viện · Tạo tác (đặc tả: `docs/spec/DAC-TA-3-GIAI-DOAN.md`)

| | **Xưởng** `/xuong` | **Thư viện** `/thu-vien` | **Tạo tác** `/tao-tac` |
|---|---|---|---|
| Là gì | bộ khung chuẩn (không chủ đề) + nơi **tạo asset từ khung** | asset đã qua cổng kiểm, **xếp theo dự án chủ đề** | **Tác phẩm**: làm phim / truyện với AI đạo diễn |
| Chứa | khung xương, luật, linh kiện, phông, khung tư thế & biểu cảm, cổng kiểm; Tạo asset mới, bàn chỉnh (Trợ lý AI ở dock cột phải) | dự án chủ đề → nhân vật, vật phẩm, bối cảnh | kịch bản, phân cảnh, cảnh thành phẩm, sân khấu final, kịch bản lẻ từ agent |
| Việc | chọn khung → tham số → soát → cổng → lưu vào dự án | xem, **lấy về** (ảnh, sprite 8 hướng, mã), tải / nhập **gói dự án** | danh sách tác phẩm → phòng làm phim (AI đạo diễn ở dock), diễn cả chuỗi, **xuất phim HTML**, storyboard |

Dòng chảy một chiều: **Xưởng → Thư viện → Tạo tác → thành phẩm**. Khung không bao giờ bị sửa: lưu vào khung (kể cả từ Studio) thành bản sao trong "Của tôi".
Asset người dùng hoặc AI tạo lưu dạng **nháp trong dự án** và dùng được ngay — không có bước duyệt (Ryan, 2026-10-18). AI đạo diễn thiếu nhân vật / bối cảnh thì tự vào Xưởng tạo (đúng dự án, qua cổng kiểm).
