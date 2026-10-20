# gen-chibi

[English](README.md) | **Tiếng Việt**

**gen-chibi — nhà máy asset chibi theo chủ đề.** Từ một bộ khung chuẩn (ma-nơ-canh, khối vật phẩm, khối bối cảnh) dựng nhân vật / vật phẩm / bối cảnh **bằng code**, cất vào thư viện theo dự án chủ đề, **phát hành** thành gói bán theo chủ đề. **Làm phim** với AI đạo diễn là cách dùng asset — và là bản demo sống của thư viện: chat ra kịch bản, phân cảnh, xuất thành một tệp HTML xem được ở mọi trình duyệt. Mỗi asset là một **công thức JSON** qua cổng kiểm tự động; engine dựng SVG / PNG / sprite 8 hướng hoặc nhân vật "sống" đổi biểu cảm lúc chạy.

**Bắt đầu nhanh:** mở Studio → **✨ Mở dự án mẫu "Văn phòng vui"** → Tạo tác → bấm tác phẩm trong bảng → tab *Xem & duyệt* → ▶ Cả phim → tab *Xuất bản* → *Phim (HTML)*. Xem một bộ chủ đề trọn vẹn: **🏯 Mở bộ chủ đề mẫu "Tam Quốc"** (7 tướng · 13 trang bị · 8 bối cảnh · phim 6 phân cảnh có dàn dựng, giọng nói, âm thanh, màn đấu võ — dựng hoàn toàn từ khung; bộ mẫu Gen Labs, không xuất bán). Hướng dẫn đầy đủ: [`docs/HUONG-DAN.md`](docs/HUONG-DAN.md).

- **Studio** — **3 ứng dụng độc lập** `/xuong` · `/thu-vien` · `/tao-tac` (desktop, kiểu Data Console), theo dòng chảy: **Xưởng** — bộ khung chuẩn + **Tạo asset mới** (chọn khung → tham số → soát → cổng kiểm → lưu), bàn chỉnh, linh kiện, khung tư thế & biểu cảm, cổng kiểm; **Thư viện** — asset đã qua cổng xếp theo **dự án chủ đề**, tải ảnh / sprite 8 hướng, chép mã, **Nháp / Phát hành**, **Gói sao lưu** (cả tác phẩm) và **Gói bán** (chỉ asset phát hành), nhập gói qua cổng kiểm; **Động tác**, **Âm thanh** (bảng 62 + gói, ▶ nghe trên hàng, luật ghép S1–S7, nhập / tải gói) và **Giọng** (22 vai × 4 ngôn ngữ, giọng máy + giọng AI, thiết kế giọng — nơi duy nhất của bộ giọng vai; Cài đặt AI chỉ còn key + trần câu / ngày); **Tạo tác** — bảng **tác phẩm** → mỗi tác phẩm là một **phòng làm phim** riêng (địa chỉ có id) với 5 tab: *Kịch bản* · *Phân cảnh* (ảnh khung đầu, mô tả, bối cảnh, dàn diễn viên, bước, thời lượng; diff chờ duyệt khi AI đề xuất sửa) · *Xem & duyệt* (▶ từng cảnh / cả phim, Nháp · Cần sửa · Đạt + ghi chú, "Đạt x/y") · *Giọng & âm thanh* (ngôn ngữ, lồng tiếng AI, MỘT bảng giọng chốt theo nhân vật + Chốt giọng cả dàn, luật ghép âm) · *Xuất bản* (phim HTML độc lập, storyboard, JSON, gói); AI thiếu nhân vật / bối cảnh thì tự vào Xưởng tạo (đúng dự án).
- **Trợ lý AI** (v0.18) — **một dock ở cột phải, có mặt ở mọi khu** (không còn trang chat riêng): đổi vai theo khu (nhân viên xưởng · giải thích bộ khung + gói động tác · thủ thư Thư viện — chỉ ghép / sửa asset đã có, tạo mới thì mời sang Xưởng · AI đạo diễn của tác phẩm đang mở), thanh "Đang xem: Khu › Trang › đối tượng", **Ghim & Soi** — `@` / Alt+P ghim phần tử theo ID thật vào tin nhắn, AI trả lời bằng nút bấm được (rê = tô sáng, bấm = đi tới), lịch sử chat theo từng tác phẩm / asset / dự án. Rộng 380 px, kéo đổi được, thu gọn bằng Alt+J.
- **Thư viện âm thanh** (v0.18): 62 âm hiệu ứng kiểu hoạt hình khoa trương (BONK, BOING, ZIP, WHAM, SPLAT, TA-DA…) + gói âm riêng từng dự án (Tam Quốc: trống trận, tù và, vó ngựa…) — công thức tổng hợp dạng dữ liệu `gen-chibi.sound/1`, không có tệp âm thanh; bộ phát tự gán âm theo cảnh, 7 luật ghép S1–S7 kiểm ở Studio lẫn MCP; nghe thử ngay trong **Studio › Thư viện › Âm thanh** (bảng Data Console, tab *Luật ghép* và *Gói âm*: nhập / tải / gỡ gói), tải WAV; đi theo gói dự án và phim xuất. Xem `docs/HUONG-DAN.md` › Âm thanh · Giọng.
- **AI đạo diễn**: LLM viết kịch bản / lời thoại trong từ vựng đóng của kho; server kiểm và bắt model sửa nếu sai. Muốn sửa mô tả / bước mà chưa bảo "làm luôn" thì AI **đề xuất**, bạn xem diff rồi Áp dụng / Bỏ.
- **MCP server**: agent mọi hãng nối thẳng vào để tạo nhân vật, trang bị, cảnh, gói động tác, gói âm, làm phim, xuất hoạt ảnh — không tốn LLM API lõi; hướng dẫn agent một nguồn (`agent/`), bootstrap `genchibi agent`.
- **Tự cập nhật** từ GitHub Releases: kiểm SHA-256, sao lưu dữ liệu trước khi đổi, tự chạy lại bản cũ nếu bản mới lỗi.

