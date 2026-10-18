# gen-chibi — Đặc tả 3 giai đoạn: Xưởng · Thư viện · Tạo tác

> **Trạng thái:** BẢN NHÁP, chờ Ryan duyệt (cổng ② của STD-05). Chưa code theo bản này.
> **Ngày:** 2026-10-18 · **Người viết:** Gen · **Nguồn ý đồ:** `01-projects/gen-chibi/INTENT.md` (Second-Brain) và các trao đổi ngày 2026-10-18.
> **Phạm vi:** cách tổ chức sản phẩm thành ba giai đoạn — đối tượng, việc làm, màn hình, chỗ chuyển giao. Không bàn engine vẽ (đã có), không bàn tính tiền chi tiết.
> © 2026 Afi Labs — All rights reserved.

---

## 0. Một câu và một sơ đồ

**Ba lớp là ba bộ công năng, cũng là ba giai đoạn liên tiếp trong vòng đời của một asset:** làm khuôn → bày hàng mẫu → dùng để sáng tác.

```
 ① XƯỞNG (Afi)              ② THƯ VIỆN (mọi người xem)         ③ TẠO TÁC (của tôi)
 làm khuôn · soát · kiểm ──Xuất bản──▶ bộ chủ đề có phiên bản ──Lấy về──▶ tác phẩm · phối · đạo diễn ──Xuất──▶ thành phẩm
        ▲                                                              │
        └─────────────── Báo thiếu (cần linh kiện X) ◀─────────────────┤
        └─────────────── Đề cử (tác phẩm hay → Afi duyệt) ◀────────────┘
```

| | ① Xưởng | ② Thư viện | ③ Tạo tác |
|---|---|---|---|
| Câu hỏi của lớp | khuôn này đúng chuẩn chưa? | có gì để dùng? | tôi làm ra được gì? |
| Chủ | Afi | Afi tuyển chọn | người dùng / agent của họ |
| Mặt (STD-05) | **Admin** | danh mục dùng chung (chỉ đọc) | **Workspace** |
| Thước đo chất lượng | khắt khe nhất | đã duyệt, ổn định, có phiên bản | tự do |
| Nhịp thay đổi | chậm | vừa (theo bộ) | liên tục |

---

## 1. Luật bất biến

| # | Luật | Vì sao |
|---|---|---|
| L1 | **Mỗi đối tượng thuộc đúng một giai đoạn.** Không có trang nào trộn đồ của hai giai đoạn. | Gốc của sự rối hiện tại (Thư viện có "Của tôi", "của tôi" liệt kê đồ chính thức). |
| L2 | **Dòng chảy một chiều qua 3 cửa** (Xuất bản, Lấy về, Xuất thành phẩm) + **2 vòng phản hồi** (Báo thiếu, Đề cử). Ngoài các cửa này, không có đường tắt. | Biết chính xác đồ đi từ đâu tới đâu. |
| L3 | **Chỉ Xưởng sửa được khuôn.** Thư viện bất biến theo phiên bản. Tạo tác tự do trong không gian của mình. | Khuôn là tài sản của Afi; hàng mẫu phải ổn định để người dùng tin. |
| L4 | **Tác phẩm ghim phiên bản bộ** (vd. `afi.tamquoc@1.2`). Bộ lên 1.3 thì tác phẩm cũ không đổi, người dùng chủ động nâng. | Cập nhật thư viện không được làm hỏng thứ người dùng đã làm. |
| L5 | **Mọi ghi đi qua một cổng ghi** (như hiện nay): Studio, MCP, Trợ lý AI cùng luật. | Giữ chuẩn thống nhất (đã có, giữ nguyên). |
| L6 | **Khuôn (engine + linh kiện gốc) chỉ chạy trên server.** Giai đoạn ② và ③ chỉ nhận thành phẩm và công thức tham chiếu. | Hướng SaaS giấu khung (Ryan 2026-10-18). |

---

## 2. Danh từ — đối tượng của từng giai đoạn

