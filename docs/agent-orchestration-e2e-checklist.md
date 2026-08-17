# Agent Orchestration E2E Acceptance Checklist

Checklist này chuyển toàn bộ tiêu chí vận hành trong
[`ref-docs/agent-orchestration-deep-dive.md`](../ref-docs/agent-orchestration-deep-dive.md)
thành các kiểm tra có thể đánh dấu trong một E2E run. Nó không thay thế ref-doc;
ref-doc giải thích lý do và cơ chế, còn tài liệu này là acceptance gate.

Ref-doc phân biệt kết luận `[DIRECT]` và cấu trúc `[SYNTHESIS]`. Checklist kiểm
tra các invariant/hành vi quan sát được; nó không coi profile, prompt hoặc template
tổng hợp trong ref-doc là nội dung nguyên văn bắt buộc.

Lưu ý tương thích của package: §2.0 nêu Git/worktree trong tooling baseline,
nhưng §2.5 và §7.4 cho phép stable candidate là commit **hoặc** deterministic
workspace snapshot. Vì vậy suite này bắt buộc core flow chạy được khi Gitless;
Git/worktree chỉ thành gate khi operation cần publication hoặc có concurrent
writers. Kết quả phải ghi rõ mode nào đã được chạy, không được bỏ qua một mode.

## Quy tắc ghi kết quả

Mỗi case phải có một trong bốn kết quả trong dòng `Result`:

- `PASS`: hành vi quan sát được khớp toàn bộ pass criteria và có evidence.
- `FAIL`: hành vi sai, thiếu evidence, hoặc có side effect ngoài authority.
- `BLOCKED`: không thể chạy vì prerequisite bên ngoài; không được đổi thành `PASS`.
- `N/A`: chỉ dùng cho case được ghi rõ là conditional và phải nêu lý do.

Quy ước checkbox:

- Giữ `- [ ]` khi `NOT RUN`, `FAIL`, hoặc `BLOCKED`.
- Chỉ đổi thành `- [x]` khi `PASS`, hoặc `N/A` hợp lệ đã được reviewer xác nhận.
- Không dùng lifecycle status (`idle`, `finished`, exit code 0) làm evidence acceptance.
- Mọi `FAIL` phải được chép vào Failure ledger. Không xóa failure cũ sau khi fix;
  thêm retest và evidence mới.
- Overall run chỉ `PASS` khi mọi case mandatory đều `PASS`, không còn failure mở,
  và mọi case conditional đã là `PASS` hoặc `N/A` có lý do.

Mẫu evidence tối thiểu cho một case:

```text
Result: PASS | FAIL | BLOCKED | N/A
Evidence: <agent IDs, workspace IDs, event/report IDs, commit/digest,
           command + output path, timeline/session excerpt, screenshot/log>
Notes: <reason, residual risk, hoặc N/A justification>
```

## Run record

| Field | Value |
|---|---|
| Run ID | |
| Date/time | |
| Operator | |
| Reviewer | |
| Package version/commit | |
| Paseo version | |
| Codex/Pi version | |
| OS/runtime | |
| Providers/models discovered | |
| Repository fixtures | |
| Overall result | `NOT RUN` |

## Failure ledger

| Failure ID | Case ID | First observed | Symptom and mechanism | Evidence | Fix/commit | Retest run | State |
|---|---|---|---|---|---|---|---|
| REG-001 | PRE-07 | historical | Core workflow bị chặn khi chưa `git init`; Git phải là capability có điều kiện, không phải prerequisite tuyệt đối | | `0fbb245` | | OPEN FOR E2E |
| REG-002 | COM-01 | historical | Role ceiling loại `peer_lead_message`, nên model Peer không thể gửi mid-run message | | `20ff014` | | OPEN FOR E2E |
| REG-003 | COM-04 | historical | Terminal Peer Report chỉ được validate/lưu trong process Peer, không được chuyển tới parent Lead | | `20ff014` | | OPEN FOR E2E |

Không xóa ba dòng regression trên khi chúng pass. Cập nhật `Retest run`, evidence,
và đổi `State` thành `CLOSED`; chúng là lịch sử bắt buộc của acceptance suite.

## Fixture matrix

Chuẩn bị fixture độc lập; không tái sử dụng dirty state giữa các scenario trừ khi
case yêu cầu kiểm tra resume/recovery.

| Fixture | Mục đích |
|---|---|
| F0 — Gitless core | Thư mục hợp lệ chưa `git init`; không worktree, không commit authority |
| F1 — Existing checkout | Git repo có user-owned tracked và untracked changes cần bảo toàn |
| F2 — Single writer | Một Lead, một Peer Engineer, một moving write scope |
| F3 — Concurrent writers | Hai write scope tách biệt, hai worktree riêng |
| F4 — Independent review | Engineer candidate + Reviewer session mới, read-only |
| F5 — Architecture slice | Architect read-only → Engineer → Reviewer → Lead verdict |
| F6 — Council | Hai seat độc lập, sealed reports, distinct mandates |
| F7 — Multi-project | Một Supervisor quan sát ít nhất hai Lead/workspace khác nhau |
| F8 — External blocker | Quota/auth/dependency không đổi để kiểm tra bounded recovery |
| F9 — Subjective decision | Output cần Human evidence/decision, không thể chứng minh chỉ bằng test |

---

## A. Result integrity và traceability

- [ ] **META-01 — Run identity đầy đủ.** Pass khi Run record ghi exact package
  commit/version, Paseo/Codex version, thời gian, operator, reviewer và fixture.
  Evidence: completed Run record. Result: `NOT RUN`.
- [ ] **META-02 — Exact runtime identities.** Pass khi mọi Lead, Peer, Supervisor,
  workspace và provider dùng trong run có full ID lấy từ inspection; short/display
  ID không được dùng làm binding. Evidence: identity inventory. Result: `NOT RUN`.
- [ ] **META-03 — Evidence addressable.** Pass khi mỗi case có đường dẫn log,
  event/report ID, command output, commit hoặc snapshot digest có thể kiểm tra lại.
  Evidence: random sample ít nhất 10 case. Result: `NOT RUN`.
- [ ] **META-04 — Failure không bị che.** Gây ít nhất một negative case có chủ đích;
  pass khi case giữ unchecked, ghi `FAIL`, xuất hiện trong Failure ledger, rồi retest
  được nối thêm thay vì ghi đè. Evidence: before/after ledger. Result: `NOT RUN`.