## Cài đặt (một lệnh)

```bash
curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | bash
```

- Chạy bằng **Docker**; trên Linux trình cài tự cài Docker khi máy chưa có (get.docker.com) và chạy tiếp ngay trong phiên đó dù phiên đăng nhập chưa nhận nhóm `docker` (đăng xuất / vào lại sau đó để dùng `genchibi` không cần sudo). macOS: Docker Desktop, hoặc **Node ≥ 18** với `--native`.
- Mặc định cài vào `~/gen-chibi`, cổng `7480`, chỉ mở cho máy này. Mở **http://localhost:7480**.
- **Đăng nhập lần đầu:** Studio hỏi mật khẩu chủ, kể cả trên máy này. Dòng cuối của trình cài in **mã setup** dùng một lần; dễ hơn: chạy `genchibi open`, lệnh mở trang đặt mật khẩu đã điền sẵn mã. Chọn mật khẩu ít nhất 12 ký tự (một cụm từ dễ nhớ là tốt); trình duyệt nhớ thiết bị 30 ngày. Quên mật khẩu: `genchibi password` trên máy chủ.
- Tuỳ chọn: `--dir <thư mục>` · `--port <cổng>` · `--native` · `--version vX.Y.Z` · `--lang en|vi` · `--domain <tên>` · `--cloudflare` (xem [Ra Internet](#ra-internet-tên-miền-https-mcp-một-bước)).

## Lệnh

```
genchibi start | stop | restart | status
genchibi update            # kiểm tra và cập nhật ngay
genchibi logs
genchibi backup | restore <tệp>
genchibi mcp               # cầu MCP stdio cho agent
genchibi token             # đặt token GitHub (repo private), nhập ẩn — KHÔNG phải token chủ (token chủ là GC_API_TOKEN trong .env, hoặc data/owner-token)
genchibi lang [en|vi]      # xem / đặt ngôn ngữ (CLI + giao diện mặc định của Studio)
genchibi open              # mở Studio (lần đầu: trang đặt mật khẩu chủ, mã điền sẵn)
genchibi password          # đặt / đặt lại mật khẩu chủ
genchibi online …          # ra Internet: tên miền + HTTPS + MCP (xem dưới)
genchibi agent connect     # cấu hình nối cho agent (không in token)
genchibi uninstall
```

## Ra Internet (tên miền, HTTPS, MCP) một bước

**Beta** — đường A đã kiểm với Caddy thật (TLS nội bộ) trong Docker và DNS giả lập; đường B với Cloudflare API giả lập; link tạm với `cloudflared` giả lập. Chưa đường nào chạy trên VPS thật, với Let's Encrypt hay tài khoản Cloudflare thật.

Bạn làm **đúng một** việc ngoài app — trỏ bản ghi A về máy (**đường A**), **hoặc** tạo một API token Cloudflare (**đường B**) — và trong vài phút có `https://tên-miền` (Studio, sau mật khẩu chủ) và `https://tên-miền/mcp` mà claude.ai nối được. Không sửa `.env`, Caddyfile, DNS hay dashboard bằng tay — trừ hai ngoại lệ ở đường B, mỗi cái là một bậc có hướng dẫn cụ thể: token không có quyền WAF thì bạn tự thêm một luật Skip (app in sẵn biểu thức), và gói Free không skip được *Bot Fight Mode* bằng luật nên bạn tắt nó trong dashboard.

| Máy | Bạn làm | Lệnh / nơi bấm |
|---|---|---|
| **VPS có IP công khai** (đường A) | Tạo bản ghi A `chibi.example.com → IP máy` | lúc cài: `curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh \| bash -s -- --domain chibi.example.com` · sau này: `genchibi online caddy chibi.example.com` |
| **Máy nhà / sau router / cổng 80-443 bận** (đường B) | Tạo API token Cloudflare | lúc cài: `… \| bash -s -- --domain chibi.example.com --cloudflare` · sau này: `genchibi online cloudflare chibi.example.com`, hoặc **Studio › Hệ thống › Lên mạng › Cloudflare** |
| **Đã có reverse proxy riêng** | Giữ proxy | `genchibi online proxy chibi.example.com` (in đoạn cấu hình để dán, rồi kiểm từ ngoài vào) |
| (thử, **beta**) | không | `genchibi online quick` — link tạm `*.trycloudflare.com`, đổi mỗi lần khởi động (không dùng OAuth lâu dài) |

**Điều kiện tiên quyết (app kiểm, hiện ✓ / ✗ kèm cách sửa):**
- Đường A: máy có IP công khai; cổng **80 và 443** mở ở tường lửa nhà cung cấp (security group) và `ufw`; không dịch vụ nào khác giữ 80/443; chế độ Docker (edge Caddy chạy ở container riêng `gen-chibi-edge`).
- Đường B: tên miền ở Cloudflare (nameserver Cloudflare, zone `active`, kiểu full); tài khoản dùng được Cloudflare Tunnel (có thể phải bật Zero Trust gói Free một lần).
- Cả hai: *Bot Fight Mode* / *Block AI bots* của Cloudflare có thể chặn claude.ai — bậc "MCP từ Internet" thử bằng agent `Claude-User` và nói cần tắt gì.

**API token Cloudflare (đường B):** *Studio › Hệ thống › Lên mạng* và `genchibi online cloudflare` có link mở trang tạo token của Cloudflare với quyền điền sẵn. Token cần **Account › Cloudflare Tunnel › Edit**, **Zone › DNS › Edit**, **Zone › Zone › Read**, tuỳ chọn **Zone › WAF › Edit** (khi có, app tự thêm luật Skip cho claude.ai đi qua; không có thì app in luật để bạn thêm tay). Đặt **TTL** ngắn (một ngày là đủ): xong việc app xoá token khỏi bộ nhớ (chỉ giữ, có mã hoá, khi bạn yêu cầu), tunnel đang chạy không cần nó. **Không bao giờ** nhận token trên dòng lệnh: có terminal thì hỏi ẩn; không có terminal thì đặt `GC_CF_TOKEN` trong môi trường (hoặc đưa vào `--token-stdin` qua ống).

**Từng bậc, nhìn thấy:** `genchibi online` in mỗi bậc (tên miền / DNS, edge, cổng, chứng chỉ, địa chỉ công khai, MCP từ Internet, mật khẩu chủ) với ✓ / ✗ và cách sửa khi ✗, rồi in `https://tên-miền` và `https://tên-miền/mcp`. Trên VPS mới, bậc cuối là mật khẩu chủ: mở `https://tên-miền/setup` và nhập mã setup (trình cài và `genchibi status` in mã), hoặc chạy `genchibi password` trên máy chủ. Tới lúc đó địa chỉ chỉ đang bật *tạm* (`genchibi status` ghi "Ra Internet (tạm — chờ mật khẩu chủ)"); đặt xong mật khẩu là app tự hoàn tất lên mạng — không cần kiểm lại.

```
genchibi online                         # trạng thái: chế độ, địa chỉ, từng bậc, edge
genchibi online caddy <tên-miền>        # đường A (Docker): bật edge Caddy (cổng 80/443), HTTPS
genchibi online cloudflare <tên-miền>   # đường B: chibi.example.com, hoặc example.com (+ --sub tên; mặc định chibi)
genchibi online proxy <tên-miền> | quick  # proxy riêng | link tạm
genchibi online recheck [--waf-done]    # đi tiếp sau khi đã sửa một bậc
genchibi online off                     # thôi ra Internet (có GC_CF_TOKEN: dọn cả tunnel / DNS / luật WAF app đã tạo)
genchibi online migrate                 # máy cấu hình tay trong .env (GC_PUBLIC_URL / GC_ALLOWED_HOSTS) trước v0.21
```

Đổi địa chỉ công khai sẽ đăng xuất các agent nối bằng OAuth (phải nối lại); lệnh hỏi trước (`--yes` khi không có terminal). Mã thoát `3` nghĩa là "đã ra Internet, chờ đặt mật khẩu chủ". `genchibi expose` (cách của v0.20, đăng nhập Cloudflare bằng trình duyệt) vẫn chạy ở bản này và bỏ ở v0.22.

**Bản sao lưu chứa mật khẩu và phiên; khôi phục thì Go online tắt.** `genchibi backup` lưu `data/`, nay gồm cả mật khẩu chủ (đã băm), các phiên Studio / thiết bị đã nhớ và cấu hình lên mạng. `genchibi restore <tệp>` giữ mật khẩu của bản sao lưu nhưng đăng xuất mọi phiên và thiết bị, và đưa Go online về **tắt** (không địa chỉ công khai, tunnel dừng, mã bản cài mới — bản sao lưu từ máy khác không bao giờ chiếm tên miền hay tunnel của máy đó). Khôi phục xong thì chạy lại Go online.

**Máy đã có trang đăng nhập riêng đứng trước app** (vd proxy đưa người dùng tới `/login` của riêng nó): app nay có mật khẩu chủ và trang `/login`, `/setup` riêng. Trong proxy, chỉ chặn đường của người và để `/login`, `/setup`, `/oauth/authorize` của app đi tới app phía sau lớp đăng nhập của bạn (đường máy — `/mcp`, `/.well-known/…`, `/oauth/register|token|revoke` — vẫn phải để trống như trước). Đoạn mẫu `genchibi online proxy` in ra chỉ chỗ đặt lớp đăng nhập của bạn.

## Ngôn ngữ

Mặc định là tiếng Anh ở mọi nơi: trình cài, CLI và Studio. Chọn tiếng Việt được ngay lúc cài, và đổi lại bất cứ lúc nào sau đó.

- **Lúc cài:** chạy trong terminal, trình cài hỏi đúng một câu:
  `Language / Ngôn ngữ: [1] English  [2] Tiếng Việt  (Enter = English)`.
  Không có terminal (CI, ống dẫn) thì không hỏi và dùng tiếng Anh. Chọn trước bằng `--lang vi` hoặc `GC_LANG=vi`:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | bash -s -- --lang vi
  ```
  Lựa chọn được ghi thành `GC_LANG=en|vi` trong `.env` của bản cài; chạy lại trình cài thì giữ ngôn ngữ đang dùng, trừ khi bạn chọn lại (không hỏi, và không bao giờ tự đổi mặc định của Studio).
- **Sau khi cài, cho cả bản cài:** `genchibi lang` in cả ngôn ngữ của CLI lẫn mặc định của Studio; `genchibi lang vi` (hoặc `en`) ghi `GC_LANG` vào `.env` và đổi ngay mặc định của Studio, nên CLI và giao diện mặc định của Studio đổi cùng lúc.
- **Từng người, trong Studio:** nút chuyển ngôn ngữ trong Studio chỉ đổi giao diện của bạn, nhớ theo máy chủ + trình duyệt; mặc định của Studio (*Hệ thống › Ngôn ngữ*) vẫn là mặc định cho người khác. `GC_LANG` chỉ là giá trị ban đầu hoặc lựa chọn có chủ ý (`--lang`, `genchibi lang`).
- Nội dung của bạn (tên nhân vật, kịch bản, lời thoại) không bao giờ bị dịch. Bộ mẫu *Tam Quốc* giữ nội dung tiếng Việt.
- Nâng cấp từ v0.19 trở về trước: bản cài đã có dữ liệu **giữ tiếng Việt** (đặt một lần ở lần chạy đầu của v0.20) — dù tự cập nhật hay chạy lại trình cài mà không có `--lang`; CLI nói theo. Chỉ bản cài mới bắt đầu bằng tiếng Anh. Đổi bất cứ lúc nào bằng `genchibi lang en|vi` hoặc nút chuyển trong Studio (trang *Hệ thống › Ngôn ngữ*).

## Bộ khung chuẩn (Xưởng)
Mọi asset dựng từ một **bộ khung chuẩn không chủ đề** (kiểu greybox của làm game):
- **Nhân vật:** ma-nơ-canh đầu trọc, không quần áo — 18 khớp, 18 biểu cảm, 32 hoạt động, **8 hướng** (chính diện · 45° · 90° · 135° · sau lưng, hai bên) + 3/4 nhẹ; tải sprite 8 hướng từ Thư viện.
- **Vật phẩm:** 10 khối đại diện theo dáng — que dài, que ngắn, đĩa dẹt, hộp, cầu, đội đầu, khoác thân, sau lưng, giày, che mặt.
- **Bối cảnh:** khối trời / tường, chân trời, khối nhà, nền có lưới tỉ lệ, tiền cảnh, khối hộp / trụ / cây / đá / bàn / cờ; 8 chỗ đứng chuẩn.
- **Quy cách** thống nhất cho mọi asset: [`docs/QUY-CACH-KHUNG.md`](docs/QUY-CACH-KHUNG.md). Đặc tả 3 giai đoạn: [`docs/spec/DAC-TA-3-GIAI-DOAN.md`](docs/spec/DAC-TA-3-GIAI-DOAN.md).
- Bộ Tam Quốc cũ đã cất ở `archive/tamquoc/` (không nạp vào bản chạy).

## Tư thế & hoạt động
Một khung hình = **biểu cảm** (mặt) × **tư thế nền** (thân dưới) × **di chuyển** (chu kỳ) × **động tác** (tay) + đạo cụ + hướng. Không vẽ tay từng tổ hợp: engine ghép lớp như animation layer của game engine.

- 32 hoạt động đặt sẵn: đứng, ngồi ghế, ngồi xếp bằng, quỳ, ngồi xổm, nằm · đi, chạy, rón rén, nhảy, bò, bay, bơi, bỏ chạy · ăn, uống, ngủ, đọc sách, viết · chém, đâm, phòng thủ, xông lên, ăn mừng · sợ hãi, ngất · cúi chào, ôm quyền, quỳ lạy, vẫy, chỉ tay, cổ vũ.
- Ghép tự do: `{ "state": "panic", "posture": "stand", "move": "run", "motion": "flail", "facing": "left" }`.
- Xưởng › Khung tư thế & hoạt động: xem và ghép thử, tải SVG.

## Vật phẩm (loại asset thứ hai)
Item = phối linh kiện có sẵn + bảng màu riêng + độ hiếm + chỉ số; tự đứng được (icon, thẻ) và mặc được lên nhân vật (`look.equip`). Thư viện › Vật phẩm (tải icon/thẻ, chép mã), Xưởng › Tạo asset mới / Bàn chỉnh vật phẩm; mọi vật phẩm bắt đầu từ một khối khung; MCP `list_items` / `validate_item` / `save_item` / `render_item`.

## Bối cảnh (loại asset thứ ba)
Cảnh = phối phông có sẵn (trời, cảnh xa, công trình, mặt đất, đạo cụ, tiền cảnh) + bảng màu + giờ (ngày, bình minh, hoàng hôn, đêm) + thời tiết (mưa, tuyết, hoa rơi, lá bay, sương, đom đóm). Nhân vật đứng vào 8 chỗ đứng chuẩn, tự quay 45° về phía nhau. Kịch bản đặt vào cảnh bằng `"scene"` + `"spot"`. MCP `list_scenes` / `validate_scene` / `save_scene` / `render_scene`; phông mới qua `get_part_spec` → `preview_part` → `save_part`.

## Quy trình tạo lập linh kiện
Nhà xưởng giữ giá trị ở **khung sườn + quy trình**; nhân vật chỉ là phối linh kiện. Chuẩn tạo một linh kiện (toạ độ, lớp, góc nhìn chính diện + 45° (+ 90° / 135° / sau lưng), công cụ `face45`/`body45`, soát trên ma-nơ-canh, cổng kiểm, phát hành): [`docs/QUY-TRINH-LINH-KIEN.md`](docs/QUY-TRINH-LINH-KIEN.md).

## Nối agent qua MCP (mọi hãng — Claude, GPT, Gemini, model mở, agent tự viết)

```bash
genchibi agent connect                 # in cấu hình nối cho Claude Code, Cursor, Gemini CLI, Codex CLI, curl (không in token)
genchibi agent skill claude            # cài hướng dẫn thành skill (cursor | gemini | codex | generic: AGENTS.md / GEMINI.md / rule)
genchibi agent guide film              # đọc hướng dẫn một chủ đề · genchibi agent tools --format openai  (schema function-calling)
```

Từ v0.21 bản cài nào cũng có **token chủ** (`GC_API_TOKEN` trong `.env`, hoặc `data/owner-token`), nên agent trên máy này nói HTTP cần header `Authorization: Bearer` — `genchibi agent connect` in cấu hình kèm chỗ đọc token; agent đã nối trước v0.21 mà không có token thì nối lại theo cách này. `genchibi mcp` (stdio) tự đọc token.

Agent nối vào thì **gọi `start_here` trước**, rồi `get_guide` theo việc cần làm. Hướng dẫn nằm ở **một nguồn**:
[`agent/GUIDE.md`](agent/GUIDE.md) + `agent/workflows/*.md` + `agent/examples/*.json`. Viết bằng tiếng Anh, trung lập model.
Mọi ví dụ được CI chạy thật qua cổng: test "agent từ số 0" đi trọn luồng chỉ bằng hướng dẫn, qua JSON-RPC thuần.
Không có MCP client: `POST /mcp` JSON-RPC bằng curl, `GET /mcp?guide=<chủ đề>`, `GET /mcp?tools=openai|gemini`.
Lỗi có mã ổn định: `[VALIDATION_FAILED]`, `NOT_FOUND`… kèm `structuredContent.error.details[].path`.

53 tool, theo nhóm:
- **Mở đầu:** `start_here`, `get_guide`
- **Nhân vật:** `get_catalog` · `list/get/validate/save/render_character`
- **Linh kiện:** `get_part_spec` · `preview_part` · `save_part`
- **Trang bị:** `list/validate/save/render_item`
- **Cảnh:** `list/validate/save/render_scene`
- **Gói động tác:** `list_actions` · `list_motion_packs` · `get_motion_pack` · `get_motion_spec` · `validate/save_motion_pack` · `render_action` (sprite sheet / khung / timeline)
- **Thư viện âm thanh:** `list_sounds` · `get_sound_spec` · `get_sound_pack` · `validate_sound_pack` · `save_sound_pack` · `delete_sound_pack` (chỉ chủ máy) · `lint_sound_track` (7 luật ghép âm S1–S7)
- **Phim:** `get_director_schema` · `validate_event` · `save_event` · `list_events` · `list/get/save_work` · `save_shot` · `preview_shot` · `render_voice` (đọc thoại bằng giọng AI Google theo vai + ngôn ngữ + giọng vùng — chủ máy dán key là chạy) · `design_voice` (thiết kế giọng cho một vai: ông lão, bà lão, võ tướng…)
- **Dự án & bộ mẫu:** `list/save_project` · `export/import_project` · `list_samples` · `install_sample`
- **Hệ thống:** `get_app_version` · `update_app` · `rollback_app`

Tạo linh kiện: `get_part_spec` → vẽ (SVG an toàn, token màu) → `preview_part` (bàn soát) → `save_part`. Trợ lý AI trong Studio (dock cột phải ở mọi khu; ở Tạo tác là AI đạo diễn) dùng đúng bộ tool này — mọi lối ghi đi qua một cổng kiểm (xem `docs/QUY-TRINH-LINH-KIEN.md` mục 6).

### Nối claude.ai bằng `https://tên-miền/mcp` — OAuth, chỉ cần bấm Cấp phép (v0.19)
App tự làm máy chủ cấp phép OAuth 2.1, gồm khám phá RFC 9728 / 8414, tự đăng ký client (DCR), PKCE S256 và token có hạn, lưu dạng băm. Cách nối: ra Internet trước ([ở trên](#ra-internet-tên-miền-https-mcp-một-bước) — bước này đặt địa chỉ công khai), vào claude.ai *Customize › Connectors › Add custom connector*, dán `https://tên-miền/mcp` rồi bấm **Connect**. Trang **Cấp phép** của app hiện ra để chọn mức quyền (`mcp:read` · `mcp:write` · `mcp:owner`); trang dùng phiên đăng nhập Studio (mật khẩu chủ), chưa đăng nhập thì mời đăng nhập. Quản lý và thu hồi ở **Studio › Hệ thống › Kết nối agent**. Nếu dùng proxy hoặc trang đăng nhập riêng thì các đường máy (`/mcp`, `/.well-known/oauth-*`, `/oauth/register|token|revoke`) phải đi thẳng tới app — `genchibi online proxy <tên-miền>` in sẵn cấu hình đó. Đoạn Caddy mẫu nằm ở `docs/Caddyfile.oauth.example`; cách xử lý Cloudflare và các lỗi thường gặp nằm trong `docs/HUONG-DAN.md` › mục 6.

### Cách cũ: `genchibi expose` — đã thay bằng `genchibi online`, bỏ ở v0.22
Máy đang dùng vẫn chạy ở bản này. Thiết lập mới: dùng [Ra Internet](#ra-internet-tên-miền-https-mcp-một-bước) (không cần đăng nhập Cloudflare bằng trình duyệt, Studio cũng ra Internet, sau mật khẩu chủ).

```bash
genchibi expose chibi.example.com   # lần đầu mở trình duyệt đăng nhập Cloudflare một lần
```

Lệnh tạo Cloudflare Tunnel, trỏ DNS, **chỉ cho đường `/mcp` và các đường OAuth đi qua** (Studio ở lại máy), sinh khoá, khởi động lại, thử gọi qua Internet, rồi in ra **link MCP**:

```
https://chibi.example.com/mcp/<khoá>
```

Agent dán link là nối được — không cần header:
- Claude Code: `claude mcp add -s user --transport http gen-chibi <link>`
- Claude web/desktop: Customize › Connectors › Add custom connector › dán link (hoặc dán `https://chibi.example.com/mcp` để nối bằng OAuth, xem mục trên)
- Cursor và client khác: `{"mcpServers":{"gen-chibi":{"url":"<link>"}}}`

Link chỉ cấp quyền MCP (không mở Studio hay cài đặt). Các lệnh khác: `genchibi link` (in lại link) · `genchibi link --check` · `genchibi expose --rotate` (đổi khoá, link cũ chết ngay) · `genchibi expose --off` · `genchibi expose --quick` (link tạm `*.trycloudflare.com`, không cần tài khoản, đổi mỗi lần khởi động lại). Docker: tunnel chạy thành container `gen-chibi-tunnel`, tự bật lại cùng app. Node: cần `cloudflared` trong PATH.

Tunnel hoặc proxy riêng, mạng LAN: dùng `genchibi online proxy <tên-miền>` (hoặc đặt `GC_BIND` và `GC_ALLOWED_HOSTS` trong `.env` cho mạng LAN). Từ v0.21 app không bao giờ tin một request chỉ vì thiếu header proxy: Studio luôn cần mật khẩu chủ (đăng nhập), script gọi `/api` hoặc `/mcp` gửi `Authorization: Bearer <token chủ>`.

### Agent tự cập nhật app
Tool MCP `get_app_version` (bản đang chạy, bản mới nhất trên GitHub, ghi chú), `update_app` (tải bản mới, kiểm SHA-256, sao lưu, khởi động lại; bản mới lỗi thì tự quay về bản cũ), `rollback_app` (cần `confirm: "ROLLBACK"`).

## Core AI (LLM API)

Studio › Cài đặt AI: chọn OpenRouter, DeepSeek, MiniMax hoặc địa chỉ tuỳ chỉnh chuẩn OpenAI, dán API key (mã hoá AES-256-GCM trên máy, không bao giờ trả về trình duyệt). "Kiểm tra model" chạy một kịch bản thử và chấm: JSON đúng chuẩn, số lần phải sửa, độ trễ, token.

## Cấu trúc

```
engine/       core.js (khung xương, thư viện, kế thừa 4 tầng, cổng kiểm), render.js (3 tầng vẽ có ngân sách), player.js (trình diễn tác phẩm — dùng chung Studio và phim xuất ra)
kinds/        character/gen.core.js (khung lõi: khuôn mặt, biểu cảm, chuyển động, thân ma-nơ-canh) · khung/gen.khung.js (khối vật phẩm, khối bối cảnh, ma-nơ-canh, sân khấu chuẩn)
studio/       3 ứng dụng Xưởng / Thư viện / Tạo tác (một bộ mã) · mau/ dự án mẫu
server/       API cục bộ, updater, core AI, MCP, kho bí mật
locales/      chữ giao diện tiếng Anh (locales/en/*.json — ADR 0007)
launcher.js   chạy phiên bản hiện tại, canh sức khoẻ sau cập nhật, tự rollback
install.sh    cài một lệnh · cli/genchibi
tools/        test.sh (CI), test-update.sh, test-lang.sh, package.sh
```

## Repo private: token cập nhật

Khi repo phát hành là private, mọi request không token đều bị GitHub trả 404 — cả cài mới lẫn tự cập nhật cần một token chỉ-đọc.

1. GitHub › Settings › Developer settings › Fine-grained personal access tokens › Generate new token.
2. **Repository access**: *Only select repositories* → chỉ `gen-chibi`. **Permissions**: *Contents* = **Read-only** (không cần quyền nào khác).
3. Cài mới (máy chưa có gen-chibi):
   ```bash
   curl -fsSL -H "Authorization: Bearer $GC_GITHUB_TOKEN" https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | GC_GITHUB_TOKEN=$GC_GITHUB_TOKEN bash
   ```
   Installer ghi token vào `.env` (chmod 600), không in ra màn hình.
4. Máy đã cài: chạy `genchibi token` (dán token, ẩn khi gõ) — lệnh ghi `GC_GITHUB_TOKEN` vào `.env` rồi tự khởi động lại. Gỡ token: `genchibi token --clear`.

Token chỉ gửi tới `api.github.com`; khi GitHub chuyển hướng tải file sang host lưu trữ, token bị bỏ. Token không xuất hiện trong `/api/info`, trạng thái cập nhật, log hay MCP.

## Phát hành

Sửa `VERSION` + `CHANGELOG.md` rồi đẩy lên `main` (hoặc đẩy tag `vX.Y.Z`). Workflow `release` chạy kiểm thử, đóng gói, tạo tag và GitHub Release; mọi bản cài tự nhận trong vòng 6 giờ (hoặc bấm "Kiểm tra phiên bản").

## License

© 2026 Gen Labs — **All rights reserved.** Tác giả: **Ryan** — 090.919.8823. Repo công khai để xem, không cấp quyền sử dụng. Xem [LICENSE](LICENSE).