| Đối tượng | Giai đoạn | Là gì | Ai sửa | Vòng đời |
|---|---|---|---|---|
| **Khung** | ① | khung xương, lớp vẽ, góc nhìn, từ vựng tư thế / động tác / biểu cảm / hoạt động, ngữ pháp cảnh và item, cổng kiểm | Afi | có phiên bản khung (đổi rất hiếm) |
| **Linh kiện** | ① | mảnh vẽ cắm vào khung: tóc, mũ, áo, vật cầm, phông cảnh, đạo cụ | Afi | nháp → đạt cổng → nằm trong bộ |
| **Bộ nháp** | ① | một chủ đề đang làm: danh sách linh kiện + nhân vật mẫu + trang bị + cảnh + kịch bản mẫu + ảnh bìa | Afi | nháp → đang kiểm → xuất bản |
| **Bộ đã xuất bản** | ② | ảnh chụp bất biến của một bộ nháp: `id@phiên-bản`, chủ đề, license, changelog | không ai (chỉ đọc) | xuất bản → bản mới thay → ngừng (vẫn đọc được) |
| **Mục trong bộ** | ② | nhân vật / trang bị / cảnh / linh kiện thuộc một bộ đã xuất bản | không ai | theo bộ |
| **Tác phẩm** | ③ | một việc người dùng làm ra: "Truyện cô giáo", "Bộ sticker Tết". Có mục đích đầu ra, các bộ đang dùng (ghim phiên bản) | người dùng | đang làm → đã xuất → lưu trữ |
| **Đồ của tôi** | ③ | nhân vật / trang bị / cảnh do người dùng phối (từ mục trong bộ, bằng tham chiếu hoặc nhân bản). Dùng lại được ở nhiều tác phẩm | người dùng | có phiên bản riêng |
| **Kịch bản** | ③ | chuỗi bước diễn trong một cảnh (Đạo diễn AI) | người dùng | thuộc tác phẩm |
| **Thành phẩm** | ③ | file xuất ra (ảnh, sprite, trang truyện…) **kèm công thức sinh ra nó** để dựng lại y hệt | hệ thống tạo | bất biến; xoá được |
| **Yêu cầu** | ③ → ① | "Báo thiếu" (cần linh kiện X) hoặc "Đề cử" (tác phẩm / đồ hay) | người dùng tạo, Afi xử lý | mở → đang làm → xong / từ chối |

**Hai danh từ mới quan trọng nhất:** *Bộ chủ đề* (đơn vị của Xưởng và Thư viện) và *Tác phẩm* (đơn vị của Tạo tác). Hiện tại chưa có cả hai — đó là lý do mọi thứ bị chia theo loại asset và lẫn vào nhau.

---

## 3. Giai đoạn ① — XƯỞNG (Admin của Afi)

**Mục đích:** làm khuôn đạt chuẩn và đóng gói thành bộ chủ đề để xuất bản.
**Người dùng:** Ryan, Gen, họa sĩ / agent của Afi. Không mở cho khách.

### 3.1 Việc làm
1. **Làm linh kiện**: vẽ (SVG an toàn, token màu) hoặc nhờ agent (`get_part_spec` → `preview_part` → `save_part`), soát trên bàn soát (ma-nơ-canh × góc nhìn × tình huống; phông: ngày/đêm + diễn viên).
2. **Gom bộ**: tạo bộ nháp theo chủ đề, thêm linh kiện, phối nhân vật mẫu, trang bị, cảnh, kịch bản mẫu, chọn ảnh bìa.
3. **Kiểm bộ**: chạy cổng kiểm cả bộ theo **tiêu chuẩn bộ** (3.3).
4. **Xuất bản**: chốt phiên bản, viết changelog, đẩy sang Thư viện.
5. **Xử lý yêu cầu** từ Tạo tác: báo thiếu → việc làm linh kiện; đề cử → duyệt vào bộ.
6. **Giữ khung**: xem và (hiếm khi) nâng phiên bản khung; mọi thay đổi khung chạy lại cổng cho toàn bộ bộ.

### 3.2 Màn hình
| Mã | Màn | Nội dung chính |
|---|---|---|
| X1 | Tổng quan Xưởng | bộ đang làm, yêu cầu đang mở, cổng đỏ, linh kiện mới |
| X2 | Khung | từ vựng (tư thế, động tác, biểu cảm, hoạt động, góc nhìn, ngữ pháp cảnh/item), phiên bản khung — *gộp hai trang "Khung tư thế" và "Khung biểu cảm" hiện có* |
| X3 | Kho linh kiện & phông | danh sách theo bộ phận, bàn soát, **tạo / sửa / nhập** linh kiện (hiện chỉ xem) |
| X4 | Bộ chủ đề (nháp) | thành phần, checklist tiêu chuẩn bộ, nút Kiểm và **Xuất bản** |
| X5 | Cổng kiểm & hiệu năng | báo cáo kiểm toàn kho, ngân sách hiệu năng |
| X6 | Hộp yêu cầu | báo thiếu, đề cử từ Tạo tác |