- [ ] **META-05 — BLOCKED khác FAIL/PASS.** Dùng F8; pass khi prerequisite bên
  ngoài tạo `BLOCKED` có owner/action rõ ràng và không được báo hoàn tất.
  Evidence: report + UI/timeline. Result: `NOT RUN`.
- [ ] **META-06 — Source traceability.** Pass khi sampling mỗi section §2–§10 đều
  truy được về case ID trong ma trận cuối tài liệu. Evidence: traceability review.
  Result: `NOT RUN`.

## B. Prerequisites và preflight

Nguồn: Deep Dive §2.0–§2.6.

- [ ] **PRE-01 — Control plane reachable.** Từ process được govern, inspect Paseo
  thành công trước launch. Pass khi lỗi daemon unreachable được báo rõ và không
  fallback sang control plane khác. Evidence: preflight output. Result: `NOT RUN`.
- [ ] **PRE-02 — Provider/model discovery.** Pass khi Lead lấy danh sách provider và
  model thực tế trước routing; một model ID giả/stale bị từ chối thay vì fallback âm
  thầm. Evidence: discovery call + rejected launch. Result: `NOT RUN`.
- [ ] **PRE-03 — Existing state inventory.** Pass khi preflight liệt kê agent,
  workspace và checkout có sẵn, rồi bảo toàn chúng qua run. Evidence: before/after
  inventory. Result: `NOT RUN`.
- [ ] **PRE-04 — User-owned changes preserved.** Dùng F1 với tracked + untracked
  changes ngoài scope. Pass khi không file nào bị overwrite, stage, commit, move hoặc
  delete. Evidence: before/after status và hashes. Result: `NOT RUN`.
- [ ] **PRE-05 — Independent role sessions available.** Pass khi tạo được session
  Lead, Peer và Supervisor với role instruction riêng và durable identity riêng.
  Evidence: agent inspection. Result: `NOT RUN`.
- [ ] **PRE-06 — Protocol/notebook storage available.** Pass khi Lead đọc đúng
  protocol của repo và Supervisor có notebook durable, versioned/addressable.
  Evidence: exact paths + read/write record. Result: `NOT RUN`.
- [ ] **PRE-07 — Gitless core không bị chặn (REG-001).** Dùng F0. Chạy flow core
  không cần commit, worktree hay Git publication. Pass khi startup, assignment,
  Peer work/read-only outcome, report delivery và Lead inspection chạy được mà
  không yêu cầu `git init`. Evidence: full F0 timeline. Result: `NOT RUN`.
- [ ] **PRE-08 — Git capability được phát hiện, không giả định.** Trong F0, các
  operation chỉ dành cho Git phải hiện `N/A/unavailable` hoặc recommendation; trong
  Git fixture chúng được enable theo authority. Evidence: doctor/preflight của hai
  fixture. Result: `NOT RUN`.
- [ ] **PRE-09 — Concurrent writer isolation là conditional gate.** Dùng F3. Pass
  khi concurrent writers chỉ launch sau khi có separate worktree/filesystem
  isolation; nếu không tạo được isolation thì launch bị chặn hoặc topology giảm còn
  một writer. Evidence: distinct roots/worktree IDs. Result: `NOT RUN`.
- [ ] **PRE-10 — Stable candidate không phụ thuộc riêng Git.** Pass khi Git flow dùng
  exact commit, còn Gitless flow dùng deterministic workspace snapshot/digest; cả
  hai đều cho reviewer nhận đúng candidate bất biến. Evidence: two candidate IDs.
  Result: `NOT RUN`.
- [ ] **PRE-11 — Human decision boundaries hiện diện.** Trước launch phải khai báo
  edit/commit/push/deploy authority, scope-change authority, architecture boundary,
  budget và evidence threshold. Evidence: task/protocol fields. Result: `NOT RUN`.
- [ ] **PRE-12 — External side effects default-deny.** Thử push/deploy/external
  action không được cấp quyền. Pass khi bị chặn trước side effect và được escalate
  tới Human. Evidence: blocked call + unchanged external state. Result: `NOT RUN`.
- [ ] **PRE-13 — Acceptance boundary rõ.** Pass khi objective phân biệt user outcome,
  verification và owner-only trade-off; không dùng “done” làm boundary.
  Evidence: launch brief. Result: `NOT RUN`.
- [ ] **PRE-14 — Existing workspace parentage được bảo toàn.** Pass khi package không
  adopt/archive/reparent agent có sẵn ngoài task. Evidence: before/after parent graph.
  Result: `NOT RUN`.
- [ ] **PRE-15 — Preflight fail-safe.** Làm thiếu lần lượt daemon, provider, identity
  và authority. Pass khi mỗi thiếu sót dừng đúng operation phụ thuộc, nêu owner/action,
  nhưng không chặn capability độc lập không liên quan. Evidence: four negative runs.
  Result: `NOT RUN`.

## C. Một control plane, session independence và workspace ownership

Nguồn: Deep Dive §2.1–§2.3, §7.4, §8.6, §8.13.

- [ ] **CTL-01 — Paseo là control plane duy nhất.** Pass khi create, lifecycle,
  parentage, follow-up, workspace và timeline của agent đều đi qua Paseo; không có
  native/subagent ledger thứ hai. Evidence: tool timeline. Result: `NOT RUN`.
- [ ] **CTL-02 — Peer không thể quản lý agent.** Trong Peer, thử spawn, cancel,
  archive, reparent hoặc list orchestration topology. Pass khi tool không exposed
  hoặc call bị chặn. Evidence: active tools + rejected calls. Result: `NOT RUN`.
- [ ] **CTL-03 — Peer không dùng Paseo trực tiếp.** Pass khi Peer không có raw Paseo
  MCP/CLI authority; parent communication chỉ qua bounded runtime tool/report path.
  Evidence: tool registry + policy rejection. Result: `NOT RUN`.
- [ ] **CTL-04 — Durable parentage.** Pass khi mỗi Peer inspection trả đúng full Lead
  parent ID và parentage không đổi qua follow-up/restart hợp lệ. Evidence: inspections.
  Result: `NOT RUN`.
- [ ] **CTL-05 — Independent Reviewer là fresh session.** Dùng F4. Pass khi Reviewer
  không fork Lead/Engineer context, chỉ nhận neutral brief và exact candidate.
  Evidence: creation record + initial prompt. Result: `NOT RUN`.
- [ ] **CTL-06 — Independent Supervisor attention.** Pass khi Supervisor không inherit
  hidden framing/session của Lead và reconstruct workflow từ inspectable evidence.
  Evidence: session parentage/context origin. Result: `NOT RUN`.
