# gen-chibi — Đặc tả 3 giai đoạn: Xưởng · Thư viện · Tạo tác

> **Trạng thái:** BẢN NHÁP v2, chờ Ryan duyệt (cổng ② của STD-05). Chưa code theo bản này.
> **Ngày:** 2026-10-18 · **Người viết:** Gen · v2 đã sửa theo kiểm toàn vẹn CNS (STD-15): 4 🔴, 6 🟡.
> **Nguồn ý đồ:** `01-projects/gen-chibi/INTENT.md` (Second-Brain, INT-01…08) + lời Ryan ngày 2026-10-18 (chưa vào INTENT, ghi ở mục 10).
> © 2026 Afi Labs — All rights reserved.

---

## 0. Một câu, một sơ đồ

**Ba lớp là ba bộ công năng, cũng là ba giai đoạn liên tiếp:** làm khuôn → bày hàng mẫu → dùng để sáng tác.
*(Ryan 2026-10-18: "3 lớp này bản chất nó là 3 bộ công năng và giai đoạn khác nhau".)*

```
 ① XƯỞNG (Afi)                ② THƯ VIỆN (chỉ đọc)            ③ TẠO TÁC (của người dùng)
 khung · bộ nháp · kiểm ──Xuất bản──▶ bộ @phiên-bản ──Lấy về──▶ phối · đạo diễn ──Xuất──▶ thành phẩm
                                          └──Tải trực tiếp──▶ thành phẩm
```

| | ① Xưởng | ② Thư viện | ③ Tạo tác | Hệ thống |
|---|---|---|---|---|
| Câu hỏi | khuôn đúng chuẩn chưa? | có gì để dùng? | tôi làm ra được gì? | app chạy ổn không? |
| Chủ | Afi | Afi tuyển chọn | người dùng / agent | chủ máy |
| Mặt (STD-05) | **Admin** | **Workspace** (chỉ đọc) | **Workspace** | **Admin** |
| Nhịp thay đổi | chậm | vừa | liên tục | hiếm |

---

## 1. Luật bất biến

| # | Luật |
|---|---|
| L1 | **Mỗi đối tượng thuộc đúng một giai đoạn.** Không trang nào trộn đồ của hai giai đoạn. |
| L2 | **Đồ chỉ đi qua 4 cửa:** Xuất bản (①→②), Lấy về (②→③), Tải trực tiếp (②→ngoài), Xuất thành phẩm (③→ngoài). Cả hai cửa ra ngoài chỉ giao **thành phẩm** (ảnh, sprite, JSON công thức), không giao khuôn. |
| L3 | **Chỉ Xưởng sửa khuôn.** Bộ đã xuất bản bất biến. Tạo tác tự do trong phạm vi của mình. |
| L4 | **Ghim phiên bản hai tầng:** bộ khai báo `khung@x`; tác phẩm và thành phẩm lưu cả `khung@x` và `bộ@y`, nên dựng lại ra y hệt. Khung mới chỉ có hiệu lực khi Xưởng **phát hành lại bộ**. Người dùng tự bấm nâng phiên bản. *(Cần làm engine giữ được nhiều phiên bản cùng lúc — xem §8. Không thuộc Đợt 1.)* |
| L5 | **Một cổng ghi, phân quyền theo vai:** Afi ghi khung và bộ nháp; người dùng / agent chỉ ghi vào phạm vi Tạo tác của họ. Studio, MCP, Trợ lý AI cùng cổng và cùng luật kiểm. |
| L6 | **Ở bản SaaS, engine và linh kiện gốc không rời server Afi.** Khách xem trước bằng ảnh do server dựng, nhận thành phẩm và công thức tham chiếu. Bản cài về máy (self-host) trở thành **bản nội bộ của Afi**. *(INT-06 cần Ryan xác nhận thu hẹp — §10.)* |

---

## 2. Danh từ (giữ tối thiểu)

| Đối tượng | Giai đoạn | Là gì |
|---|---|---|
| **Khung** | ① | từ vựng và luật dùng chung mọi chủ đề: khung xương, lớp, góc nhìn, tư thế / động tác / biểu cảm / hoạt động, ngữ pháp cảnh và item, cổng kiểm. **Không chứa linh kiện.** Có phiên bản `khung@x`. |
| **Bộ cơ sở** | ① → ② | bộ đặc biệt chứa linh kiện chung mọi chủ đề (dáng đầu, mắt, tóc cơ bản, quần áo trơn…) — hiện là 25 linh kiện trong `afi.core`. Bộ chủ đề **phụ thuộc** bộ cơ sở. |
| **Bộ chủ đề** | ① nháp → ② đã xuất bản | gói của một chủ đề: linh kiện riêng + nhân vật mẫu + trang bị + cảnh + kịch bản mẫu. Khai báo `khung@x` và bộ phụ thuộc. Bản đã xuất bản là `id@phiên-bản`, bất biến. |
| **Linh kiện** | ① | mảnh vẽ cắm vào khung (kể cả phông cảnh, đạo cụ). Luôn thuộc một bộ. |
| **Tác phẩm** | ③ | *(chờ Ryan chốt — §10 câu 1)* đơn vị làm việc của người dùng: một đầu ra cụ thể, gom dàn diễn viên, cảnh, kịch bản, thành phẩm. |
| **Thành phẩm** | ③ / ra ngoài | file xuất ra kèm công thức và phiên bản khung + bộ đã dùng. |

