# Krevyx v3.21 — Rakip Öncül Özellik Sentezi Planı

**Tarih:** 17 Ağustos 2026 · **Girdi:** `docs/competitor-research.md` (Cursor, Claude Code, Codex, Gemini CLI, Windsurf, Zed)

## Tasarım İlkesi

Her rakibin en güçlü öncül özelliği alındı; ancak hiçbiri kopyalanmadı — hepsi Krevyx'in üç katmanlı mimarisine (sağlayıcı → kod ajanı köprüsü → orkestrasyon) **yerli** biçimde işlendi. Amaç: tek bir pencerede hem Cursor'un çoklu-dosya edit disiplini, hem Claude Code'un plan/onay/kürasyon döngüsü, hem Codex'in sandbox disiplini, hem Anthropic'in grading loop'u.

## Seçilen Özellik Seti ve Skorlama

| # | Özellik | Rakip kaynağı | Etki | Uygulanabilirlik |
|---|---|---|---|---|
| 1 | **KREYX.md proje hafızası** | Claude Code CLAUDE.md + Cursor rules | Çok yüksek | Yüksek |
| 2 | **Plan Mode** (salt-okuma plan + onay) | Claude Code Plan Mode | Çok yüksek | Yüksek |
| 3 | **Outcomes grading loop** | Anthropic Outcomes | Yüksek | Yüksek |
| 4 | **Hooks** (task-start/step/task-done) | Claude Code hooks | Yüksek | Yüksek |
| 5 | **Diff Review** (değişiklik özeti raporu) | Cursor BugBot / Claude /review | Orta-yüksek | Yüksek |

## Uygulama Detayları

### 1. KREYX.md — Proje Hafızası (`src/main/agents/project-memory.js`)
Proje kökünde `KREYX.md` (veya `.krevyxprofile/`) bulunursa görev prompt'unun önüne otomatik iliştirilir. Kullanıcı arayüzden "hafıza dosyası" oluşturabilir; düzenleme sırasında görevden gelen öğretiler (çalışan komutlar, gotcha'lar) tek satır olarak dosyanın sonuna eklenir (manuel onayla). Kaynaklar: kök, profil, `~/.krevyx/CLAUDE.md`-benzeri `~/.krevyx/user.md`.

### 2. Plan Mode (`--plan` / `/plan`)
Agent console'a "Plan" toggle'ı eklenir: aktifken süreç spawn edilmez; köprü yerine görev + proje bağlamını analiz eden plan üretir (adım listesi, dosya listesi, tahmini risk). `agent-plan` IPC kanalı ile arayüzde diff benzeri bir panel gösterilir; "Onayla ve Çalıştır" düğmesiyle gerçek süreç başlatılır. Kod ajanı köprüsünde `dryRun` bayrağı yeni.

### 3. Outcomes Grading (`gradeTask` modülü)
Görev bittiğinde (ok:true ve adım sayı belli bir eşiği geçince) seçilen modelden (ayar: grading-model) öz değerlendirme istenir: görev tekrar edildi mi, adım kalitesi, kalan risk, önerilen devam. Sonuç agent console'a "Grading" kartı olarak düşer; reddedilirse tek tıkla yeniden çalıştırma. SARIF audit'a `grading` kaydı eklenir.

### 4. Hooks (`krevyx-hooks.json`)
Profil başına task-start / task-done / step hooks — shell komutları (örn: her görev sonunda `git status`, task-start'ta `.env` koruma uyarısı). Hook'lar bridge'in veri olaylarında (try/catch'li) çalışır; başarısız hook görevi öldürmez, audit'a kaydedilir.

### 5. Diff Review
Kod ajanı profili `workingDir` git repo ise görev bitişinde `git diff --stat + git log` özet kartı "Değişiklikler" paneli olarak gösterilir; SARIF'a diff özeti işlenir.

## Test Planı
`tests/v321.test.js`: KREYX.md iliştirme, plan mode payload, grading loop (mock fetch), hook yürütme, diff review özet. Jest 239 test mevcut; yeni +15 hedef.

## Site Planı (Faz 4)
Roadmap'e v3.21.0 girişi (TR/EN): KREYX.md, Plan Mode, Outcomes, Hooks, Diff Review; i18n feature metinleri.