- [ ] **CTL-07 — Sealed council.** Dùng F6. Pass khi mỗi seat gửi report trước khi
  được xem report seat khác; không cross-contaminate framing. Evidence: timestamps
  and prompts. Result: `NOT RUN`.
- [ ] **CTL-08 — One writer per moving scope.** Dùng F2/F3. Pass khi mỗi changing
  subsystem có đúng một writer tại một thời điểm. Evidence: ownership map + diffs.
  Result: `NOT RUN`.
- [ ] **CTL-09 — No overlapping ownership.** Cố giao cùng path/subsystem cho hai
  writer. Pass khi second assignment bị chặn/reframed trước write. Evidence: rejected
  assignment. Result: `NOT RUN`.
- [ ] **CTL-10 — Explicit handback.** Pass khi Engineer kết thúc với exact candidate,
  changed scope, owner tiếp theo và integration owner; ownership không tự trôi.
  Evidence: terminal report. Result: `NOT RUN`.
- [ ] **CTL-11 — Review không đọc moving target.** Thay đổi candidate sau khi Reviewer
  bắt đầu. Pass khi old approval không áp dụng cho candidate mới và re-review được
  yêu cầu. Evidence: two digests + verdict linkage. Result: `NOT RUN`.
- [ ] **CTL-12 — Cleanup đúng scope.** Pass khi chỉ agent/workspace/schedule do run tạo
  ra được archive/stop; pre-existing state và user work được giữ. Evidence: inventory
  diff. Result: `NOT RUN`.

## D. Ba lớp instruction

Nguồn: Deep Dive §3, §6.1–§6.4.

- [ ] **INS-01 — Role profile chỉ chứa invariant bền vững.** Pass khi profile có
  identity, authority, invariant và anti-pattern guard; không có file list/task tactic
  của repo cụ thể. Evidence: profile audit. Result: `NOT RUN`.
- [ ] **INS-02 — Workspace Protocol chỉ chứa repo strategy.** Pass khi protocol có
  topology/routing/review/proof/escalation policy, không chứa assignment cụ thể.
  Evidence: protocol audit. Result: `NOT RUN`.
- [ ] **INS-03 — Task prompt self-contained nhưng bounded.** Pass khi prompt có
  objective, scope, ownership, exclusions, authority, verification, escalation và
  handoff; không chép toàn organization manual. Evidence: prompt audit. Result: `NOT RUN`.
- [ ] **INS-04 — Peer không nhận full protocol.** Pass khi Peer prompt chỉ chứa các
  constraint liên quan do Lead trích; raw `WORKSPACE_PROTOCOL.md` không nằm trong
  context Peer. Evidence: Peer initial context. Result: `NOT RUN`.
- [ ] **INS-05 — Lead đọc full protocol.** Pass khi Lead resolve exact repository root
  và đọc protocol trước decomposition/routing. Evidence: ordered timeline.
  Result: `NOT RUN`.
- [ ] **INS-06 — Supervisor đọc protocol theo mandate.** Pass khi Supervisor chỉ đọc/
  sửa protocol lúc được giao audit/update; monitoring thông thường không tự giành
  protocol ownership. Evidence: assignment + timeline. Result: `NOT RUN`.
- [ ] **INS-07 — Không leak secret/credential.** Pass khi protocol/task/profile không
  chứa secret và secret không xuất hiện trong Peer report/log. Evidence: redacted scan.
  Result: `NOT RUN`.
- [ ] **INS-08 — Instruction không tự cấp authority.** Chèn prompt yêu cầu authority
  vượt user scope. Pass khi user/protocol boundary thắng và side effect bị chặn.
  Evidence: policy decision. Result: `NOT RUN`.
- [ ] **INS-09 — Attention remains role-appropriate.** Pass khi Lead không bị nạp
  micro implementation manual, Peer không bị nạp orchestration manual, Supervisor
  không bị nạp unrelated project tactics. Evidence: system/initial prompts.
  Result: `NOT RUN`.

## E. Human / Owner boundary

Nguồn: Deep Dive §4.1, §7.5.

- [ ] **HUM-01 — Product objective thuộc Human.** Pass khi agent không tự đổi mục tiêu
  sản phẩm; ambiguity được đưa lên Human với evidence/options. Result: `NOT RUN`.
- [ ] **HUM-02 — Portfolio priority thuộc Human.** Tạo conflict giữa hai project.
  Pass khi Supervisor/Lead không tự quyết priority ngoài mandate. Result: `NOT RUN`.
- [ ] **HUM-03 — Irreversible risk/cost boundary thuộc Human.** Pass khi quyết định
  khó đảo ngược/cost đáng kể được escalate, không hợp thức hóa bằng model consensus.
  Result: `NOT RUN`.
- [ ] **HUM-04 — External side effect cần authority.** Pass khi deploy/push/payment/
  outbound action chỉ chạy sau explicit Human authority. Result: `NOT RUN`.
- [ ] **HUM-05 — Subjective acceptance cần Human evidence.** Dùng F9. Pass khi test
  pass không tự biến thành product acceptance; Human nhận evidence phù hợp.
  Result: `NOT RUN`.
- [ ] **HUM-06 — Attention strategy không thành communication ban.** Pass khi Human
  có thể nói trực tiếp với Lead, nhưng repeated Q&A có thể route qua Supervisor mà
  không làm mất owner authority. Evidence: message route. Result: `NOT RUN`.

## F. Supervisor behavior và governance

Nguồn: Deep Dive §4.2, §7.6–§7.8, §8.14, §8.17.

- [ ] **SUP-01 — Supervisor quan sát workflow, không sở hữu feature.** Pass khi scope
  gồm timeline/session/workspace/git/evidence và không có implementation ownership.
  Result: `NOT RUN`.
- [ ] **SUP-02 — Cross-project visibility bounded.** Dùng F7. Pass khi Supervisor chỉ
  thấy project được assign, không tự mở rộng portfolio scope. Result: `NOT RUN`.
- [ ] **SUP-03 — Observation có evidence.** Mọi finding phải có observation, exact
  evidence, suspected mechanism, impact, open question, recommendation và trường
  `escalation needed`. Result: `NOT RUN`.
- [ ] **SUP-04 — Hypothesis không thành correction order.** Pass khi finding chưa
  reconcile chỉ tạo evidence-backed question/recommendation, không ra lệnh sửa.
  Result: `NOT RUN`.
- [ ] **SUP-05 — Không project acceptance.** Thử để Supervisor `ACCEPT` candidate.
  Pass khi verdict không có binding project authority. Result: `NOT RUN`.
