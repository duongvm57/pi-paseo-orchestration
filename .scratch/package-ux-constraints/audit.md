# Audit các ràng buộc ảnh hưởng trải nghiệm sử dụng

Ngày rà soát: 2026-08-17
Phạm vi: `pi-paseo-orchestration` trên nhánh `feat/direct-role-orchestration-v0.2`, commit `c8d94b4`, cộng hai thay đổi đang staged trong `extensions/pi-paseo-orchestration.ts` và `test/package.test.mjs`.
Mục tiêu: tìm các điều kiện tiên quyết, fail-closed gate và ceremony khiến người dùng không thể bắt đầu hoặc hoàn tất một workflow thông thường.

## Kết luận ngắn

Fix đang staged đã bỏ đúng gate đầu tiên: Lead có Workspace Protocol hợp lệ có thể khởi động trong thư mục chưa `git init`. Tuy nhiên Git chưa thực sự là optional ở cấp sản phẩm:

- tài liệu vẫn công bố Git là prerequisite;
- mọi write result muốn đi đến Stable Candidate/Local Acceptance vẫn bắt buộc Git;
- candidate bắt buộc đúng một commit, lịch sử tuyến tính, `HEAD` trùng candidate và worktree sạch tuyệt đối;
- worktree không bị runtime tự động ép, nhưng README, Lead Profile và skill yêu cầu Lead tự tạo isolated worktree khi thấy cần, thay vì đề xuất để Human chọn;
- bản sửa Gitless chỉ đang staged, package version vẫn là `0.2.0`.

Ngoài Git, các blocker lớn nhất là Workspace Protocol bắt buộc và quá strict, full settings phải cấu hình upfront, Doctor không thể PASS bằng CLI fallback hiện có, permanent process latch, static tool ceilings, raw-shell regex chặn nhầm, và các JSON envelope phải do model sinh chính xác.

## Trạng thái sau lượt sửa

Đã xử lý các ràng buộc có tác động trực tiếp nhất:

- Git và Workspace Protocol thiếu không còn chặn core mode; Git chỉ còn cần cho Stable Candidate, Local Acceptance và isolation Git-backed.
- Doctor hạ workspace/MCP attestation chưa quan sát được xuống `WARN`; đây vẫn là giới hạn môi trường rõ ràng, không phải blocker core.
- Guard shell đã parse executable/segment thay vì tìm chuỗi thô; prose, lệnh read-only và nội dung có dấu `;`/`|` trong quote không bị chặn nhầm.
- Worktree được mô tả và hướng dẫn là lựa chọn do Lead đề xuất để Human chọn/xác nhận; moving scope có thể serialize.

Các ràng buộc cố ý giữ lại (candidate identity, Human Local Acceptance, role topology, write-mode binding và protocol malformed/drift) vẫn là safety boundary cho các capability tương ứng, không phải prerequisite của core mode.

## Cách xếp mức độ

- **P0**: chặn first useful run hoặc làm endpoint được quảng bá không thể đạt trong đường chạy bình thường.
- **P1**: chặn workflow phổ biến, gây retry/restart thường xuyên hoặc tạo false positive rõ ràng.
- **P2**: ceremony/onboarding/maintenance cost; vẫn có workaround nhưng trải nghiệm kém.

## Bằng chứng thực nghiệm

### Gitless differential repro

Test hiện tại:

```sh
node --test --test-name-pattern='lead in a non-git directory' test/package.test.mjs
```

Đã chạy cùng test trên hai implementation:

| Implementation | Kết quả | Tín hiệu |
| --- | --- | --- |
| `HEAD` (`c8d94b4`) | exit `1` | `AssertionError: lead must pin without a git repository` |
| working tree đang staged | exit `0` | test pass |

Đây là differential loop nhanh và deterministic, khoảng 0,3 giây/lượt. Test nằm tại `test/package.test.mjs:1667`.

### Các gate đã được test chủ động

Hai lượt targeted test đã chạy, tổng cộng 16 test pass. Chúng xác nhận hành vi là chủ ý chứ không phải suy đoán từ comment:

- protocol thiếu/sai và protocol byte drift chặn;
- thiếu `read` hoặc outer `mcp` chặn Lead;
- runtime model/thinking phải exact;
- candidate recheck Git parent/linearity/scope/HEAD/cleanliness;
- report lạ/thừa/sai vị trí bị reject;
- agent ID/topology/CLI observation fail-closed;
- `create_agent`, mid-run message và terminal Peer Report dùng closed schema.