Các ý tưởng *Hộp yêu cầu, Báo thiếu, Đề cử, Tủ đồ, linh kiện riêng của khách* chuyển sang **Phụ lục A** — làm khi có nhu cầu thật.

---

## 3. Giai đoạn ① — XƯỞNG (Admin)

**Mục đích:** làm khung và quy trình chuẩn hoá, đóng gói thành bộ, kiểm, xuất bản.
*(Ryan 2026-10-18: "phần xưởng sẽ là chúng ta dồn sức làm bộ khung xương và qui trình tiêu chuẩn chuẩn hóa mọi thứ chứ không vội sản xuất hàng loạt asset".)*

### 3.1 Việc làm
1. **Giữ khung**: xem, và (hiếm) nâng `khung@x`. Khung mới không tự áp vào bộ đã xuất bản (L4).
2. **Làm linh kiện**: tạo / sửa / nhập SVG an toàn, hoặc nhờ agent (`get_part_spec` → `preview_part` → `save_part`); soát trên bàn soát.
3. **Gom bộ nháp**: chọn linh kiện, phối nhân vật mẫu, trang bị, cảnh, kịch bản mẫu.
4. **Kiểm bộ** theo tiêu chuẩn 3.3.
5. **Xuất bản**: tăng phiên bản, ghi changelog, đẩy sang Thư viện.

### 3.2 Màn hình
| Mã | Màn | Từ hiện trạng |
|---|---|---|
| X1 | Khung | gộp "Khung tư thế & hoạt động" + "Khung biểu cảm & động tác" |
| X2 | Kho linh kiện & phông | trang hiện có + thêm **tạo / sửa / nhập** linh kiện |
| X3 | Bộ chủ đề (nháp) | mới: thành phần, checklist tiêu chuẩn, nút Kiểm, nút Xuất bản |
| X4 | Cổng kiểm & hiệu năng | trang hiện có |

### 3.3 Tiêu chuẩn một bộ chủ đề
**Bắt buộc (đợt 1 kiểm được ngay với dữ liệu hiện có):**
- ≥ 5 nhân vật mẫu, mỗi nhân vật đạt cổng ở 18 biểu cảm × 32 hoạt động × 5 góc nhìn.
- Mọi linh kiện có bản 45° (trừ vật cầm tay), license, nguồn; không trùng id.
- ≥ 4 cảnh (có trong nhà và ngoài trời), dùng được ở 4 giờ; mọi phông của bộ đều được dùng; không có giá trị hỏng ở mọi giờ × thời tiết.
- Khai báo `khung@x` và bộ phụ thuộc.

**Khuyến nghị (chưa có chỗ chứa — thêm khi làm X3):** trang bị cho các bộ phận chính, ≥ 2 kịch bản mẫu, ảnh bìa, ảnh demo, mô tả, nhãn tìm kiếm, changelog, file ghi công.

*Bộ Tam Quốc hiện đạt phần bắt buộc: 5 nhân vật, 8 cảnh, 27/27 phông được dùng, 13 trang bị.*

### 3.4 Dùng chung mọi chủ đề vs đổi theo chủ đề
| Khung + bộ cơ sở (dùng chung) | Bộ chủ đề (đổi theo chủ đề) |
|---|---|
| khung xương, lớp, góc nhìn, từ vựng chuyển động, 18 biểu cảm, hệ mắt / mày / miệng | linh kiện riêng: tóc, mũ, áo, giày, vật cầm, mặt nạ của chủ đề |
| ngữ pháp cảnh (lớp, chỗ đứng, giờ, thời tiết) và item (loại, độ hiếm, chỉ số) | bảng màu, nhân vật, tính cách, câu thoại |
| cổng kiểm, ngân sách hiệu năng, quy trình xuất, Đạo diễn, MCP | trang bị, phông, đạo cụ, cảnh, kịch bản mẫu |
| linh kiện cơ bản (bộ cơ sở) | |

---

## 4. Giai đoạn ② — THƯ VIỆN (Workspace, chỉ đọc)

**Luật riêng:** chỉ chứa bộ đã xuất bản. Không có "Của tôi".