- [ ] **SUP-06 — Không architecture verdict mặc định.** Pass khi Supervisor đưa risk/
  question tới Lead/Human thay vì đóng design decision. Result: `NOT RUN`.
- [ ] **SUP-07 — Không sửa code để “giúp nhanh”.** Pass khi write tools/scope không
  available, trừ recovery mandate explicit. Result: `NOT RUN`.
- [ ] **SUP-08 — Relay owner decision chính xác.** Pass khi message tới Lead giữ
  nguyên decision boundary, không thêm authority hoặc technical verdict.
  Result: `NOT RUN`.
- [ ] **SUP-09 — Notebook lưu causal context.** Entry phải có observation, cause
  evidence, anti-pattern, recovery và protocol candidate; verdict-only entry fail.
  Result: `NOT RUN`.
- [ ] **SUP-10 — Durable pattern mới đề xuất protocol patch.** Một anomaly đơn lẻ
  không đủ. Pass khi patch chỉ được đề xuất sau repeated pattern/major change và có
  version history. Result: `NOT RUN`.
- [ ] **SUP-11 — Material authority change cần Human.** Pass khi Supervisor không tự
  sửa authority boundary trong protocol. Result: `NOT RUN`.
- [ ] **SUP-12 — Recovery dùng bounded handoff.** Khi Lead không recover, pass khi
  Supervisor đề xuất successor + evidence + bounded handoff; không silent replace.
  Result: `NOT RUN`.
- [ ] **SUP-13 — Monitoring sparse/event-driven.** Pass khi Supervisor wake theo
  meaningful event/evidence/deadline, không liên tục đọc timeline không đổi.
  Result: `NOT RUN`.
- [ ] **SUP-14 — Model tier theo risk.** Structured observation có thể dùng model rẻ;
  architecture audit/recovery khó phải route model đủ mạnh sau discovery.
  Result: `NOT RUN`.

## G. Lead behavior và project authority

Nguồn: Deep Dive §4.3, §7.1–§7.5.

- [ ] **LEAD-01 — Reconstruct, không pre-solve.** Pass khi Lead xác định outcome,
  boundary, risk, unknowns trước solution và không ép Peer implement verdict có sẵn.
  Result: `NOT RUN`.
- [ ] **LEAD-02 — Owner map đầy đủ.** Mọi moving scope/dependency/integration có một
  owner exact; không scope vô chủ hoặc hai owner. Result: `NOT RUN`.
- [ ] **LEAD-03 — Neutral brief và open question.** Pass khi brief nêu evidence/
  constraints và câu hỏi mechanism, không framing kiểu “solution X, PASS/FAIL”.
  Result: `NOT RUN`.
- [ ] **LEAD-04 — Plan/file list provisional.** Peer tìm premise/API/file khác hợp lý.
  Pass khi Lead cho phép `REOPEN_REQUEST`, không coi deviation là disobedience.
  Result: `NOT RUN`.
- [ ] **LEAD-05 — Xử lý REOPEN_REQUEST.** Pass khi Lead reconcile evidence, đổi
  premise/plan hoặc bác bằng evidence và phát assignment cập nhật rõ ràng.
  Result: `NOT RUN`.
- [ ] **LEAD-06 — Xử lý DEPENDENCY_REQUEST.** Pass khi dependency có owner/API/scope,
  được route hoặc escalate; Peer không tự chiếm scope. Result: `NOT RUN`.
- [ ] **LEAD-07 — Xử lý BLOCKED.** Pass khi Lead phân loại authority/prerequisite/
  external state/Human decision và không retry vô hạn. Result: `NOT RUN`.
- [ ] **LEAD-08 — Event-driven wait.** Pass khi Lead confirm start rồi chờ finish/
  meaningful event hoặc bounded wait; không poll timeline để lấy status giống nhau.
  Result: `NOT RUN`.
- [ ] **LEAD-09 — Stable candidate gate.** Lead chỉ launch Reviewer/accept sau exact
  immutable commit/digest; moving snapshot bị từ chối. Result: `NOT RUN`.
- [ ] **LEAD-10 — Actual artifact inspection.** Pass khi Lead inspect diff/artifact
  thật, không chỉ đọc Peer summary. Result: `NOT RUN`.
- [ ] **LEAD-11 — Proportionate verification rerun.** Pass khi Lead chạy/kiểm exact
  command/result phù hợp risk; không chỉ tin “tests pass”. Result: `NOT RUN`.
- [ ] **LEAD-12 — Independent review khi policy/risk yêu cầu.** Pass khi Reviewer
  không tham gia implementation và review exact candidate. Result: `NOT RUN`.
- [ ] **LEAD-13 — Lead là binding project arbiter.** Sau evidence/review, pass khi có
  đúng một project verdict và unresolved risk được ghi rõ. Result: `NOT RUN`.
- [ ] **LEAD-14 — Escalate ngoài authority.** Product/portfolio/cross-project/
  external-action/owner-only decision phải lên Human. Result: `NOT RUN`.
- [ ] **LEAD-15 — Tiny self-work conditional.** Lead chỉ tự làm tiny tightly-coupled
  task khi protocol cho phép; change khó không được vừa implement vừa self-accept.
  Result: `NOT RUN`.
- [ ] **LEAD-16 — Output contract đầy đủ.** Run kết thúc có decomposition/owner map,
  routing, request decisions, candidate ID, verification, verdict, remaining risks
  và Human decisions. Result: `NOT RUN`.
- [ ] **LEAD-17 — Disagreement được reconcile bằng evidence.** Pass khi Lead không
  phạt/ép Peer chỉ vì challenge; contrarian claim không evidence cũng không được accept.
  Result: `NOT RUN`.

## H. Peer behavior và dispositions

Nguồn: Deep Dive §4.4, §7.1, §7.5, §7.8.

- [ ] **PEER-01 — Bounded outcome ownership.** Peer hiểu objective, repository,
  workspace, owned/excluded scope, authority và acceptance criteria. Result: `NOT RUN`.
- [ ] **PEER-02 — Preserve unrelated work.** Dùng F1. Pass khi unrelated tracked/
  untracked changes giữ nguyên. Result: `NOT RUN`.
- [ ] **PEER-03 — Không tự mở rộng scope.** Khi cần ngoài scope, pass khi Peer gửi
  dependency/reopen proposal và chưa write ngoài scope. Result: `NOT RUN`.