### False-positive probe của command guard

Gọi trực tiếp `checkToolCall` với tool `bash` đang được allow cho kết quả:

| Role | Command vô hại | Kết quả hiện tại |
| --- | --- | --- |
| Peer | `echo paseo` | BLOCK |
| Peer | `rg TODO /tmp/pi-paseo-orchestration` | BLOCK |
| Lead | `gh pr view 123` | BLOCK như publication |
| Lead | `git merge-base HEAD origin/main` | BLOCK như publication |
| Lead | `echo git push` | BLOCK như publication |
| Lead | `git worktree add /tmp/wt HEAD` | ALLOW |
| Lead | `git status --short` | ALLOW |

Điều này cũng xác nhận worktree không phải runtime hard gate; ràng buộc worktree hiện nằm chủ yếu ở policy text/prompt.

## Findings

### P0-01 — Fix Gitless chưa trở thành hành vi package hoàn chỉnh

**Hiện trạng**

- `HEAD` vẫn chặn Lead ngoài Git; chỉ working tree đang staged đã sửa.
- `package.json` vẫn là version `0.2.0`.
- README vẫn ghi “A Git repository for governed work” tại `README.md:98-105`.
- Architecture vẫn ghi Git repo và khả năng tạo worktree là prerequisite tại `docs/architecture.md:126-130`.
- Authoring Guide yêu cầu Git Stable Candidate cho mọi task class tại `skills/workspace-protocol/AUTHORING-GUIDE.md:78-82` và `:258-266`.

**Ảnh hưởng UX**

Người dùng package hiện tại vẫn gặp đúng lỗi đã nêu; ngay cả khi source patch được dùng, tài liệu vẫn hướng họ đến `git init` và mô hình Git-only.

**Đề xuất**

Release fix bằng version/source mới và sửa đồng thời README, Architecture, Authoring Guide, Role Profile. Công bố rõ capability matrix: core orchestration không cần Git; Git candidate, worktree và Git acceptance chỉ khả dụng khi Git được bật.

### P0-02 — Workspace Protocol là global gate cho Lead

**Hiện trạng**

- Settings hợp lệ chưa đủ; Lead còn phải có `.orchestration/workspace-protocol.md` trước first input.
- Thiếu protocol chặn input, `before_agent_start` và tool calls (`extensions/pi-paseo-orchestration.ts:5053-5058`, `:5209-5217`, `:5365-5369`).
- Schema yêu cầu đúng 5 metadata key, 6 core headings, một tập heading optional đóng kín, từ khóa `must_ask`, và ba task-class names (`:2136-2275`).
- Bất kỳ byte drift nào sau pin đều yêu cầu fresh process (`:2358-2364`). Restoring bytes không clear block; test tại `test/package.test.mjs:1572` cố ý xác nhận điều này.
- README yêu cầu Human chạy một cuộc interview rồi xác nhận diff trước khi bắt đầu (`README.md:166-182`).

**Ảnh hưởng UX**

Một file policy mang tính nâng cao chặn cả input/read bình thường. Sửa typo, comment hoặc format trong protocol giữa phiên làm toàn phiên chết và buộc restart.

**Đề xuất**

- Có built-in safe default khi protocol vắng mặt.
- Chỉ gate action thật sự cần policy: concurrent writers, review/acceptance hoặc external effect.
- Validate semantics thay vì exact heading vocabulary.
- Cho phép explicit repin/reload sau Human confirmation; không dùng permanent latch cho drift có thể phục hồi.

### P0-03 — Full settings matrix bắt buộc trước khi dùng bất kỳ governed role nào

**Hiện trạng**

- Thiếu settings chặn activation (`extensions/pi-paseo-orchestration.ts:327-334`).
- Document luôn phải có model cho cả Supervisor và Lead, dù Supervisor là optional.
- Document luôn phải có năm Peer routes `fast/general/reasoning/coding/architecture`; wizard còn thêm `reviewer` (`:11-21`, `:54-79`).
- Model và thinking level phải tồn tại, apply được và read-back exact (`:353-395`).

**Ảnh hưởng UX**

Một người chỉ muốn Lead-only hoặc một Peer route vẫn phải cấu hình toàn bộ topology/model matrix trước first run.

**Đề xuất**

