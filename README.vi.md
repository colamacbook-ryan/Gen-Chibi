# gen-chibi

[English](README.md) | **Tiếng Việt**

**gen-chibi — nhà máy asset chibi theo chủ đề.** Từ một bộ khung chuẩn (ma-nơ-canh, khối vật phẩm, khối bối cảnh) dựng nhân vật / vật phẩm / bối cảnh **bằng code**, cất vào thư viện theo dự án chủ đề, **phát hành** thành gói bán theo chủ đề. **Làm phim** với AI đạo diễn là cách dùng asset — và là bản demo sống của thư viện: chat ra kịch bản, phân cảnh, xuất thành một tệp HTML xem được ở mọi trình duyệt — hoặc thành **video** (MP4 / WebM + phụ đề + ảnh bìa, đăng YouTube / TikTok) ngay từ Chrome / Edge ([Xuất video](docs/HUONG-DAN.md#xuất-video)). Mỗi asset là một **công thức JSON** qua cổng kiểm tự động; engine dựng SVG / PNG / sprite 8 hướng hoặc nhân vật "sống" đổi biểu cảm lúc chạy.

**Bắt đầu nhanh:** mở Studio → **✨ Mở dự án mẫu "Văn phòng vui"** → Tạo tác → bấm tác phẩm trong bảng → tab *Xem & duyệt* → ▶ Cả phim → tab *Xuất bản* → *Phim (HTML)*. Xem một bộ chủ đề trọn vẹn: **🏯 Mở bộ chủ đề mẫu "Tam Quốc"** (7 tướng · 13 trang bị · 8 bối cảnh · phim 6 phân cảnh có dàn dựng, giọng nói, âm thanh, màn đấu võ — dựng hoàn toàn từ khung; bộ mẫu Gen Labs, không xuất bán). Hướng dẫn đầy đủ: [`docs/HUONG-DAN.md`](docs/HUONG-DAN.md).

- **Studio** — **3 ứng dụng độc lập** `/xuong` · `/thu-vien` · `/tao-tac` (desktop, kiểu Data Console), theo dòng chảy: **Xưởng** — bộ khung chuẩn + **Tạo asset mới** (chọn khung → tham số → soát → cổng kiểm → lưu), bàn chỉnh, linh kiện, khung tư thế & biểu cảm, cổng kiểm; **Thư viện** — asset đã qua cổng xếp theo **dự án chủ đề**, tải ảnh / sprite 8 hướng, chép mã, **Nháp / Phát hành**, **Gói sao lưu** (cả tác phẩm) và **Gói bán** (chỉ asset phát hành), nhập gói qua cổng kiểm; **Động tác**, **Âm thanh** (bảng 62 + gói, ▶ nghe trên hàng, luật ghép S1–S7, nhập / tải gói) và **Giọng** (22 vai × 4 ngôn ngữ, giọng máy + giọng AI, thiết kế giọng — nơi duy nhất của bộ giọng vai; Cài đặt AI chỉ còn key + trần câu / ngày); **Tạo tác** — bảng **tác phẩm** → mỗi tác phẩm là một **phòng làm phim** riêng (địa chỉ có id) với 5 tab: *Kịch bản* · *Phân cảnh* (ảnh khung đầu, mô tả, bối cảnh, dàn diễn viên, bước, thời lượng; diff chờ duyệt khi AI đề xuất sửa) · *Xem & duyệt* (▶ từng cảnh / cả phim, Nháp · Cần sửa · Đạt + ghi chú, "Đạt x/y") · *Giọng & âm thanh* (ngôn ngữ, lồng tiếng AI, MỘT bảng giọng chốt theo nhân vật + Chốt giọng cả dàn, luật ghép âm) · *Xuất bản* (phim HTML độc lập, xuất video, storyboard, JSON, gói); AI thiếu nhân vật / bối cảnh thì tự vào Xưởng tạo (đúng dự án).
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
- **Lần chạy đầu (v0.23):** dòng cuối của trình cài nói bước tiếp theo. Trên máy này, mở **link nó in ra** (`http://localhost:7480/login#k=…`) và đăng nhập **admin / admin** trong vòng 30 phút. **admin / admin chỉ dùng được qua link đó từ máy chủ:** link mang một khoá dùng một lần mà chỉ user đã chạy lệnh đọc được (`run/admin-window`, 0600), nên user khác hay container khác trên cùng máy không dùng được cửa sổ. Cửa sổ và link chỉ do lệnh trên máy chủ tạo (trình cài, `genchibi start`, `genchibi open` — `genchibi open` còn mở luôn trình duyệt bằng link đó; mỗi lần chạy ra link mới). Nó chỉ dùng được khi máy **chưa lên mạng**, chỉ từ chính máy này (loopback, không qua proxy) và chỉ tới khi có tài khoản chủ. Khi cửa sổ đóng, trang đăng nhập nói đúng lý do và cách vào. Sau đó:
  1. **Tài khoản chủ** (bắt buộc trước mọi trang): tên đăng nhập của bạn (không phải `admin`), tên hiển thị, email (tuỳ chọn — chỉ dùng làm email liên hệ Let's Encrypt cho đường Caddy) và mật khẩu ít nhất 12 ký tự (một cụm từ dễ nhớ là tốt). `admin / admin` thôi dùng được ngay.
  2. **Tên miền:** *Đưa lên mạng* (đúng các bậc của *Hệ thống › Lên mạng*) hoặc *Chỉ dùng trên máy này*. Một bậc Internet lỗi hoặc chờ lâu: *Tạm dùng trên máy này* cho bạn vào, trang chủ giữ dải nhắc.
  3. **Chẩn đoán MCP:** tự kiểm thật trên máy (HTTP `/mcp`, token chủ, cầu stdio của chính app) cùng **MCP-04**: đúng lệnh trên máy chủ mà agent sẽ chạy (`<đường đầy đủ>/genchibi mcp`), do `genchibi setup check` trên máy chủ kiểm (`genchibi start` / `open` cũng tự chạy), các thẻ nối Claude Code / claude.ai / agent khác, rồi kiểm thật chờ lời gọi đầu tiên của agent. *Xong* mở khi một agent đã nối, hoặc chọn *Tôi nối agent sau* (trang chủ nhắc).

  Đăng nhập lại khi chưa xong thì về đúng bước đang dở. Trình duyệt nhớ thiết bị 30 ngày. Quên mật khẩu: `genchibi password` trên máy chủ. Chính phần kiểm bị lỗi: `genchibi setup skip` (có ghi log); làm lại từ đầu: `genchibi setup reset`. Qua SSH: chuyển cổng trước (`ssh -L 7480:localhost:7480 <máy-chủ>`), rồi mở http://localhost:7480 trên máy của bạn.
- **Cài thẳng lên tên miền** (`--domain` / `--cloudflare`): trình cài hỏi trước tên đăng nhập và mật khẩu chủ (nhập ẩn), hoặc đọc `GC_OWNER_USER` / `GC_OWNER_PASSWORD` từ môi trường khi không có terminal (không bao giờ ghi vào `.env`, dòng lệnh hay log). Không có thì vẫn cài nhưng **không** lên mạng và in hai lệnh cần chạy tiếp (`genchibi password`, rồi `genchibi online …`). Studio khi đó mở thẳng bước 3 (chẩn đoán MCP).
- **Nâng cấp từ v0.22 trở về trước:** mật khẩu cũ vẫn dùng; tên đăng nhập là `owner` (đổi ở *Hệ thống › Tài khoản chủ*). Trang chủ hiện dải *Kiểm tra thiết lập* một lần (tự kiểm MCP + thẻ nối agent). Máy v0.21 / v0.22 đã lên mạng và còn chờ mật khẩu chủ thì vẫn ở trên mạng; đặt tài khoản chủ trên máy chủ bằng `genchibi password`.
- Tuỳ chọn: `--dir <thư mục>` · `--port <cổng>` · `--native` · `--version vX.Y.Z` · `--lang en|vi` · `--domain <tên>` · `--cloudflare` (xem [Ra Internet](#ra-internet-tên-miền-https-mcp-một-bước)).

## Lệnh

```
genchibi start | stop | restart | status
genchibi update            # kiểm tra và cập nhật ngay
genchibi rollback [--yes]  # chạy lại bản trước
genchibi doctor [--yes]    # kiểm bản cài: user của container, cổng, thiết lập lần đầu, edge, lệnh root (và chuyển bản cài root cũ sang tài khoản genchibi)
genchibi override [approve|off] [--yes]  # (root) quyết docker-compose.override.yml: dùng hay chạy không có nó (chưa quyết thì start / update / … dừng)
genchibi logs
genchibi backup | restore <tệp>
genchibi mcp               # cầu MCP stdio cho agent
genchibi token             # đặt token GitHub (repo private), nhập ẩn — KHÔNG phải token chủ (token chủ là GC_API_TOKEN trong .env, hoặc data/owner-token)
genchibi lang [en|vi]      # xem / đặt ngôn ngữ (CLI + giao diện mặc định của Studio)
genchibi open              # mở Studio (lần đầu: mở cửa sổ 30 phút cho admin / admin)
genchibi password          # đặt / đặt lại mật khẩu chủ (lần đầu: tạo tài khoản chủ)
genchibi setup [skip|reset|check] # thiết lập lần đầu: trạng thái · bỏ qua wizard (có log) · làm lại · kiểm lệnh MCP trên máy chủ (MCP-04)
genchibi online …          # ra Internet: tên miền + HTTPS + MCP (xem dưới)
genchibi agent connect     # cấu hình nối cho agent (không in token)
genchibi uninstall
```

### Chạy `genchibi` an toàn: không bao giờ tin thư mục cài (v0.23.1)

Ở bản cài **Docker**, container của app ghi được cả thư mục cài (app tự cập nhật ở đó). Nếu app bị chiếm, mọi thứ trong thư mục đó có thể bị sửa. Vì vậy `genchibi` — chạy **bằng root (sudo) hay bằng user của bạn** (bản cài mặc định, user trong nhóm `docker`, tức mạnh ngang root) — **không bao giờ chạy hay nạp thứ gì trong thư mục cài**:

- **Bản chép riêng đã kiểm.** `~/.local/bin/genchibi` chuyển sang `~/.local/lib/gen-chibi/genchibi` (thư mục 0700; container chỉ thấy thư mục cài). Cả hai lấy từ gói phát hành có SHA-256 khớp `SHA256SUMS` — cùng phép kiểm của trình cài và bộ cập nhật. App tự cập nhật xong thì `genchibi` tự tải và kiểm gói của bản mới một lần (`Release vX verified (SHA-256)`), rồi mới dùng lệnh của bản đó. Lệnh chỉ tiến: rollback app không kéo lệnh cũ về. Bản không kiểm được không bao giờ được dùng — `genchibi` giữ tệp đã kiểm gần nhất và báo rõ.
- **Cần github.com mỗi phiên bản một lần.** Lệnh `genchibi` đầu tiên sau khi app lên bản mới tải bản đó từ github.com (qua proxy của bạn — `HTTPS_PROXY` của shell, hoặc của `.env` — và bộ CA lúc cài). Mất mạng thì dùng tệp đã kiểm gần nhất; máy chưa có tệp nào (bản cài cũ, lần đầu) thì `stop`, `logs` và `mcp` vẫn chạy (dùng tên container), còn lại báo cần github.com. CA trong `.env` không bao giờ dùng cho lần tải này (app ghi được `.env`).
- **Lệnh cũ được thay.** Lệnh do v0.23.0 trở về trước cài ra chạy bản trong thư mục cài ở mỗi lần gõ. Lần đầu gõ nó sau khi app lên v0.23.1, nó tự thay mình (và mọi `genchibi` cũ khác trong PATH thuộc bạn) bằng bản đã kiểm, in `… now runs only verified code`. `genchibi doctor` báo ✗ cho lệnh cũ còn sót (vd của user khác).
- **`.env` là dữ liệu.** `genchibi` đọc các dòng `KHOÁ=giá trị`; không gì được chạy hay mở rộng (không `source`, không `$(…)`). Container luôn chạy bằng chủ thư mục cài — `GC_UID=0` trong `.env`, hay một nhóm đặc quyền (docker, sudo, wheel, adm), không làm nó mạnh hơn. Chế độ chạy ghi theo từng thư mục cài ở `~/.local/lib/gen-chibi/installs` (trình cài ghi `docker …` hoặc `native …`): đổi `GC_MODE` trong `.env` không làm `genchibi` chạy `launcher.js` của thư mục. Bản ghi đó mà user khác đổi được thì `genchibi` từ chối chạy, không đoán. Bản cài Node trước v0.23.1 chưa có bản ghi: `genchibi` chỉ coi là Node khi chứng minh được không có container Docker nào của thư mục đó; không thì coi là Docker và in một dòng nhắc — chạy lại lệnh cài với `--native` một lần để ghi bản ghi.
- **Tệp compose lấy từ gói đã kiểm** (`~/.local/lib/gen-chibi/rel/<bản>/`), thư mục cài là thư mục dự án — và **không bao giờ từ bản cũ hơn v0.23.1**, kể cả khi app chạy bản cũ (sau rollback, hay app trỏ `current` về bản cũ): `genchibi` giữ tệp đã kiểm mới nhất từ v0.23.1 trở lên và báo rõ. Tệp compose edge còn mount thư mục trong thư mục cài thì bị từ chối.
- **Mỗi bản cài có trạng thái riêng** ở `~/.local/lib/gen-chibi/i/<mã>/`: override đã duyệt, giá trị biến duyệt cùng nó, và các thư mục edge Caddy mount (`…/edge`, ngoài thư mục cài — app không tráo được chúng bằng liên kết tới chỗ khác trên máy; chứng chỉ và site có sẵn được chép sang một lần, chép lỗi thì dừng và báo chứ không làm mất). Lần `update` / `rollback` đầu khi edge bật thì dựng lại cả container app, để hai bên dùng cùng thư mục.
- **Một bản cài — một tài khoản.** Tài khoản đã cài (root qua `sudo`, hoặc user của bạn) giữ bản duyệt và thư mục edge. Root bị từ chối trên bản cài mà user của bạn đang quản lý; user của bạn được nhắc dùng `sudo …/genchibi` trên bản cài dựng bằng sudo. `genchibi uninstall` chỉ xoá trạng thái của bản cài đó.
- **Docker cài bằng snap** không đọc được thư mục ẩn trong home, nên ở đó tệp đã kiểm nằm ở `~/gen-chibi-trust` thay cho `~/.local/lib/gen-chibi` (tự nhận ra, cùng luật).
- **`docker-compose.override.yml` của bạn cần bạn quyết.** Tệp nằm trong thư mục cài nên `genchibi` không tự dùng — nhưng chạy thiếu nó có thể gỡ một service bạn đang dựa vào (vd trang đăng nhập riêng đứng trước app). Khi override chưa duyệt, đã đổi, hoặc bị xoá sau khi duyệt, `start`, `restart`, `update`, `rollback`, `restore`, `lang <x>`, `token` và `online …` **dừng trước khi đụng container** (container đang chạy giữ nguyên) và in lệnh cần chạy; `status` và `doctor` báo ✗. Quyết một lần bằng lệnh được in ra (đường tuyệt đối, chạy được cả với `sudo`): `… override approve` hoặc `… override off` (chạy không có nó); không có terminal thì thêm `--yes`. Override có thể là YAML bất kỳ Docker Compose nhận (chú thích tiếng Việt, danh sách flow, anchor, CRLF). genchibi không tự đọc YAML: **Docker Compose phân giải nó** cùng các tệp compose đã kiểm (`docker compose config`), rồi genchibi kiểm phần thay đổi trong kết quả đó. Từ chối, mỗi lỗi một dòng đỏ: `build`, `env_file`, `extends`, `include`, `develop`, `use_api_socket`, `provider`, `volumes_from`; mọi thứ đọc tệp theo đường tương đối với thư mục cài; mọi đường trên máy (bind `source`, `device`, devices) tương đối, trong thư mục cài, là liên kết, có `.` / `..` hoặc thư mục cha không có; **đường trên máy mà app tráo được** — chính nó hoặc một thư mục phía trên thuộc tài khoản của app (uid / nhóm của thư mục cài), hoặc tài khoản khác ghi được mà không có bit t (nguồn bind phải thuộc root, hoặc một tài khoản không phải của app, và app không ghi được); socket Docker hoặc thư mục phía trên nó (`/`, `/var/run` …); biến `COMPOSE_*` / `DOCKER_*`; và trong chính chữ của override: các từ `extends`, `include`, `env_file`, `label_file` ở bất kỳ đâu (Docker Compose chép thẳng tệp được nêu vào kết quả nên khoá biến mất — vài phiên bản Compose làm vậy cả với `env_file`), chuỗi thoát `\x` / `\u` / `\U`, `\` cuối dòng, chỉ thị `%`, mọi tag YAML trừ `!reset` / `!override`, byte NUL hoặc dấu thứ tự byte UTF-16 / UTF-32, khoá tường minh `? `, `\` đứng trước CR hoặc byte ngoài ASCII, và các ký tự ngắt dòng NEL / LS / PS (có thể viết ẩn một khoá). Khi genchibi chạy bằng root, Docker Compose phân giải override trong một mount namespace riêng, ở đó thư mục cài là thư mục rỗng chỉ đọc — đường đi thẳng vào thư mục cài không đọc được; root không làm được việc này (không có `unshare`, hoặc mount bị chặn) thì override bị từ chối. Đường dưới `/proc`, `/sys`, `/dev/fd`, nguồn bind chưa có trên máy (tạo trước) và nguồn có ACL mở rộng cũng bị từ chối. Từ đó nằm trong giá trị cũng tính — đổi tên đi. Cảnh báo (vẫn duyệt được) cho `privileged`, `pid` / `ipc` / `network_mode` host, `cap_add`, `devices`, `security_opt`, `user`, bind `propagation` `shared` / `slave`, `device_cgroup_rules`, `group_add`, `runtime`, và bind thư mục hệ thống cho ghi (`/etc`, `/root`, `/proc`, `/sys`, `/boot`, `/run`, `/var/lib/docker`); in các dòng override thêm và bỏ (kèm service và khoá), và khi kết quả phân giải đổi sau khi duyệt thì in các dòng mới. Duyệt thì chụp **giá trị hiện tại** của các biến `.env` nó dùng (in tên, không in giá trị) — mọi khoá trừ `GC_UID`, `GC_GID`, `GC_PORT`, `GC_BIND`, `GC_EDGE_DIR` do genchibi tự tính; giá trị có dấu `'` bị từ chối. Mọi lệnh Compose có thể tạo container (`up`, `run` — vd `genchibi password` khi app dừng —, `create` …) phân giải lại, **chạy lại mọi phần kiểm ở trên trên máy này** (đường bị thay bằng liên kết sau khi duyệt bị bắt ở đây) và chạy **đúng tệp đã phân giải đó**; tệp, giá trị, kết quả phân giải hay một phần kiểm đổi từ lúc duyệt thì dừng và hỏi lại. Lệnh chỉ đụng container có sẵn (`stop`, `logs`, `exec` …) dùng tệp đã kiểm gần nhất, không bao giờ override thô. Cần có Docker Compose (bản cài Docker luôn có).
- **Bằng root, trong thư mục cài `genchibi` làm việc bằng chủ của thư mục** (`setpriv`, hoặc `sudo -u`): sao lưu, khôi phục, sửa `.env`, tệp lần đầu. Trình cài làm y như vậy trên thư mục có sẵn và không đổi chủ gì ở đó. Liên kết cài sẵn không chuyển hướng được chỗ root đọc / ghi.

**Bản cài native** (`--native`, không Docker) thì khác: app chạy bằng user của bạn, không có container, nên không có ranh giới để giữ — `genchibi` ở đó vẫn như cũ (đi theo bản đang cài).

### `genchibi doctor`

Kiểm bản cài, mỗi mục một dòng ✓ / ! / ✗: app trả lời, lệnh root và tệp compose đã kiểm, override đã duyệt, container chạy bằng user nào, cổng (`GC_BIND`, Docker chỉ publish ở loopback, cổng bị chương trình khác chiếm), bước thiết lập lần đầu, edge Caddy (cổng 80/443) và tunnel. Thoát 1 khi có ✗.

Bản cài bằng root **không qua sudo** với v0.21.0–0.21.2 cho container chạy bằng uid `1000` — một phép đoán, trên máy dùng chung có thể là tài khoản của người khác. `doctor` chỉ đề nghị khi có bằng chứng: chạy bằng root, và trình cài đã ghi bản cài root không sudo (`GC_INSTALLED_BY=root`, từ v0.23.1), hoặc uid 1000 không thuộc ai. Nó không bao giờ đề nghị gì với chính chủ thư mục, và khi không biết chắc (bản cài cũ) thì chỉ in một dòng — nếu uid 1000 không phải bạn, chạy `genchibi doctor --migrate`. Việc chuyển sang tài khoản hệ thống `genchibi`: dừng app (và dừng luôn ở đó, không đổi gì, nếu uid 1000 còn tiến trình khác đang chạy — có thể có người đăng nhập bằng user đó), tạo / dùng lại tài khoản (không đăng nhập được), đổi chủ **chỉ** các tệp thuộc uid cũ (không đi theo liên kết), sửa `GC_UID` / `GC_GID` / `GC_INSTALLED_BY` trong `.env` rồi chạy lại. Lệnh hỏi trước; `genchibi doctor --yes` làm luôn không hỏi. Chạy lại trình cài không tự đổi uid — nó nhắc chạy `genchibi doctor`.

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

**Từng bậc, nhìn thấy:** `genchibi online` in mỗi bậc (tên miền / DNS, edge, cổng, chứng chỉ, địa chỉ công khai, MCP từ Internet) với ✓ / ✗ và cách sửa khi ✗, rồi in `https://tên-miền` và `https://tên-miền/mcp`. Lên mạng cần có tài khoản chủ trước: khi máy còn chỉ có `admin / admin` (hoặc chưa tạo tài khoản), `genchibi online` và *Lên mạng* từ chối và bảo chạy `genchibi password` trên máy chủ (hoặc làm xong màn lần đầu). Mật khẩu không bao giờ được hỏi trên địa chỉ công khai.

```
genchibi online                         # trạng thái: chế độ, địa chỉ, từng bậc, edge
genchibi online caddy <tên-miền>        # đường A (Docker): bật edge Caddy (cổng 80/443), HTTPS
genchibi online cloudflare <tên-miền>   # đường B: chibi.example.com, hoặc example.com (+ --sub tên; mặc định chibi)
genchibi online proxy <tên-miền> | quick  # proxy riêng | link tạm
genchibi online recheck [--waf-done]    # đi tiếp sau khi đã sửa một bậc
genchibi online off                     # thôi ra Internet (có GC_CF_TOKEN: dọn cả tunnel / DNS / luật WAF app đã tạo)
genchibi online migrate                 # máy cấu hình tay trong .env (GC_PUBLIC_URL / GC_ALLOWED_HOSTS) trước v0.21
```

Đổi địa chỉ công khai sẽ đăng xuất các agent nối bằng OAuth (phải nối lại); lệnh hỏi trước (`--yes` khi không có terminal). `genchibi expose` / `genchibi link` (cách của v0.20) đã bỏ ở v0.23 — xem [bên dưới](#đã-bỏ-ở-v023-genchibi-expose--genchibi-link).

**Bản sao lưu chứa mật khẩu và phiên; khôi phục thì Go online tắt.** `genchibi backup` lưu `data/`, nay gồm cả mật khẩu chủ (đã băm), các phiên Studio / thiết bị đã nhớ và cấu hình lên mạng. `genchibi restore <tệp>` giữ mật khẩu của bản sao lưu nhưng đăng xuất mọi phiên và thiết bị, và đưa Go online về **tắt** (không địa chỉ công khai, tunnel dừng). Bản sao lưu làm trên **chính máy này** giữ mã bản cài, nên *Go offline* vẫn xoá được tunnel và bản ghi DNS Cloudflare của máy mình; bản sao lưu từ máy khác (hoặc làm trước v0.23.1) nhận mã bản cài mới, nên không bao giờ chiếm tên miền hay tunnel của máy đó. Máy được nhận ra bằng `run/machine-id` (ngẫu nhiên, tạo lúc cài) và băm của machine id hệ thống — cả hai nằm ngoài `data/`, không bao giờ vào bản sao lưu. Khôi phục xong thì chạy lại Go online.

**Máy đã có trang đăng nhập riêng đứng trước app** (vd proxy đưa người dùng tới `/login` của riêng nó): app nay có tài khoản chủ và trang `/login` riêng (`/setup` của v0.21 / v0.22 nay chuyển về `/login`). Trong proxy, chỉ chặn đường của người và để `/login`, `/oauth/authorize` của app đi tới app phía sau lớp đăng nhập của bạn (đường máy — `/mcp`, `/.well-known/…`, `/oauth/register|token|revoke` — vẫn phải để trống như trước). Đoạn mẫu `genchibi online proxy` in ra chỉ chỗ đặt lớp đăng nhập của bạn.

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
- Nội dung của bạn (tên nhân vật, kịch bản, lời thoại) không bao giờ bị dịch. Bộ mẫu *Tam Quốc* giữ nội dung tiếng Việt; dự án mẫu *Văn phòng vui* mời theo ngôn ngữ giao diện (tiếng Việt, hoặc bản tiếng Anh *Fun Office*).
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

58 tool, theo nhóm:
- **Mở đầu:** `start_here`, `get_guide`
- **Nhân vật:** `get_catalog` · `list/get/validate/save/render_character`
- **Linh kiện:** `get_part_spec` · `preview_part` · `save_part`
- **Trang bị:** `list/validate/save/render_item`
- **Cảnh:** `list/validate/save/render_scene`
- **Gói động tác:** `list_actions` · `list_motion_packs` · `get_motion_pack` · `get_motion_spec` · `validate/save_motion_pack` · `render_action` (sprite sheet / khung / timeline)
- **Thư viện âm thanh:** `list_sounds` · `get_sound_spec` · `get_sound_pack` · `validate_sound_pack` · `save_sound_pack` · `delete_sound_pack` (chỉ chủ máy) · `lint_sound_track` (7 luật ghép âm S1–S7)
- **Phim:** `get_director_schema` · `validate_event` · `save_event` · `list/get_event` · `list/get/save_work` · `list_work_versions` · `restore_work_version` (không mất bản nào) · `get_storyboard` · `export_film_html` (cùng tệp với Studio › Xuất bản) · `save_shot` · `preview_shot` · `render_voice` (đọc thoại bằng giọng AI Google theo vai + ngôn ngữ + giọng vùng — chủ máy dán key là chạy) · `design_voice` (thiết kế giọng cho một vai: ông lão, bà lão, võ tướng…)
- **Dự án & bộ mẫu:** `list/save_project` · `export/import_project` · `list_samples` · `install_sample`
- **Hệ thống:** `get_app_version` · `update_app` · `rollback_app`

Tạo linh kiện: `get_part_spec` → vẽ (SVG an toàn, token màu) → `preview_part` (bàn soát) → `save_part`. Trợ lý AI trong Studio (dock cột phải ở mọi khu; ở Tạo tác là AI đạo diễn) dùng đúng bộ tool này — mọi lối ghi đi qua một cổng kiểm (xem `docs/QUY-TRINH-LINH-KIEN.md` mục 6).

### Nối claude.ai bằng `https://tên-miền/mcp` — OAuth, chỉ cần bấm Cấp phép (v0.19)
App tự làm máy chủ cấp phép OAuth 2.1, gồm khám phá RFC 9728 / 8414, tự đăng ký client (DCR), PKCE S256 và token có hạn, lưu dạng băm. Cách nối: ra Internet trước ([ở trên](#ra-internet-tên-miền-https-mcp-một-bước) — bước này đặt địa chỉ công khai), vào claude.ai *Customize › Connectors › Add custom connector*, dán `https://tên-miền/mcp` rồi bấm **Connect**. Trang **Cấp phép** của app hiện ra để chọn mức quyền (`mcp:read` · `mcp:write` · `mcp:owner`); trang dùng phiên đăng nhập Studio (mật khẩu chủ), chưa đăng nhập thì mời đăng nhập. Quản lý và thu hồi ở **Studio › Hệ thống › Kết nối agent**. Nếu dùng proxy hoặc trang đăng nhập riêng thì các đường máy (`/mcp`, `/.well-known/oauth-*`, `/oauth/register|token|revoke`) phải đi thẳng tới app — `genchibi online proxy <tên-miền>` in sẵn cấu hình đó. Đoạn Caddy mẫu nằm ở `docs/Caddyfile.oauth.example`; cách xử lý Cloudflare và các lỗi thường gặp nằm trong `docs/HUONG-DAN.md` › mục 6.

### Đã bỏ ở v0.23: `genchibi expose` / `genchibi link`
Từ v0.21.3 hai lệnh này là bí danh của `genchibi online`. Giờ chúng không chạy gì: in một dòng `genchibi … đã bỏ ở v0.23 — dùng: genchibi online …` rồi thoát với mã `2`.

| Lệnh cũ | Dùng thay |
|---|---|
| `genchibi expose <tên-miền> [--overwrite-dns]` | `genchibi online cloudflare <tên-miền> [--overwrite-dns]` |
| `genchibi expose --quick` | `genchibi online quick` |
| `genchibi expose --off` | `genchibi online off` |
| `genchibi link` · `genchibi link --check` | `genchibi online` · `genchibi online recheck` |

Máy ra Internet bằng `expose` cũ (`.env` có `GC_TUNNEL`): profile Docker `tunnel` / `quick` và cloudflared chạy kèm `genchibi start` (bản native) đã bỏ, nên tunnel cũ không còn được chạy. `genchibi start` / `update` / `status` in một dòng nhắc chạy `genchibi online migrate`: lệnh này chuyển `GC_PUBLIC_URL` / `GC_ALLOWED_HOSTS` sang Ra Internet, dừng tunnel cũ còn sót và bỏ `GC_TUNNEL` khỏi `.env`. Sau đó mở lại tên miền bằng `genchibi online cloudflare <tên-miền>` (hoặc `genchibi online quick`). Link MCP có khoá (`https://<tên-miền>/mcp/<khoá>`) vẫn chạy khi còn `GC_MCP_KEY`; lộ link thì đổi `GC_MCP_KEY` trong `.env` rồi chạy `genchibi restart` (`expose --rotate` đã bỏ).

Tunnel hoặc proxy riêng, mạng LAN: dùng `genchibi online proxy <tên-miền>` (hoặc đặt `GC_BIND` và `GC_ALLOWED_HOSTS` trong `.env` cho mạng LAN). Từ v0.21 app không bao giờ tin một request chỉ vì thiếu header proxy: Studio luôn cần mật khẩu chủ (đăng nhập), script gọi `/api` hoặc `/mcp` gửi `Authorization: Bearer <token chủ>`.

### Agent tự cập nhật app
Tool MCP `get_app_version` (bản đang chạy, bản mới nhất trên GitHub, ghi chú), `update_app` (tải bản mới, kiểm SHA-256, sao lưu, khởi động lại; bản mới lỗi thì tự quay về bản cũ), `rollback_app` (cần `confirm: "ROLLBACK"`).

## Sân khấu Live: xem agent làm việc (v0.24)

Một nhân vật chibi diễn từng bước thật của agent AI trong lúc bạn chat với nó: đi tới giá sách để đọc, tới bàn để
gõ phím, tới phòng test để chạy test (và lục túi lấy bình chữa cháy khi test đỏ mãi), gọi trợ lý vào qua cửa, nhấp cà
phê khi chờ bạn và ngủ gật nếu bạn để lâu. Studio › Hệ thống › **Sân khấu Live**. Âm thanh tắt cho tới khi bạn bật.

Nối Claude Code — trên máy chạy Claude Code:

```bash
genchibi live hook --install-into ~/.claude/settings.json   # ghép hooks (có sao lưu); khởi động lại Claude Code
genchibi live hook                                          # hoặc chỉ in đoạn cấu hình để bạn tự dán
```

Tệp hook là bản chép nằm ngoài thư mục cài (bản Docker lấy từ gói phát hành đã kiểm SHA-256), không bao giờ làm
Claude Code chờ và chỉ gửi loại việc — không prompt, nội dung tệp, đường dẫn, lệnh hay kết quả. Token live (nằm trong tệp 0600 cạnh tệp hook, không bao giờ trên dòng lệnh)
chỉ gửi được sự kiện Live. Agent khác gọi tool MCP `live_event`. Chi tiết: [docs/LIVE.md](docs/LIVE.md).

**Công tắc việc** (luật vàng cho mọi agent, có trong chỉ dẫn MCP, `start_here` và skill của agent): khi agent bắt đầu
một việc khác việc đang làm, nó gọi `live_task` trước (`code`, `debug`, `test`, `research`, `read`, `write`, `design`,
`plan`, `review`, `release`, `chat`, `other` + tiêu đề ngắn). Nhân vật đập bảng clapper, cất hết đồ, đổi dấu trên mũ rồi
đi về góc của việc đó; Studio hiện "Đang làm: …" và gắn việc cho các sự kiện sau. Gửi lại cùng việc thì không có gì xảy ra.

**Lời mời (v0.24.1):** agent nối qua MCP (kết nối của chủ máy và agent bạn đã duyệt — OAuth, quyền ghi) gọi được `live_setup` để nhận kế hoạch và MỘT lệnh dựng Sân khấu Live trên máy
của nó. Luật vàng: agent phải **hỏi người dùng trước**, không bao giờ chạy lén. Lệnh tải tệp hook từ bản phát hành GitHub
chính thức của đúng phiên bản này và kiểm SHA-256 trước khi ghi — và chỉ được tải từ đúng tiền tố
`https://github.com/colamacbook-ryan/Gen-Chibi/releases/download/v<version>/` (URL khác: từ chối và báo người dùng); app chỉ cấp token live riêng cho agent đó (liệt kê ở
trang Live, có nút Thu hồi) và địa chỉ của app.

## Giọng đọc local miễn phí (TTS trên máy bạn, v0.25.1)

Studio, trợ lý AI và mọi agent đang nối đọc lời thoại bằng **máy TTS miễn phí trên chính máy bạn** trước, rồi mới tới giọng Google Gemini (chỉ chủ máy, cần key), cuối cùng là giọng trình duyệt. Máy TTS kiểu OpenAI nào cũng được (`POST /v1/audio/speech` trả WAV); danh sách giọng đọc lúc chạy từ `GET /v1/voices` hoặc `GET /v1/audio/voices`.

| Ngôn ngữ | Bộ đọc gợi ý (Apache-2.0, bạn tự cài) | Địa chỉ mặc định trong Docker | Model |
|---|---|---|---|
| Tiếng Việt, tiếng Anh | VieNeu-TTS | `http://host.docker.internal:8000` | `vieneu` |
| Tiếng Trung | Kokoro-FastAPI (giọng `zf_xiaobei`) | `http://host.docker.internal:8880` | `kokoro` |
| Tiếng Quảng Đông | (giữ Google Gemini) | | |

- **Cho máy TTS chỉ nghe trên máy này.** Kokoro-FastAPI: `docker run -d --name kokoro -p 127.0.0.1:8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest`. VieNeu-TTS: chạy server kiểu OpenAI của nó, nghe `127.0.0.1`, cổng `8000` (xem README của VieNeu). gen-chibi không mang mã / model của chúng — tự kiểm license (Apache-2.0).
- **macOS / Windows (Docker Desktop):** `host.docker.internal` tới được `127.0.0.1` của máy — không cần làm gì thêm. **Linux:** compose của app trỏ `host.docker.internal` về cầu Docker, không tới được máy TTS chỉ nghe `127.0.0.1`; hoặc cho máy TTS nghe địa chỉ cầu (`172.17.0.1`, vẫn không ra Internet), hoặc chạy nó thành container cùng mạng Docker và dùng tên container (vd `http://kokoro:8880`). Cài thẳng (không Docker): `http://127.0.0.1:<cổng>`.
- **Studio › Hệ thống › Cài đặt AI › Giọng đọc local:** mỗi ngôn ngữ — bật / tắt, địa chỉ, model, giọng mặc định (chọn từ danh sách máy TTS báo), trạng thái (sống / không phản hồi, số giọng) và số câu hôm nay. Chỉ nhận địa chỉ trên máy này hoặc mạng riêng (loopback, `host.docker.internal`, 10.x / 172.16–31.x / 192.168.x, tên container), kiểm lại lúc nối; agent không bao giờ đặt hay gửi được địa chỉ.
- **Trần mỗi ngày** (chỉ câu mới; câu đã lưu miễn phí): 500 câu / ngày cho cả máy (đổi ở cùng bảng), và theo kênh: 200 cho OAuth `mcp:write`, 200 cho trợ lý AI trong Studio, 100 cho link MCP có khoá.
- Giọng theo vai của nhân vật (giọng vùng × giới cho tiếng Việt) ở `kinds/voice/local-tts.json`; giọng máy TTS không có thì rơi về giọng mặc định của ngôn ngữ, kèm cảnh báo.

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