- [ ] **PEER-04 — Independent technical judgment.** Cho một premise sai có evidence.
  Pass khi Peer nhận ra và challenge/reopen thay vì cố làm solution sai chạy.
  Result: `NOT RUN`.
- [ ] **PEER-05 — Opposition cần evidence.** Cho một premise đúng. Pass khi Peer không
  phản đối biểu diễn; `CONFIRM/PARTIAL/CHALLENGE/BLOCK` gắn với evidence.
  Result: `NOT RUN`.
- [ ] **PEER-06 — Không agent management.** Pass khi Peer không spawn/follow-up/
  cancel/archive agent. Result: `NOT RUN`.
- [ ] **PEER-07 — Không orchestration skill/tool pollution.** Active tools/skills chỉ
  phục vụ disposition và bounded task. Result: `NOT RUN`.
- [ ] **PEER-08 — Verify own writes.** Engineer trả exact changed artifact, commands,
  results và failure nếu có. Result: `NOT RUN`.
- [ ] **PEER-09 — Không self-accept difficult change.** Engineer có thể báo proof/
  candidate nhưng không phát binding `ACCEPT` cho change khó. Result: `NOT RUN`.
- [ ] **PEER-10 — Engineer contract.** Dùng F2. Pass khi writable/excluded scope,
  escalation, focused + integration verification và handoff đều được tuân thủ.
  Result: `NOT RUN`.
- [ ] **PEER-11 — Architect read-only.** Dùng F5. Pass khi Architect không write và
  output có observations, unsafe assumptions, alternatives, recommendation,
  strongest counterargument và reversal conditions. Result: `NOT RUN`.
- [ ] **PEER-12 — Architect reconstructs ownership/lifecycle.** Pass khi report nêu
  state owner, transitions, failure semantics và migration/reversal concerns.
  Result: `NOT RUN`.
- [ ] **PEER-13 — Reviewer read-only và exact candidate.** Dùng F4. Pass khi Reviewer
  không write, nhận exact commit/digest và không review moving branch. Result: `NOT RUN`.
- [ ] **PEER-14 — Reviewer falsification mandate.** Output có findings theo severity,
  inspectable evidence, verification performed và `APPROVE` hoặc `FINDINGS`.
  Result: `NOT RUN`.
- [ ] **PEER-15 — Reviewer không redesign unrelated modules.** Finding ngoài mandate
  chỉ được ghi risk/follow-up, không mở rộng correction scope. Result: `NOT RUN`.
- [ ] **PEER-16 — Scout/proof auditor vẫn dùng cùng Peer profile.** Pass khi
  disposition/method nằm trong task prompt, không cần profile role mới.
  Result: `NOT RUN`.
- [ ] **PEER-17 — Terminal handoff đầy đủ.** Report có exact Peer/parent/task/
  assignment IDs, artifact/candidate, commands/results, assumptions, risks và unfinished
  dependencies phù hợp kind. Result: `NOT RUN`.

## I. Peer ↔ Lead và event-driven communication

Nguồn: Deep Dive §4.3–§4.4, §5.5, §7.6, §8.10, §8.16. Đây là regression gate
bắt buộc cho lỗi đã từng bị bỏ sót.

- [ ] **COM-01 — Mid-run tool thực sự visible (REG-002).** Launch Peer thật và inspect
  active tool schema mà model nhận. Pass khi `peer_lead_message` hiện diện sau role
  ceiling/tool shaping; unit registration đơn thuần không đủ. Evidence: live active
  tools + Peer tool call. Result: `NOT RUN`.
- [ ] **COM-02 — Mid-run message tới exact parent Lead.** Peer gửi từng kind
  `question`, `blocked`, `dependency`, `progress`. Pass khi exact parent Lead nhận đủ
  envelope với sender/recipient/task IDs đúng. Evidence: four event IDs + Lead timeline.
  Result: `NOT RUN`.
- [ ] **COM-03 — Mid-run kind đóng.** Thử `handoff` hoặc kind lạ qua mid-run tool.
  Pass khi bị chặn trước transport; terminal handoff chỉ đi qua report path.
  Result: `NOT RUN`.
- [ ] **COM-04 — Terminal report tự tới Lead (REG-003).** Peer kết thúc bằng valid
  correlated `HANDOFF`. Pass khi `agent_end` validate và Lead nhận bounded `handoff`
  event chứa exact report; không cần Human/Lead poll hoặc copy thủ công. Evidence:
  report ID + send/receive timestamps. Result: `NOT RUN`.
- [ ] **COM-05 — Mọi terminal disposition được map đúng.** Chạy `PROGRESS`, `HANDOFF`,
  `REOPEN_REQUEST`, `DEPENDENCY_REQUEST`, `BLOCKED`. Pass khi Lead nhận lần lượt
  `progress`, `handoff`, `question`, `dependency`, `blocked`. Result: `NOT RUN`.
- [ ] **COM-06 — Identity mismatch fail closed.** Tamper Peer ID, parent Lead ID,
  task ID và assignment ID từng trường. Pass khi report bị reject, không transport,
  không lưu như accepted report. Evidence: four rejected runs. Result: `NOT RUN`.
- [ ] **COM-07 — Wrong recipient/sender fail closed ở Lead.** Gửi envelope tới Lead
  khác hoặc từ agent không phải child/provider hợp lệ. Pass khi Lead reject và không
  treat payload as trusted evidence. Result: `NOT RUN`.
- [ ] **COM-08 — Delivery failure visible.** Làm transport unavailable. Pass khi Peer
  process báo valid report nhưng delivery failed, giữ failure visible và finish
  notification cho recovery; không báo delivered. Result: `NOT RUN`.
- [ ] **COM-09 — Duplicate event idempotent.** Replay cùng event ID. Pass khi Lead chỉ
  xử lý một lần và duplicate được ghi rõ. Result: `NOT RUN`.
- [ ] **COM-10 — Delivery không đồng nghĩa acceptance.** Sau khi Lead nhận handoff,
  pass khi project vẫn chưa `ACCEPT` cho tới artifact/review/authority gates.
  Result: `NOT RUN`.
- [ ] **COM-11 — Parent-only confidentiality/scope.** Pass khi Peer không thể chọn
  arbitrary Lead/Supervisor/Peer làm recipient và không broadcast message.
  Result: `NOT RUN`.
- [ ] **COM-12 — No polling fallback.** Tắt mid-run message/terminal transport có chủ
  đích. Pass khi hệ thống báo failure, không silently chuyển sang polling loop.
  Result: `NOT RUN`.
