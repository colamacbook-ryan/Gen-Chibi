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

## 4. Các bước tạo một linh kiện

1. **Chọn bộ phận + lớp**: linh kiện thuộc slot nào (`hat`, `outfit`…), trả về lớp nào. Không tạo lớp mới nếu lớp có sẵn đủ dùng.
2. **Vẽ chính diện** theo neo và bảng màu; khai báo `params` nếu có biến thể (độ cao mũ, độ dài râu…).
3. **Vẽ 45°** bằng công cụ ở mục 3 (ưu tiên `face45` / `body45`; vẽ tay khi linh kiện có dáng riêng).
4. **Soát trên ma-nơ-canh**: Studio › Thư viện linh kiện › bấm linh kiện → Bàn soát (4 góc nhìn × đứng, kinh ngạc, chạy, ngồi). Không soát trên một nhân vật cụ thể.
5. **Cổng kiểm + test**: `bash tools/test.sh` (license, tham số, dựng đủ 18 biểu cảm × 32 hoạt động × 2 hướng × 5 góc nhìn, phủ đủ 45°).
6. **Phát hành**: đổi `VERSION` + `CHANGELOG.md`, đẩy `main` — CI tạo Release, các bản cài tự cập nhật.

## 5. Nhân vật = phối, không vẽ

Nhân vật chỉ là công thức JSON: chọn linh kiện + tham số + màu + nét riêng (`expressions`, `identity`). Muốn nhân vật có thêm khả năng (góc nhìn, tư thế mới…) → **bổ sung linh kiện / khung**, không sửa nhân vật.

## 6. Một cổng ghi duy nhất — mọi agent dùng cùng chuẩn

Ba lối vào, **một** cổng: không có đường nào ghi thẳng vào kho.

| Ai tạo | Đi qua | Cổng kiểm |
|---|---|---|
| Agent ngoài (Claude Code, Claude web/desktop, Cursor…) | MCP — 15 tool | `saveAssetChecked` / `savePartChecked` |
| AI trong chatroom Studio (LLM API: OpenRouter, DeepSeek, MiniMax…) | Vòng function-calling trên **đúng bộ tool MCP** (trừ tool hệ thống), cùng chỉ dẫn MCP | như trên |
| Người dùng Studio / gọi API HTTP | `PUT /api/assets`, `POST /api/parts` → cùng hai hàm | như trên |

- Luật chặn duy nhất `GC.blockingGates`: lỗi cấu trúc/an toàn (linh kiện lạ, license, tham số, không dựng được biểu cảm/hoạt động) chặn ở mọi trạng thái; dấu nhận diện bắt buộc khi "chờ duyệt"/"đã duyệt".
- Linh kiện của agent là **dữ liệu SVG** (tập con an toàn, token màu) — engine đọc rồi dựng lại, kiểm lại cả khi Studio nạp.
- Tool `preview_part` trả bàn soát; `get_part_spec` trả chính khung sườn này ở dạng máy đọc được — agent luôn nhận chuẩn từ hệ thống, không tự đoán.
- Test `tools/test-agent.mjs` dùng LLM giả lập để khẳng định: AI chỉ ghi qua tool, SVG độc bị chặn, tool hệ thống bị từ chối, API HTTP không lách được cổng.