### 4.1 Việc làm
1. Duyệt theo **bộ chủ đề**; tìm xuyên bộ.
2. Xem biến thể: biểu cảm, hoạt động, góc, giờ, thời tiết, đặt diễn viên vào cảnh.
3. **Tải trực tiếp thành phẩm**: SVG, PNG, avatar, sprite, thẻ trang bị, cảnh; **JSON công thức**; lệnh MCP mẫu.
   *Bỏ "nhúng web kiểu chép thư mục engine/" (mâu thuẫn L6) — thay bằng link thành phẩm khi có SaaS.*
4. **Lấy về Tạo tác** (khi có giai đoạn ③): mặc định **tham chiếu ghim phiên bản**; khi người dùng bấm sửa thì tạo bản sao của họ.

### 4.2 Màn hình
| Mã | Màn | Từ hiện trạng |
|---|---|---|
| T1 | Trang chủ Thư viện — lưới bộ chủ đề | mới |
| T2 | Trang bộ — giới thiệu, tab Nhân vật · Trang bị · Cảnh, license, phiên bản | mới |
| T3 | Chi tiết mục + khu Dùng | trang hiện có, bỏ nhóm "Của tôi", bỏ nhúng web chép engine |

---

## 5. Giai đoạn ③ — TẠO TÁC (Workspace)

**Luật riêng:** chỉ chứa đồ của người dùng. Đồ mẫu chỉ được tham chiếu hoặc sao chép vào.
**Làm sau cùng** — khi Ryan chốt §10 câu 1 và có một nhu cầu thật để làm theo.

### 5.1 Việc làm
1. Tạo tác phẩm (tên, mục đích đầu ra, bộ dùng ghim phiên bản).
2. Lấy nhân vật / trang bị / cảnh từ Thư viện, phối, sửa.
3. Đạo diễn: kịch bản, diễn trong cảnh.
4. Xuất thành phẩm kèm công thức; xem lại / dựng lại.
5. Trợ lý AI / agent qua MCP làm các việc trên trong phạm vi tác phẩm đang mở.

### 5.2 Màn hình
| Mã | Màn | Từ hiện trạng |
|---|---|---|
| C1 | Tác phẩm của tôi | mới |
| C2 | Không gian tác phẩm: Dàn · Cảnh · Kịch bản · Thành phẩm | mới |
| C3 | Bàn phối (chỉ đồ của tôi) | bàn phối nhân vật / trang bị / cảnh hiện có, lọc bỏ đồ chính thức |
| C4 | Đạo diễn | trang hiện có, gắn với tác phẩm |
| C5 | Trợ lý AI | trang hiện có, gắn với tác phẩm |

**Hệ thống (Admin):** Cài đặt AI, Cập nhật — giữ như hiện có, không thuộc giai đoạn nào.

---

## 6. MCP / API theo vai

| Nhóm | Tool | Ai gọi (khi lên SaaS) |
|---|---|---|
| Xưởng | `get_part_spec`, `preview_part`, `save_part` (ghi vào **bộ nháp**, không vào `local.my`) | chỉ Afi |
| Thư viện | `get_catalog`, `list_*`, `get_character`, `render_*` cho mục trong bộ | mọi khách |
| Tạo tác | `validate_*`, `save_*`, `get_director_schema`, `validate_event`, `save_event`, `render_*` cho đồ của tôi | khách, trong phạm vi của họ |
| Vận hành | `get_app_version`, `update_app`, `rollback_app` | chủ máy |

Cần sửa khi làm từng đợt:
- `list_*` thêm tham số phạm vi (`library` | `mine`) — hiện trả lẫn cả hai.
- `render_*` trả **link** thành phẩm thay vì nguyên SVG (một cảnh ~67 000 ký tự ≈ hàng chục nghìn token).
- Cổng ghi phân quyền theo vai (L5): hiện Studio được ghi vào pack chính thức (`allowAnyPack`), MCP / AI chỉ ghi `local.my`.

---

## 7. Hiện trạng → mục tiêu

| Hiện có | Đích | Việc |
|---|---|---|
| `afi.core` (25 linh kiện + từ vựng + luật) | Khung + Bộ cơ sở | tách: từ vựng và luật → Khung; 25 linh kiện → Bộ cơ sở |
| `afi.tamquoc` + `afi.items` + `afi.scenes` (chia theo loại) | Bộ chủ đề "Tam Quốc" | gom thành một bộ, phụ thuộc Bộ cơ sở |
| Pack có trường `version` nhưng chưa bất biến, chưa ghim | L4 | engine giữ nhiều phiên bản cùng lúc (registry theo `pack@ver`); tham chiếu chéo có phiên bản — **việc engine thật, Đợt 2** |
| Thư viện theo loại asset, có nhóm "Của tôi" | T1–T3 | Đợt 2 |
| Nhúng web chép engine | — | bỏ khi lên SaaS (L6) |
| Bàn phối liệt kê cả đồ chính thức | C3 | Đợt 3 |
| Kịch bản ở kho chung `/api/events` | bộ (kịch bản mẫu) / tác phẩm | Đợt 2–3 |