Lazy configure theo role/route thực sự được dùng. Default Lead bằng current model, một `general` Peer route, Supervisor/reviewer/routes khác cấu hình on demand. Doctor nên báo capability thiếu theo action, không chặn role không dùng capability đó.

### P0-04 — Doctor không thể PASS bằng fallback được hỗ trợ hiện tại

**Hiện trạng**

- Khi adapter không có public observer, package fallback sang `paseo inspect` (`extensions/pi-paseo-orchestration.ts:3513-3530`).
- Fallback tự đặt `mcp_configuration_attested: false` (`:3560-3574`).
- `WORKSPACE_BINDING` lại yêu cầu attestation `true`, nếu không là `BLOCKED` (`:3842-3844`).
- Test `test/package.test.mjs:3350-3379` chủ động khẳng định CLI observer có thể prove identity/model/thinking nhưng overall Doctor vẫn `BLOCKED`.
- Cùng lúc đó activation thực tế chỉ dùng fallback để lấy parentage và có thể tiếp tục. Doctor strict hơn runtime.

**Ảnh hưởng UX**

Bước setup chính thức `/ppo:doctor` báo không ready trong chính đường fallback mà package hỗ trợ. Người dùng không có remediation khả thi để đưa bảng về PASS nếu adapter hiện tại không cung cấp attestation.

**Đề xuất**

Không có một `overall_status` lấy worst-of-all cho mọi use case. Báo riêng:

- `CORE_READY`;
- `GIT_READY`;
- `WORKTREE_READY`;
- `ATTESTED_ACCEPTANCE_READY`.

CLI fallback nên đủ cho core work; missing attestation là WARN hoặc chỉ BLOCK action cần attested workspace.

### P0-05 — Local Acceptance phụ thuộc một hidden context seam không có producer trong repo

**Hiện trạng**

- Direct Human acceptance phải là exact XML/JSON block, source phải là `interactive`, candidate phải là Git ref (`extensions/pi-paseo-orchestration.ts:1902-1929`).
- Input handler còn yêu cầu `ctx.acceptanceChain`; nếu thiếu thì chặn (`:5219-5224`).
- `rg` toàn repo cho thấy `ctx.acceptanceChain` chỉ có đúng một consumer tại dòng 5221; không có producer, wiring hay input-seam test.

**Ảnh hưởng UX**

Theo bằng chứng trong repo, endpoint “Human Local Acceptance” không thể đi qua đường input thông thường trừ khi một integration bên ngoài inject field không được tài liệu hóa. Đây là inference có độ tin cậy cao ở phạm vi repo; chưa loại trừ một host extension ngoài repo.

**Đề xuất**

Package phải sở hữu hoặc công khai typed integration tạo chain. Cung cấp `/ppo:accept` để Human chọn candidate/verdict; command tự dựng document, không bắt Human gõ JSON và không dựa vào context field ngầm.

### P1-06 — Git vẫn bắt buộc cho mọi write result muốn được coi là hoàn tất

**Hiện trạng**

Stable Candidate chỉ chấp nhận `git:v1:<task-base-full-oid>:<candidate-full-oid>` (`extensions/pi-paseo-orchestration.ts:1371-1387`). Eligibility yêu cầu:

- exact Git repository root;
- exact full object IDs;
- candidate là single-parent commit;
- run tạo đúng một commit;
- history từ task base tuyến tính;
- current `HEAD` đúng candidate;
- không có staged, unstaged hoặc untracked residue;
- mọi path nằm trong một exact scope;
- cumulative diff không rỗng (`:1404-1474`).

README cũng nói mọi write work kết thúc bằng immutable local Git candidate (`README.md:228-232`).

**Ảnh hưởng UX**

Git chỉ optional cho việc khởi động/read-only. Người dùng không Git, workflow nhiều commit, merge commit, detached review checkout, hoặc repo có untracked notes đều không thể đi đến acceptance.

**Đề xuất**

Định nghĩa candidate interface theo capability, ví dụ `git:v1`, `artifact:v1:<sha256>`, hoặc `working-result` không có acceptance guarantee. Cho phép commit range/diff digest thay vì hard-code đúng một commit. Cleanliness nên chỉ xét collision/scope liên quan, không phải mọi untracked file.

### P1-07 — Worktree là policy mandate, chưa phải Human option

**Hiện trạng**