### 3.3 Tiêu chuẩn một bộ chủ đề (đề xuất — Ryan sửa)
| Hạng mục | Tối thiểu |
|---|---|
| Nhân vật mẫu | đủ các vai chính của chủ đề (≥ 5), mỗi nhân vật đạt cổng ở 18 biểu cảm × 32 hoạt động × 5 góc |
| Linh kiện | mọi linh kiện có bản 45° (trừ vật cầm tay), license, nguồn; không trùng id chính thức |
| Cảnh | ≥ 4 cảnh (có trong nhà và ngoài trời), dùng được ở 4 giờ, mọi phông đều được dùng |
| Trang bị | có cho các bộ phận chính của chủ đề |
| Kịch bản mẫu | ≥ 2, chạy được trong cảnh của bộ |
| Trình bày | ảnh bìa, ảnh demo, mô tả, chủ đề, nhãn tìm kiếm |
| Pháp lý | license bộ, file ghi công (credits) |
| Kỹ thuật | qua mọi cổng; không có giá trị hỏng (NaN…) ở mọi giờ × thời tiết |

### 3.4 Dùng chung mọi chủ đề vs đổi theo chủ đề
| Khung (dùng chung, nằm ở X2) | Bộ chủ đề (đổi theo chủ đề, nằm ở X4) |
|---|---|
| khung xương, điểm neo, lớp, góc nhìn | linh kiện: tóc, mũ, áo, giày, vật cầm, mặt nạ |
| 18 biểu cảm, hệ mắt/mày/miệng, hiệu ứng | bảng màu, nhân vật, tính cách, câu thoại |
| tư thế, di chuyển, động tác, 32 hoạt động | trang bị (hình, độ hiếm, chỉ số theo bối cảnh) |
| ngữ pháp cảnh (lớp, chỗ đứng, giờ, thời tiết), ngữ pháp item | phông, đạo cụ, cảnh dựng sẵn |
| cổng kiểm, ngân sách, quy trình xuất, Đạo diễn, MCP | kịch bản mẫu, hoạt động riêng của chủ đề (nếu cần) |

---

## 4. Giai đoạn ② — THƯ VIỆN (hàng mẫu, chỉ đọc)

**Mục đích:** cho mọi người thấy có gì để dùng, và lấy về.
**Luật riêng:** chỉ chứa **bộ đã xuất bản**. Không có "Của tôi", không sửa tại chỗ.

### 4.1 Việc làm
1. **Duyệt theo chủ đề** (bộ là đơn vị chính), tìm xuyên bộ theo tên / vai / loại.
2. **Xem biến thể** của một mục: biểu cảm, hoạt động, góc, giờ, thời tiết, đặt diễn viên vào cảnh.
3. **Lấy về** theo hai cách:
   - **Tải trực tiếp**: ảnh (SVG, PNG, avatar, sprite, thẻ trang bị, cảnh) và mã (mã tham chiếu, lệnh MCP, nhúng web, JSON) — *đã có*.
   - **Đưa vào tác phẩm**: chọn một tác phẩm (hoặc tạo mới) → mục được *tham chiếu* (dùng nguyên) hoặc *nhân bản* (để sửa) sang Tạo tác.

### 4.2 Màn hình
| Mã | Màn | Nội dung chính |
|---|---|---|
| T1 | Trang chủ Thư viện | lưới **bộ chủ đề** (ảnh bìa, tên, số nhân vật / cảnh / trang bị, phiên bản) |
| T2 | Trang bộ | giới thiệu, ảnh demo, tab Nhân vật · Trang bị · Cảnh · Kịch bản mẫu, license, changelog, phiên bản cũ |
| T3 | Chi tiết mục | xem biến thể + khu **Dùng** (tải ảnh, chép mã, "Đưa vào tác phẩm…") — *tái dùng khu Dùng hiện có* |
| T4 | Tìm kiếm | xuyên mọi bộ |

---

## 5. Giai đoạn ③ — TẠO TÁC (Workspace của người dùng)

**Mục đích:** biến hàng mẫu thành thứ người dùng cần, và xuất ra dùng.
**Luật riêng:** chỉ chứa đồ của người dùng. Đồ mẫu chỉ được *tham chiếu* hoặc *nhân bản vào*.