---

## 8. Phạm vi theo đợt

| Đợt | Làm | Điều kiện bắt đầu |
|---|---|---|
| **1 — Xưởng** | X1 (gộp Khung), X2 (tạo / sửa / nhập linh kiện), X3 (bộ nháp + tiêu chuẩn bắt buộc + cổng), X4; tách Khung / Bộ cơ sở / Bộ Tam Quốc | Ryan duyệt đặc tả này |
| **2 — Thư viện** | xuất bản bộ có phiên bản bất biến (L4: engine nhiều phiên bản), T1–T3, `list_*` theo phạm vi, `render_*` trả link | Đợt 1 xong |
| **3 — Tạo tác** | Tác phẩm, C1–C5, lấy về ghim phiên bản | Ryan chốt câu 1 + có một nhu cầu thật để làm theo |

Mỗi đợt theo STD-05 ⑥: **phần nền phía server trước** (đối tượng, API, MCP, test), giao diện sau.

---

## 9. Truy vết ý đồ

| Ý đồ | Đặc tả đáp ứng ở đâu |
|---|---|
| INT-01 Asset là code, xuất bản độc lập | L2 (thành phẩm + JSON công thức), L4 (dựng lại y hệt) |
| INT-02 Afi làm khung; đồ người dùng thành tài nguyên chung theo nhóm thư viện | Khung + bộ do Afi; **phần "đồ người dùng thành tài nguyên chung" đưa sang Phụ lục A** — cần Ryan xác nhận (§10 câu 2) |
| INT-03 SaaS về sau | L6, §6 phân quyền tool |
| INT-05 MCP cho agent | §6 |
| INT-06 MVP cài về máy | L6 thu hẹp thành bản nội bộ Afi — **cần Ryan xác nhận** (§10 câu 3) |
| INT-07 Quản lý chi tiết từng asset | X2, T3, C3 |
| INT-08 Chất lượng là hào bảo vệ | §3.3 tiêu chuẩn bộ, Đợt 1 dồn vào Xưởng |

---

## 10. Câu hỏi cho Ryan

1. **"Tác phẩm" có đúng đơn vị làm việc của người dùng không?** (Chỉ cần chốt trước Đợt 3.)
2. **INT-02:** đồ người dùng tạo có trở thành tài nguyên chung (nhóm / cộng đồng) không, hay chỉ Afi duyệt mới lên Thư viện?
3. **INT-06:** bản cài về máy chỉ còn là bản nội bộ Afi khi lên SaaS — đúng không?
4. **Tiêu chuẩn bộ (§3.3):** sửa con số nào?
5. **Bộ chủ đề thứ hai** sau Tam Quốc là gì? (Để kiểm khung + bộ cơ sở có thật sự dùng chung được.)

**Lời Ryan 2026-10-18 cần đưa vào INTENT khi mở lại Second-Brain:** ba giai đoạn; Xưởng làm khung và quy trình trước; repo private + SaaS giấu khung; tránh phức tạp hoá, làm theo nhu cầu thật. Kèm: STD-04 đổi visibility → cập nhật LICENSE / README cho repo private.

---

## Phụ lục A — Ý tưởng để sau (chưa thuộc phạm vi)
- **Hộp yêu cầu:** người dùng báo thiếu linh kiện → việc cho Xưởng.
- **Đề cử:** đồ hay của người dùng → Afi duyệt vào bộ.
- **Linh kiện riêng của khách** trong Tạo tác (cần đối tượng mới, phụ thuộc câu 2).
- **Tủ đồ của tôi** dùng chung giữa nhiều tác phẩm.
- **Nhóm / cộng đồng** đóng góp bộ (INT-02).
- Plugin Godot, bộ khiển hành vi, SaaS nhiều khách, tính lượt.

## Phụ lục B — Thuật ngữ
| Từ | Nghĩa |
|---|---|
| Khung | từ vựng và luật dùng chung, không chứa linh kiện; `khung@x` |
| Bộ cơ sở | linh kiện dùng chung mọi chủ đề |
| Bộ chủ đề | gói của một chủ đề; nháp ở Xưởng, `id@phiên-bản` ở Thư viện |
| Tác phẩm | đơn vị làm việc của người dùng |
| Thành phẩm | file xuất ra + công thức + phiên bản khung và bộ |
| Tham chiếu ghim phiên bản | dùng nguyên mục của bộ ở đúng phiên bản; nâng phiên bản bằng tay |