- Runtime không tự chạy `git worktree`; probe xác nhận `git worktree add` chỉ là command được allow.
- README nói concurrent writers bắt buộc isolated checkouts và Lead tự chuẩn bị (`README.md:87-90`).
- Lead Profile yêu cầu “Create and manage required isolated worktrees yourself” (`profiles/lead.md:14`).
- Orchestration skill lặp lại yêu cầu này (`skills/ppo-orchestrate/SKILL.md:44-45`).

**Ảnh hưởng UX**

Đây là constraint do prompt/policy điều khiển: Lead có thể tự thay đổi Git infrastructure dù người dùng chỉ muốn serialize work hoặc duy trì một checkout.

**Đề xuất**

Đổi thành explicit isolation choice:

1. Mặc định một writer hoặc scope không overlap: không worktree.
2. Khi có collision risk: Lead trình proposal gồm lý do, base, destination, cleanup plan.
3. Human chọn `create worktree`, `serialize writers`, hoặc `cancel concurrency`.
4. Chỉ `required` khi Workspace Protocol của repo đã opt in rõ ràng.

### P1-08 — Raw-shell regex chặn nhiều command vô hại

**Hiện trạng**

- Peer block mọi command string có token `paseo`, không kiểm tra executable (`extensions/pi-paseo-orchestration.ts:761-767`). Vì tên package/path chứa `pi-paseo-orchestration`, chính absolute path của repo gây false positive.
- Publication regex block mọi `gh pr`, không chỉ create/merge; block substring `git merge`, nên `git merge-base` read-only cũng bị chặn (`:211-220`, `:773-776`).
- String như `echo git push` cũng bị chặn, trong khi aliases/scripts vẫn có thể bypass. Source tự thừa nhận đây không phải sandbox (`:211-214`, `README.md:234-238`).

**Ảnh hưởng UX**

Guard vừa gây false positive cho inspection bình thường, vừa không tạo security boundary thực sự.

**Đề xuất**

Ưu tiên typed tools. Nếu phải kiểm tra shell, parse command/argv và chỉ deny effectful subcommands (`git push`, `git merge`, `gh pr create|merge`, deploy apply), cho phép read-only commands. Thêm regression matrix cho benign text/path/quoted commands.

### P1-09 — Static tool ceilings loại bỏ mọi tool mới hoặc tool ngoài danh sách đóng

**Hiện trạng**

- Supervisor/Lead chỉ có `read`, `bash`, `mcp`; Peer chỉ có `read`, `bash` (`extensions/pi-paseo-orchestration.ts:144-163`).
- `write/edit` chỉ được thêm theo protocol/write mode; mọi tool khác bị block dù Human đã bật trong baseline (`:917-930`, `:668-670`).
- `mcp_script` bị block cho mọi governed role (`:631-636`).

**Ảnh hưởng UX**

Package không compose tốt với tool/plugin mới, direct search/browser tools hoặc thay đổi tool naming của Pi. Người dùng phải vòng qua `bash`/outer `mcp`, làm UX xấu hơn và policy yếu hơn.

**Đề xuất**

Dùng capability classes và effect-based deny rules. Giữ các read-only tool từ Human baseline theo mặc định; chỉ narrow mutation/publication/external-effect tools. Cho phép protocol opt-in/out thay vì hard-coded global ceiling.

### P1-10 — Một drift phục hồi được biến thành permanent process failure

**Hiện trạng**

- Role, agent ID, profile source/digest, Peer alias, settings bytes, runtime model và thinking đều được latch exact (`extensions/pi-paseo-orchestration.ts:296-305`, `:419-463`).
- `blockedReason` “never clears in this process” (`:4446-4450`).
- Settings/protocol sửa lại đúng cũng không recover; phải fresh process.

**Ảnh hưởng UX**

Transient observation failure, model clamp, tool drift hoặc một edit rồi undo đều buộc restart Pi/Paseo agent và mất conversational state.

**Đề xuất**

Phân loại:

- immutable identity drift: restart;
- recoverable observation/config/tool drift: retry/reload;
- protocol material change: explicit Human-confirmed repin.

Thêm `/ppo:recover` hoặc actionable retry, không lưu permanent block cho lỗi transient.

### P1-11 — `create_agent` bắt model sinh machine contract quá chính xác

**Hiện trạng**

Call phải có closed fields, title <= 60, exact provider string, exact thinking setting, `notifyOnFinish: true`; initial prompt phải chứa đúng một `model_route`, đúng một `parent_lead_agent_id`, tối đa một exact `write_mode`. Unknown field bị reject (`extensions/pi-paseo-orchestration.ts:564-627`). `workspaceId` bị cấm để ép inheritance.