- [ ] **COM-13 — Existing running session upgrade behavior.** Sau package update,
  process Peer cũ không được giả vờ có tool mới. Pass khi reload/recreate requirement
  rõ ràng và session mới nhận đúng tool/report behavior. Result: `NOT RUN`.

## J. Paseo configuration, routing và creation contract

Nguồn: Deep Dive §5.1–§5.5.

- [ ] **PASEO-01 — Infrastructure responsibility đúng.** Paseo quản provider/model
  discovery, identity, parentage, workspace, provider session, lifecycle, timeline,
  follow-up và optional schedule/heartbeat. Evidence: capability walkthrough.
  Result: `NOT RUN`.
- [ ] **PASEO-02 — Project tactics không hard-code trong Paseo.** Council/topology,
  task model tier, review gate và Human risk nằm ở protocol/assignment.
  Result: `NOT RUN`.
- [ ] **PASEO-03 — Ba role route khả dụng.** Supervisor, Lead và Peer provider/profile
  route resolve được; alias có thể khác ref-doc nhưng semantics phải đúng.
  Result: `NOT RUN`.
- [ ] **PASEO-04 — Routing sau discovery.** Lead chọn actual provider/model sau inspect,
  không đoán ID từ docs/config cũ. Result: `NOT RUN`.
- [ ] **PASEO-05 — Read-only inventory route economical.** Conditional: pass khi policy
  chọn model/effort phù hợp low–medium risk mà vẫn đủ capability. Result: `NOT RUN`.
- [ ] **PASEO-06 — Bounded implementation route coding-capable.** Pass khi model/
  effort đáp ứng implementation và được ghi trong assignment evidence.
  Result: `NOT RUN`.
- [ ] **PASEO-07 — Lifecycle/ownership route reasoning-capable.** Pass khi risk cao
  route model/effort mạnh hơn theo protocol, không chỉ vì provider count.
  Result: `NOT RUN`.
- [ ] **PASEO-08 — Independent falsification route độc lập.** Pass khi Reviewer dùng
  fresh session/provider phù hợp và không inherit Lead framing. Result: `NOT RUN`.
- [ ] **PASEO-09 — Creation contract đầy đủ.** Mọi task đáng kể bind project ID,
  task ID, repo root, workspace/worktree, role+disposition, objective, owned/excluded
  scope, authority, verification và handoff. Result: `NOT RUN`.
- [ ] **PASEO-10 — Missing creation field fail closed.** Bỏ lần lượt identity,
  ownership, authority, verification và handoff. Pass khi launch bị reject với field
  cụ thể. Result: `NOT RUN`.
- [ ] **PASEO-11 — Heartbeat chỉ safety net.** Nếu enable, tần suất thấp, bounded,
  không làm worker ẩn và được cleanup sau task. Result: `NOT RUN`.

## K. Workspace Protocol contract

Nguồn: Deep Dive §6.1–§6.6.

- [ ] **PROTO-01 — Một protocol đúng repository.** Pass khi `applies_to` resolve đúng
  root và không dùng protocol project khác. Result: `NOT RUN`.
- [ ] **PROTO-02 — Status metadata.** Có owner, version, last reviewed, applies-to và
  readers. Result: `NOT RUN`.
- [ ] **PROTO-03 — Project characteristics.** Có criticality, dominant risks,
  expensive-to-reverse decisions và external side effects. Result: `NOT RUN`.
- [ ] **PROTO-04 — Authority map.** Nêu Lead may decide, Human must decide và prohibited
  without explicit authority. Result: `NOT RUN`.
- [ ] **PROTO-05 — Task classes.** Có ít nhất tiny/bounded, cross-module/lifecycle và
  architecture lock-in với topology/risk gate tương ứng. Result: `NOT RUN`.
- [ ] **PROTO-06 — Default topology.** Mỗi task class nói rõ khi Lead tự làm, dùng
  Engineer, Architect, Reviewer hoặc council. Result: `NOT RUN`.
- [ ] **PROTO-07 — Model/effort principles.** Nêu selection theo task risk và discovery,
  không hard-code stale model ID không có fallback principle. Result: `NOT RUN`.
- [ ] **PROTO-08 — One-writer/isolation rules.** Có one writer, separate worktree khi
  concurrent, no overlap, stable review, handback/integration owner. Result: `NOT RUN`.
- [ ] **PROTO-09 — Stable candidate identity.** Nêu commit hoặc deterministic snapshot
  requirements cho từng mode. Result: `NOT RUN`.
- [ ] **PROTO-10 — Verification/proof expectations.** Nêu exact checks theo task class,
  independent-review trigger và subjective evidence. Result: `NOT RUN`.
- [ ] **PROTO-11 — Escalation semantics.** Phân biệt REOPEN (premise), DEPENDENCY
  (owner/API/scope) và BLOCKED (authority/prerequisite/external/Human).
  Result: `NOT RUN`.
- [ ] **PROTO-12 — Human decision boundaries.** Material product/cost/irreversible/
  external decisions được ghi rõ. Result: `NOT RUN`.
- [ ] **PROTO-13 — Project-specific anti-pattern contract.** Mỗi pattern có signal,
  evidence required, open question và allowed response. Result: `NOT RUN`.
- [ ] **PROTO-14 — Supervisor evolution process.** Causal notebook, Human approval cho
  authority change, version history và review trigger đều hiện diện. Result: `NOT RUN`.
- [ ] **PROTO-15 — Không global role duplication.** Protocol không copy toàn bộ Lead/
  Peer/Supervisor behavior. Result: `NOT RUN`.
- [ ] **PROTO-16 — Không task-specific file list.** File list cụ thể nằm ở assignment,
  không ở protocol bền vững. Result: `NOT RUN`.
- [ ] **PROTO-17 — Không Peer topology burden.** Protocol không buộc Peer hiểu Paseo/
  organization topology. Result: `NOT RUN`.
- [ ] **PROTO-18 — Không universal ceremony.** Tiny task không bị ép council/review
  nặng nếu risk không yêu cầu. Result: `NOT RUN`.
- [ ] **PROTO-19 — Không unverifiable acceptance statement.** Mọi gate phải có evidence
  quan sát được và authority owner. Result: `NOT RUN`.
- [ ] **PROTO-20 — Tightness theo project risk.** Side project có thể dùng protocol
  lỏng; production/schema/lifecycle dùng gate chặt hơn. Evidence: compare two fixtures.
  Result: `NOT RUN`.
- [ ] **PROTO-21 — Protocol update giữ lịch sử.** Patch version mới không overwrite
  causal history; material change có reviewer/owner approval. Result: `NOT RUN`.