### 5.1 Việc làm
1. **Tạo tác phẩm**: đặt tên, chọn mục đích đầu ra (khung truyện · sticker · sprite cho game · ảnh lẻ · cảnh diễn), chọn bộ dùng (ghim phiên bản).
2. **Dựng dàn**: lấy nhân vật / trang bị / cảnh từ Thư viện (tham chiếu hoặc nhân bản) hoặc phối mới.
3. **Phối**: sửa ngoại hình, tham số, bảng màu, mặc trang bị; phối cảnh.
4. **Đạo diễn**: viết hoặc nhờ AI viết kịch bản, diễn trong cảnh.
5. **Xuất thành phẩm** theo mục đích đầu ra; mỗi thành phẩm lưu kèm công thức.
6. **Xem lại / dựng lại** thành phẩm cũ (cùng công thức → cùng kết quả).
7. **Báo thiếu** ("cần nón cối") hoặc **Đề cử** (gửi Xưởng).
8. **Trợ lý AI / agent qua MCP** làm mọi việc trên *trong phạm vi tác phẩm đang mở*.

### 5.2 Màn hình
| Mã | Màn | Nội dung chính |
|---|---|---|
| C1 | Tác phẩm của tôi | danh sách tác phẩm, nút Tạo mới (chọn mục đích đầu ra) |
| C2 | Không gian tác phẩm | 4 khu: Dàn diễn viên · Cảnh · Kịch bản · Thành phẩm |
| C3 | Bàn phối | phối nhân vật / trang bị / cảnh **của tôi** — mở trong ngữ cảnh tác phẩm — *tái dùng bàn phối hiện có, bỏ đồ chính thức khỏi danh sách* |
| C4 | Đạo diễn | kịch bản → diễn trong cảnh → xuất — *tái dùng Đạo diễn AI hiện có* |
| C5 | Trợ lý AI | chat làm việc trong tác phẩm đang mở — *tái dùng Trợ lý AI hiện có* |
| C6 | Thành phẩm | lịch sử xuất, tải lại, xem công thức, dựng lại |
| C7 | Tủ đồ của tôi | đồ của tôi dùng chung giữa các tác phẩm |

---

## 6. Chỗ chuyển giao

| Cửa | Từ → Tới | Điều kiện | Kết quả |
|---|---|---|---|
| **Xuất bản** | ① → ② | bộ nháp đạt tiêu chuẩn bộ (3.3), Afi bấm xuất bản | bộ `id@phiên-bản` bất biến xuất hiện ở Thư viện |
| **Lấy về** | ② → ③ | người dùng chọn mục + tác phẩm | tham chiếu (ghim phiên bản) hoặc bản nhân bản thuộc người dùng |
| **Tải trực tiếp** | ② → ngoài | — | ảnh / mã (tính lượt khi lên SaaS) |
| **Xuất thành phẩm** | ③ → ngoài | đồ trong tác phẩm đạt cổng | file + công thức, lưu vào lịch sử (tính lượt khi lên SaaS) |
| **Báo thiếu** | ③ → ① | — | yêu cầu mở trong Hộp yêu cầu (X6) |
| **Đề cử** | ③ → ① → ② | Afi duyệt | đồ được đưa vào bộ nháp, lên Thư viện ở phiên bản sau |

---

## 7. MCP và API theo giai đoạn

| Giai đoạn | Tool hiện có | Ai được gọi (khi lên SaaS) |
|---|---|---|
| ① Xưởng | `get_part_spec`, `preview_part`, `save_part`, `get_app_version`, `update_app`, `rollback_app` | chỉ Afi |
| ② Thư viện | `get_catalog`, `list_characters`, `get_character`, `list_items`, `list_scenes`, `render_*` cho mục trong bộ | mọi khách |
| ③ Tạo tác | `validate_*`, `save_character`, `save_item`, `save_scene`, `get_director_schema`, `validate_event`, `save_event`, `render_*` cho đồ của tôi | khách, trong phạm vi tác phẩm của họ |

Cần thêm (đợt sau): tool làm việc với **tác phẩm** (`list_works`, `open_work`, `export_output`), tool **lấy về** (`use_in_work`), và `render_*` trả **đường link** thành phẩm thay vì nguyên SVG (tiết kiệm token).

---

## 8. Hiện trạng → mục tiêu