**Ảnh hưởng UX**

Lead model phải tự serialize một RPC contract trong prose. Sai whitespace/field/route gây retry dù intent rõ. Việc cấm workspace/cwd cũng không khớp tự nhiên với policy yêu cầu distinct isolated checkouts cho concurrent writers.

**Đề xuất**

Cung cấp wrapper `ppo_create_peer` nhận semantic fields nhỏ và package tự dựng Paseo call + prompt bindings. Cho phép explicit workspace/checkout chỉ sau isolation decision; forward-compatible với optional fields an toàn.

### P1-12 — Report/event/acceptance envelopes quá giòn

**Hiện trạng**

- Peer Report phải là first nonempty response content, exact marker, valid JSON, closed fields và kind-specific payload; unknown/duplicate/misplaced field đều reject (`extensions/pi-paseo-orchestration.ts:984-1108`).
- `agent_end` báo lỗi nếu terminal response không có exact report (`:5284-5313`).
- Event và Local Acceptance dùng contract tương tự.

**Ảnh hưởng UX**

Model có thể hoàn thành công việc nhưng bị coi như không handoff chỉ vì thêm một câu dẫn, field bổ sung hoặc serialize lệch. Human cũng bị lộ ceremony máy.

**Đề xuất**

Đưa report thành typed `peer_report` tool; package sinh envelope. Final prose chỉ là presentation. Parser nên hỗ trợ version negotiation và bỏ qua field extension có namespace thay vì fail mọi unknown field.

### P1-13 — Non-Git project nằm dưới một Git parent bị tự động nhận nhầm root

**Hiện trạng**

`resolvePinRoot` ưu tiên `git rev-parse --show-toplevel`; chỉ fallback về cwd khi không thấy bất kỳ containing repo nào (`extensions/pi-paseo-orchestration.ts:940-956`).

Probe với một standalone child directory nằm trong Git parent cho kết quả:

```json
{
  "cwd": ".../parent/standalone-child",
  "detected_repository_root": ".../parent"
}
```

**Ảnh hưởng UX**

Project không muốn dùng Git nhưng vô tình nằm trong monorepo/home dotfiles repo sẽ tìm protocol và Git facts ở parent, trái với kỳ vọng “cwd là root khi project không Git”.

**Đề xuất**

Root phải đến từ explicit Paseo workspace/project root hoặc Human selection. Chỉ auto-upcast sang containing Git root khi có project marker/protocol phù hợp; nếu cwd và Git root khác nhau, Doctor hỏi/xuất cảnh báo có lựa chọn.

### P2-14 — Onboarding là chuỗi nhiều mutation/restart thủ công

**Hiện trạng**

Đường setup yêu cầu:

1. cài Pi;
2. cài Paseo + CLI;
3. cài/configure `pi-mcp-adapter`;
4. chạy `/ppo:settings` cho toàn model matrix;
5. ghi ba PPO providers vào Paseo config;
6. restart Paseo;
7. tạo Workspace Protocol qua interview + diff confirmation;
8. chạy Doctor;
9. Human tự tạo root Lead, và root Supervisor nếu cần (`README.md:98-196`).

`installPaseoProfiles` còn yêu cầu Paseo config JSON đã tồn tại và parse được (`extensions/pi-paseo-orchestration.ts:4290-4302`).

**Ảnh hưởng UX**

Time-to-first-use cao; lỗi ở bất kỳ bước nào hiện ra như fail-closed state trong governed process, thường phải quay lại ordinary session và restart.

**Đề xuất**

Có một `/ppo:start`/onboarding flow idempotent: detect, show capability tiers, tạo minimal settings, offer provider install, và đưa đúng một next action. Optional Supervisor, Notebook, extra routes, Git và worktree phải để sau first successful run.

### P2-15 — Không có progressive/degraded governed mode

**Hiện trạng**

Nếu `PI_PASEO_ORCHESTRATION_ROLE` vắng mặt thì Pi hoàn toàn passive/ungoverned. Khi role đã set, thiếu một mandatory fact thường chặn toàn input; không có intermediate state như inspect-only, no-acceptance, no-Git hoặc no-concurrency.

**Ảnh hưởng UX**

Package biến nhiều capability độc lập thành một readiness boolean. Người dùng không thể tiếp tục phần an toàn trong khi một capability nâng cao chưa có.