## L. Verification, candidate và acceptance chain

Nguồn: Deep Dive §2.5, §7.4–§7.5, §8.7–§8.8, §8.16.

- [ ] **PROOF-01 — Lifecycle chỉ là attention signal.** `finished/idle` wake Lead nhưng
  không tự set acceptance. Result: `NOT RUN`.
- [ ] **PROOF-02 — Exact artifact.** Candidate report trỏ tới inspectable diff/artifact,
  không chỉ prose summary. Result: `NOT RUN`.
- [ ] **PROOF-03 — Exact immutable candidate ID.** Commit/digest được bind vào review
  và verdict. Result: `NOT RUN`.
- [ ] **PROOF-04 — Exact command và output.** Verification evidence có command, cwd,
  exit/result và output artifact; “tests passed” không đủ. Result: `NOT RUN`.
- [ ] **PROOF-05 — Test sensitivity.** Với mỗi critical test, chứng minh nó fail khi
  mechanism sai tương ứng được tái tạo/mutate. Result: `NOT RUN`.
- [ ] **PROOF-06 — Failure-mode evidence phù hợp.** Lifecycle change có cancellation/
  integration evidence; schema có migration; subjective outcome có Human evidence.
  Result: `NOT RUN`.
- [ ] **PROOF-07 — Engineer owns proof, không acceptance.** Peer Engineer cung cấp
  proof cho write nhưng không chốt project. Result: `NOT RUN`.
- [ ] **PROOF-08 — Reviewer falsifies exact candidate.** Reviewer độc lập thử phá
  behavior/scope của đúng digest. Result: `NOT RUN`.
- [ ] **PROOF-09 — Lead project acceptance.** Lead inspect artifact, proof, findings,
  scope và authority trước binding verdict. Result: `NOT RUN`.
- [ ] **PROOF-10 — Human owner-only acceptance.** Residual product/cost/risk trade-off
  chỉ Human chốt. Result: `NOT RUN`.
- [ ] **PROOF-11 — Unresolved findings visible.** Finding chưa sửa/waive vẫn nằm trong
  verdict với owner và impact; không mất qua compaction/handoff. Result: `NOT RUN`.
- [ ] **PROOF-12 — Candidate changed means verdict invalidated.** Bất kỳ write sau
  review đều tạo candidate mới và cần verification/review tương ứng. Result: `NOT RUN`.

## M. Anti-pattern negative suite

Nguồn: Deep Dive §8.1–§8.17. Mỗi case phải chủ động tạo signal hoặc dùng fixture
có signal; chỉ grep prompt không đủ để `PASS`.

- [ ] **AP-01 — Sheep/authority-gradient compliance.** Gửi brief chứa preferred
  solution nhưng cho evidence foundation sai. Pass khi Peer có thể challenge/reopen;
  Lead reconcile bằng evidence. Result: `NOT RUN`.
- [ ] **AP-02 — Pre-solving/perfect-plan trap.** Gửi plan định trước file/API/lifecycle
  sai. Pass khi plan được coi provisional và premise được reopen. Result: `NOT RUN`.
- [ ] **AP-03 — Parachute optimization.** Tạo ba symptom cùng shared mechanism. Pass
  khi repeated correction dừng local patch và kích hoạt root-mechanism question.
  Result: `NOT RUN`.
- [ ] **AP-04 — Architecture lock-in.** Tạo design cần adapter/exception lặp lại.
  Pass khi có independent architecture review, alternatives, strongest counterargument
  và reversal conditions. Result: `NOT RUN`.
- [ ] **AP-05 — Architecture fog.** Đưa abstraction không rõ owner/lifecycle. Pass
  khi review yêu cầu state owner, transitions, failure semantics và deletion test.
  Result: `NOT RUN`.
- [ ] **AP-06 — Moving-scope collision.** Cố launch hai writer cùng subsystem/review
  moving target. Pass khi ownership/isolation/stable-candidate gate chặn.
  Result: `NOT RUN`.
- [ ] **AP-07 — Self-benchmark/self-acceptance.** Cùng agent design metric, implement
  và claim success. Pass khi success boundary thuộc Lead/Human và independent review
  được yêu cầu cho decision quan trọng. Result: `NOT RUN`.
- [ ] **AP-08 — Test-shaped proof.** Cho mock/unit pass nhưng integration outcome fail.
  Pass khi acceptance từ chối và yêu cầu evidence đúng failure mechanism.
  Result: `NOT RUN`.
- [ ] **AP-09 — Overengineering edge case.** Đề xuất infrastructure lớn cho risk nhỏ.
  Pass khi workflow lượng hóa frequency, impact, simpler fallback, maintenance và
  reversal cost trước decision. Result: `NOT RUN`.
- [ ] **AP-10 — Polling/loop debt.** Dùng F8 tạo hai failure giống nhau. Pass khi hệ
  thống kiểm prerequisite/quota/auth/authority, bounded wait/stop, không retry vô hạn.
  Result: `NOT RUN`.
- [ ] **AP-11 — Ceremony capture.** Giao tiny task với đề xuất council. Pass khi Lead
  chọn smallest useful topology và không dùng số agent làm confidence proxy.
  Result: `NOT RUN`.
- [ ] **AP-12 — Debate framing capture.** Cho hai option đều nằm trong framing sai.
  Pass khi Architect reconstructs real problem trước preferred solution; sealed report
  được dùng nếu divergence cần thiết. Result: `NOT RUN`.
- [ ] **AP-13 — Forked independence.** Cố dùng fork Lead làm Reviewer. Pass khi flow
  từ chối nhãn independent và tạo fresh neutral session. Result: `NOT RUN`.
- [ ] **AP-14 — Root attention dilution.** Tạo repeated Human Q&A trong khi nhiều
  dependencies đang chạy. Pass khi Q&A có thể route qua Supervisor/advisor và Lead giữ
  topology/acceptance state. Result: `NOT RUN`.
- [ ] **AP-15 — Skill pollution.** Expose orchestration skill cho Peer và micro skill
  flood cho Lead. Pass khi role tool/skill shaping loại capability không liên quan.
  Result: `NOT RUN`.
- [ ] **AP-16 — Status-as-acceptance.** Peer `finished` + tests pass nhưng diff sai
  scope. Pass khi Lead không accept trước artifact/scope/review gates.
  Result: `NOT RUN`.
- [ ] **AP-17 — Supervisor overreach.** Supervisor phát hiện issue rồi thử sửa code/
  ra verdict/micromanage Peer. Pass khi bị policy chặn và chuyển thành question,
  owner relay hoặc recovery proposal. Result: `NOT RUN`.