| Hiện có | Thuộc về | Việc cần làm |
|---|---|---|
| Thư viện › Nhân vật / Trang bị / Cảnh (lưới theo loại, khu Dùng) | ② | đổi đơn vị chính sang **bộ chủ đề**; bỏ nhóm "Của tôi"; giữ khu Dùng; thêm "Đưa vào tác phẩm" |
| Nhân vật / Trang bị / Cảnh của tôi (bàn phối) | ③ | chỉ liệt kê đồ của tôi; mở trong ngữ cảnh tác phẩm |
| Đạo diễn AI, Trợ lý AI | ③ | gắn với tác phẩm; thành phẩm lưu vào lịch sử |
| Kho linh kiện & phông | ① | thêm tạo / sửa / nhập linh kiện trên giao diện |
| Khung tư thế, Khung biểu cảm | ① | gộp thành màn Khung (X2) |
| Cổng kiểm & hiệu năng | ① | giữ |
| Pack (`afi.core`, `afi.tamquoc`, `afi.items`, `afi.scenes`) | ① / ② | hiện chia theo **loại**; cần gom lại thành **bộ chủ đề** ("Tam Quốc" gồm nhân vật + trang bị + cảnh), khung (`afi.core`) tách khỏi bộ |
| Kho "Của tôi" (`local.my`) | ③ | thành Tủ đồ của tôi + tác phẩm |
| — | ② | thiếu: phiên bản bộ, trang bộ, trang chủ thư viện |
| — | ③ | thiếu: tác phẩm, lịch sử thành phẩm |
| — | ① → ② | thiếu: luồng xuất bản bộ |

---

## 9. Phạm vi

**Đợt 1 (tái cấu trúc tối thiểu để hết lẫn lộn):**
- Danh từ **Bộ chủ đề** (nháp + đã xuất bản + phiên bản) và **Tác phẩm** (tên, mục đích, dàn, cảnh, kịch bản, thành phẩm).
- Gom pack hiện có thành bộ "Tam Quốc" + khung `afi.core`.
- Thư viện theo bộ (T1–T3), bỏ "Của tôi" khỏi Thư viện.
- Tạo tác theo tác phẩm (C1, C2, C6), bàn phối chỉ đồ của tôi.
- Xuất bản bộ (X4) ở mức tối thiểu: kiểm theo tiêu chuẩn → tăng phiên bản → hiện ở Thư viện.
- Theo STD-05 ⑥: **backend trước** (đối tượng + API + MCP + test), giao diện sau.

**Để sau:** hộp yêu cầu (báo thiếu, đề cử), vẽ linh kiện trên giao diện Xưởng, nhiều khách (SaaS), tính lượt, plugin Godot, bộ khiển hành vi.

---

## 10. Câu hỏi mở cho Ryan

1. **"Tác phẩm" có đúng đơn vị anh định dùng không?** Hay người dùng chỉ cần "tủ đồ của tôi" mà không cần gom theo tác phẩm?
2. **Người dùng có được tự tạo linh kiện không?** Đề xuất: được, nhưng là *linh kiện riêng* trong Tạo tác (chỉ dùng trong đồ của họ); muốn thành khuôn chung thì phải qua Đề cử → Xưởng duyệt.
3. **Tiêu chuẩn bộ chủ đề ở 3.3** — anh sửa con số tối thiểu nào?
4. **Lấy về mặc định là tham chiếu hay nhân bản?** Đề xuất: tham chiếu (nhẹ, tự hưởng bản vá) — chỉ nhân bản khi người dùng bấm sửa.
5. **Bộ đầu tiên sau Tam Quốc** là chủ đề gì?

---

## 11. Thuật ngữ

| Từ | Nghĩa |
|---|---|
| Khung | phần dùng chung mọi chủ đề: khung xương, từ vựng chuyển động, luật, cổng |
| Linh kiện | mảnh vẽ cắm vào khung (kể cả phông cảnh) |
| Bộ chủ đề | gói linh kiện + nhân vật + trang bị + cảnh của một chủ đề; nháp ở Xưởng, bản đã xuất bản ở Thư viện |
| Tác phẩm | đơn vị làm việc của người dùng, gom mọi thứ cho một đầu ra |
| Thành phẩm | file xuất ra kèm công thức sinh ra nó |
| Tham chiếu / Nhân bản | dùng nguyên mục của bộ (ghim phiên bản) / sao một bản thuộc người dùng để sửa |

---

## Ghi chú đồng bộ Second-Brain
Ryan đang tạm dừng việc ghi Second-Brain. Khi mở lại: chép đặc tả này sang `01-projects/gen-chibi/spec/`, và cập nhật `INTENT.md`: thêm nguyên lý "3 giai đoạn"; sửa STD-04 (repo chuyển private); ghi hướng SaaS giấu khung (L6) và luật ghim phiên bản (L4).