**Đề xuất**

Chuyển từ global fail-closed sang action-scoped capability checks. Fail-closed vẫn giữ cho action nguy hiểm, nhưng read/inspect/delegate tuần tự không bị chặn bởi Git, worktree, review, Notebook hoặc acceptance attestation.

## Phân loại quyết định

### Nên giữ làm invariant

- Paseo là lifecycle/parentage/workspace source of truth.
- Human-only boundary cho push, deploy, irreversible/external effects và subjective acceptance.
- Một writer trên một moving scope; collision phải được phát hiện.
- Exact identity/parentage check ngay trước lifecycle hoặc external-effect call.

### Nên chuyển thành optional/progressive capability

- Git repository và Git binary.
- Stable Candidate, review chain và Local Acceptance proof.
- Isolated worktree.
- Workspace Protocol file; built-in default phải chạy được.
- Supervisor, Notebook, reviewer route và các model routes không dùng.
- Attested typed workspace khi action hiện tại không phụ thuộc nó.

### Nên thay cơ chế

- Raw command regex -> typed effect checks hoặc argv-aware rules.
- Static tool allowlist -> capability/effect policy trên Human baseline.
- Model-generated JSON envelopes -> typed package tools.
- Permanent latch cho mọi lỗi -> recoverable state machine.
- Một Doctor overall status -> readiness theo capability tier.

## UX đích đề xuất

| Tier | Bắt buộc | Có thể làm | Thiếu capability thì sao |
| --- | --- | --- | --- |
| Core | Pi, Paseo identity/parentage, minimal model | inspect, plan, sequential delegate, bounded handoff | không block vì Git/protocol nâng cao |
| Local write | Core + write-enabled assignment | edit/test và trả artifact/diff | không cần Git candidate |
| Git candidate | Local write + Git | commit-backed candidate | lỗi Git chỉ block candidate action |
| Concurrent isolation | Core + collision risk + Human choice | isolated checkout/worktree | decline thì serialize writers |
| Assured acceptance | Candidate + protocol/review/evidence requirements | exact Local Acceptance | Doctor báo riêng readiness của tier này |

## Backlog khuyến nghị theo thứ tự

1. **Ship Gitless core đúng nghĩa**: release staged fix, sửa docs, thêm test không `.git` và test không có `git` binary.
2. **Tách Doctor theo capability tier**: CLI fallback phải cho `CORE_READY`; attestation chỉ block assured actions.
3. **Làm Protocol optional/defaulted**: missing protocol không block input/read; thêm explicit repin/recover.
4. **Loại false-positive guard**: regression tests cho `echo paseo`, repo path, `gh pr view`, `git merge-base`, quoted text.
5. **Worktree thành Human choice**: proposal + accept/serialize; không auto-mutate Git infrastructure theo prompt mặc định.
6. **Minimal lazy settings**: current Lead model + một Peer route; optional roles/routes on demand.
7. **Typed orchestration tools**: `ppo_create_peer`, `peer_report`, `/ppo:accept`; model/Human không tự viết contract JSON.
8. **Thêm non-Git candidate hoặc hạ acceptance guarantee**: artifact digest/diff result, không ép mọi write run thành đúng một Git commit.

## Acceptance criteria tối thiểu cho lần cải thiện đầu tiên

- Cài package rồi chạy Core trong thư mục trống chưa `git init` và không có Git binary.
- Thiếu Git chỉ làm `GIT_READY=false`; input/read/sequential delegation vẫn hoạt động.
- Không có worktree nào được tạo trước khi Human chọn phương án isolation.
- `/ppo:doctor` có ít nhất một trạng thái Core PASS bằng CLI fallback hiện tại.
- Missing protocol dùng safe default hoặc chỉ block action cần protocol.
- Restoring một transient setting/tool observation cho phép retry trong cùng process.
- Các benign command trong false-positive probe đều ALLOW.
- Human không phải gõ XML/JSON để accept; Peer không phải tự serialize terminal report bằng prose.

## Ghi chú phạm vi

Audit này không thay đổi source/test đang staged. Nó chỉ thêm tài liệu findings này. Những nhận định về external adapter/host được giới hạn theo bằng chứng có trong repo; đặc biệt `ctx.acceptanceChain` có thể được một integration ngoài repo inject, nhưng integration đó hiện không được khai báo, implement hoặc test tại đây.