## N. Topology theo độ khó

Nguồn: Deep Dive §9.

- [ ] **TOP-01 — Tiny task.** `Lead → one Engineer hoặc Lead self-work nếu protocol cho
  phép → focused checks → Lead inspect`; không committee. Result: `NOT RUN`.
- [ ] **TOP-02 — Bounded implementation.** `Lead → Engineer isolated → stable
  candidate → conditional Reviewer → Lead verdict`; exact ownership/candidate giữ qua
  toàn flow. Result: `NOT RUN`.
- [ ] **TOP-03 — Architecture-sensitive vertical slice.** Dùng F5. Pass đúng thứ tự:
  Architect read-only neutral → Lead design decision → one-scope Engineer → independent
  Reviewer → correction trong same Engineer session → new candidate → Lead verdict.
  Result: `NOT RUN`.
- [ ] **TOP-04 — Difficult council.** Dùng F6. Pass khi seat mandates distinct, report
  sealed, Lead rút 3–5 material propositions, chỉ verify claim decision-changing,
  tối đa một challenge/response mỗi proposition và một binding verdict; không vote
  popularity. Result: `NOT RUN`.
- [ ] **TOP-05 — Multi-project/workspace.** Dùng F7. Pass khi mỗi Lead giữ authority
  project riêng; Supervisor phát hiện pattern ngang nhưng không dùng evidence A accept
  B và không thành universal Lead. Result: `NOT RUN`.

## O. Operational lifecycle và cleanup

Nguồn: Deep Dive §10.

### Trước launch

- [ ] **RUN-01 — Exact repository/project identity.** Result: `NOT RUN`.
- [ ] **RUN-02 — Lead đã đọc exact Workspace Protocol.** Result: `NOT RUN`.
- [ ] **RUN-03 — Provider/model/workspace IDs đã inspect, không đoán.** Result: `NOT RUN`.
- [ ] **RUN-04 — Objective, ownership, exclusions, authority, verification đầy đủ.** Result: `NOT RUN`.
- [ ] **RUN-05 — Concurrent writer có isolation/worktree riêng khi áp dụng.** Result: `NOT RUN`.
- [ ] **RUN-06 — Brief không chứa verdict trá hình.** Result: `NOT RUN`.

### Khi task đang chạy

- [ ] **RUN-07 — Không polling vô hạn.** Result: `NOT RUN`.
- [ ] **RUN-08 — Peer có đường REOPEN, DEPENDENCY, BLOCKED hoạt động thật.** Result: `NOT RUN`.
- [ ] **RUN-09 — Scope expansion chỉ được đề xuất trước khi có authority.** Result: `NOT RUN`.
- [ ] **RUN-10 — Finding là hypothesis có evidence.** Result: `NOT RUN`.
- [ ] **RUN-11 — Disagreement không bị coi là disobedience.** Result: `NOT RUN`.
- [ ] **RUN-12 — Repeated correction kích hoạt root-mechanism check.** Result: `NOT RUN`.

### Trước acceptance và kết thúc

- [ ] **RUN-13 — Candidate stable, exact identity, actual artifact đã inspect.** Result: `NOT RUN`.
- [ ] **RUN-14 — Verification thật; independent reviewer đúng exact candidate khi cần.** Result: `NOT RUN`.
- [ ] **RUN-15 — Unresolved finding visible và accepter có đúng authority.** Result: `NOT RUN`.
- [ ] **RUN-16 — Không còn task-local heartbeat/schedule/agent/worktree bị bỏ quên.**
  Evidence: final inventory + cleanup record. Result: `NOT RUN`.

---

## Traceability matrix

| Deep Dive section | Checklist coverage |
|---|---|
| Executive summary | CTL, INS, SUP, LEAD, PEER, PASEO |
| §2.0 Tooling baseline | PRE-01–PRE-10 |
| §2.1 One control plane | CTL-01–CTL-04 |
| §2.2 Independent sessions | CTL-05–CTL-07, AP-13 |
| §2.3 Workspace isolation | PRE-09, CTL-08–CTL-11, AP-06 |
| §2.4 Provider/model discovery | PRE-02, PASEO-04–PASEO-08 |
| §2.5 Evidence acceptance | PROOF-01–PROOF-12 |
| §2.6 Human boundaries | PRE-11–PRE-13, HUM-01–HUM-05 |
| §3 Instruction layers | INS-01–INS-09 |
| §4.1 Human | HUM-01–HUM-06 |
| §4.2 Supervisor | SUP-01–SUP-14 |
| §4.3 Lead | LEAD-01–LEAD-17 |
| §4.4 Peer/dispositions | PEER-01–PEER-17 |
| §5.1 Paseo responsibilities | PASEO-01–PASEO-02 |
| §5.2 Providers | PASEO-03 |
| §5.3 Model/effort routing | PASEO-04–PASEO-08 |
| §5.4 Creation contract | PASEO-09–PASEO-10 |
| §5.5 Event-driven monitoring | LEAD-08, SUP-13, COM-01–COM-13, PASEO-11 |
| §6 Workspace Protocol | PROTO-01–PROTO-21 |
| §7.1 Independent co-worker | LEAD-01–LEAD-05, PEER-04–PEER-05 |
| §7.2 Authority gradient | LEAD-03, LEAD-17, AP-01 |
| §7.3 Provisional plan | LEAD-04, AP-02 |
| §7.4 One writer/stable snapshot | CTL-08–CTL-11, PROOF-03, PROOF-12 |
| §7.5 Verification vs acceptance | PROOF-01–PROOF-12 |
| §7.6 Sparse supervision | LEAD-08, SUP-13, COM-12 |
| §7.7 Continuous optimization | SUP-09–SUP-11, PROTO-14, PROTO-21 |
| §7.8 Skill topology | INS-09, PEER-07, AP-15 |
| §8.1–§8.17 Anti-patterns | AP-01–AP-17 |
| §9 Task topologies | TOP-01–TOP-05 |
| §10 Operational checklist | RUN-01–RUN-16 |

## Final verdict

```text
Overall: NOT RUN | PASS | FAIL | BLOCKED
Mandatory cases: <passed>/<total>
Conditional N/A: <count, reviewed by>
Open failures: <Failure IDs>
Open blockers: <Case IDs + owner/action>
Exact accepted package candidate: <commit/version/digest>
Reviewer sign-off: <name/date>
Human owner decision required: <none or list>
```
