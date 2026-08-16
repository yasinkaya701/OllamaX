/*
 * Krevyx — Docs page (Emerald Ledger dark premium)
 * Professional documentation: installation, token config, settings, shortcuts, troubleshooting
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import Reveal from "@/components/Reveal";

const ICON_512 = "/manus-storage/krevyx-icon-512_b8b42c0f.png";
const REPO = "https://github.com/yasinkaya701/OllamaX";

const SECTIONS = ["install", "token", "settings", "shortcuts", "troubleshoot", "faq"] as const;

function DocsNav() {
  const { t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links: [string, string][] = [
    ["#", t.nav_features],
    ["/docs", t.docs_nav_install],
    ["#saglayicilar", t.nav_providers],
    ["#indir", t.nav_downloads],
    ["/docs", t.docs_title],
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-background/80 backdrop-blur-xl border-b border-border/60" : "bg-transparent"
      }`}
    >
      <nav className="container flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-3 group">
          <img src={ICON_512} alt="Krevyx" className="w-9 h-9 transition-transform duration-300 group-hover:scale-105" loading="lazy" decoding="async" />
          <span className="font-display text-lg font-bold tracking-tight">
            Krevyx
          </span>
          <span className="hidden md:inline font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground border border-border rounded px-2 py-0.5 ml-1">
            {t.nav_version}
          </span>
        </Link>
        <div className="hidden lg:flex items-center gap-8 text-sm text-muted-foreground">
          <Link href="/" className="underline-shift hover:text-foreground transition-colors">
            {t.nav_features}
          </Link>
          <Link href="/" className="underline-shift hover:text-foreground transition-colors">
            {t.nav_downloads}
          </Link>
          <Link href="/" className="underline-shift hover:text-foreground transition-colors">
            {t.nav_faq}
          </Link>
          <a href={REPO} target="_blank" rel="noopener noreferrer" className="underline-shift hover:text-foreground transition-colors">
            {t.nav_github}
          </a>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors duration-150 active:scale-[0.96]"
          >
            {theme === "dark" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
              </svg>
            )}
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary-foreground bg-primary px-4 py-2 rounded-lg transition-transform duration-150 active:scale-[0.97] hover:brightness-110"
          >
            {t.nav_download_cta}
          </Link>
        </div>
      </nav>
    </header>
  );
}

/* ========== Docs search ========== */
function useDocsSearch() {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const match = (text: string) => !q || text.toLowerCase().includes(q);
  const searchIndex = () => ({
    install: t.docs_install.some((p) => match(p.title) || p.steps.some((s) => match(s))),
    token: match(t.docs_token_desc) || t.docs_token_steps.some((s) => match(s.label) || match(s.desc)) || match(t.docs_token_providers),
    settings: t.docs_settings_items.some((s) => match(s.title) || match(s.desc)),
    shortcuts: t.docs_shortcuts.some((s) => match(s.desc) || match(s.keys)),
    troubleshoot: t.docs_troubleshoot.some((s) => match(s.q) || match(s.a)),
    faq: t.faq.some((s) => match(s.q) || match(s.a)),
  });
  const visible = q ? searchIndex() : ({} as ReturnType<typeof searchIndex>);
  return { query, setQuery, visible };
}

function DocsSearch({ query, setQuery, onJump }: { query: string; setQuery: (v: string) => void; onJump: (id: string) => void }) {
  const { t } = useLanguage();
  return (
    <div className="relative max-w-xl">
      <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.docs_search_placeholder}
        aria-label={t.docs_search_placeholder}
        className="w-full rounded-xl border border-border/70 bg-card/60 backdrop-blur-sm pl-11 pr-14 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all duration-200"
      />
      <kbd className="hidden sm:inline-flex absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">ESC</kbd>
      <button
        onClick={() => onJump("#install")}
        aria-label={t.docs_intro_start}
        className="sr-only"
      />
    </div>
  );
}

/* ========== Section components ========== */
function InstallSection({ visible }: { visible?: boolean }) {
  const { t } = useLanguage();
  if (visible === false) return null;
  return (
    <section id="install" className="scroll-mt-24">
      <SectionHeading index="01" label={t.docs_nav_install} title={t.docs_nav_install} />
      <div className="space-y-8">
        {t.docs_install.map((platform, i) => (
          <Reveal key={platform.title} delay={i * 50}>
            <div className="glow-card rounded-2xl p-6 md:p-8">
              <h3 className="font-display text-xl md:text-2xl font-semibold mb-4 flex items-center gap-3">
                <span className="text-primary font-mono text-sm">{String(i + 1).padStart(2, "0")}</span>
                {platform.title}
              </h3>
              <ol className="space-y-3">
                {platform.steps.map((step, j) => (
                  <li key={j} className="flex items-start gap-3 text-sm md:text-base text-muted-foreground">
                    <span className="font-mono text-xs text-primary mt-0.5 shrink-0">{j + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function TokenSection({ visible }: { visible?: boolean }) {
  const { t } = useLanguage();
  if (visible === false) return null;
  return (
    <section id="token" className="scroll-mt-24">
      <SectionHeading index="02" label={t.docs_nav_token} title={t.docs_token_title} />
      <p className="text-muted-foreground text-base md:text-lg max-w-2xl leading-relaxed mb-8">
        {t.docs_token_desc}
      </p>
      <div className="space-y-4 mb-10">
        {t.docs_token_steps.map((step, i) => (
          <Reveal key={step.label} delay={i * 40}>
            <div className="glow-card rounded-xl p-5 md:p-6">
              <h4 className="font-display text-base md:text-lg font-semibold mb-2 flex items-center gap-3">
                <span className="font-mono text-xs text-primary bg-primary/10 border border-primary/30 rounded-full px-2.5 py-0.5">
                  {i + 1}
                </span>
                {step.label}
              </h4>
              <p className="text-muted-foreground text-sm md:text-base pl-9 leading-relaxed">{step.desc}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <Reveal>
        <div className="rounded-xl border border-border/70 bg-card/50 p-5 md:p-6">
          <h4 className="font-mono text-xs uppercase tracking-[0.16em] text-primary mb-3">{t.docs_token_providers_title}</h4>
          <p className="text-sm text-foreground/80 leading-relaxed">{t.docs_token_providers}</p>
          <div className="mt-4 pt-4 border-t border-border/60">
            <p className="font-mono text-xs text-muted-foreground leading-relaxed">{t.docs_token_security}</p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function SettingsSection({ visible }: { visible?: boolean }) {
  const { t } = useLanguage();
  if (visible === false) return null;
  return (
    <section id="settings" className="scroll-mt-24">
      <SectionHeading index="03" label={t.docs_nav_settings} title={t.docs_settings_title} />
      <div className="grid md:grid-cols-2 gap-4">
        {t.docs_settings_items.map((item, i) => (
          <Reveal key={item.title} delay={i * 40}>
            <div className="glow-card rounded-xl p-5 md:p-6 h-full">
              <h4 className="font-display text-lg font-semibold mb-2 flex items-center gap-3">
                <span className="text-primary font-mono text-sm">{String(i + 1).padStart(2, "0")}</span>
                {item.title}
              </h4>
              <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function ShortcutsSection({ visible }: { visible?: boolean }) {
  const { t } = useLanguage();
  if (visible === false) return null;
  return (
    <section id="shortcuts" className="scroll-mt-24">
      <SectionHeading index="04" label={t.docs_nav_shortcuts} title={t.docs_shortcuts_title} />
      <div className="glow-card rounded-xl overflow-hidden">
        <div className="divide-y divide-border/60">
          {t.docs_shortcuts.map((s, i) => (
            <Reveal key={s.keys} delay={i * 25}>
              <div className="flex items-center justify-between px-5 md:px-6 py-3.5 hover:bg-card/40 transition-colors duration-150">
                <span className="text-sm text-muted-foreground">{s.desc}</span>
                <span className="font-mono text-xs text-primary bg-background/60 border border-border rounded px-2.5 py-1">{s.keys}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function TroubleshootSection({ visible }: { visible?: boolean }) {
  const { t } = useLanguage();
  if (visible === false) return null;
  return (
    <section id="troubleshoot" className="scroll-mt-24">
      <SectionHeading index="05" label={t.docs_nav_troubleshoot} title={t.docs_troubleshoot_title} />
      <div className="space-y-4">
        {t.docs_troubleshoot.map((item, i) => (
          <Reveal key={item.q} delay={i * 30}>
            <div className="glow-card rounded-xl p-5 md:p-6">
              <h4 className="font-display text-base md:text-lg font-semibold mb-2 flex items-center gap-3">
                <span className="text-primary">⚠</span>
                {item.q}
              </h4>
              <p className="text-muted-foreground text-sm md:text-base leading-relaxed pl-7">{item.a}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function FaqSection({ visible }: { visible?: boolean }) {
  const { t } = useLanguage();
  if (visible === false) return null;
  return (
    <section id="faq" className="scroll-mt-24">
      <SectionHeading index="06" label={t.docs_nav_faq} title={t.docs_title} />
      <div className="space-y-4">
        {t.faq.map((item, i) => (
          <Reveal key={i} delay={i * 30}>
            <div className="glow-card rounded-xl p-5 md:p-6">
              <h4 className="font-display text-base md:text-lg font-semibold mb-2">{item.q}</h4>
              <p className="text-muted-foreground text-sm md:text-base leading-relaxed">{item.a}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ========== Shared ========== */
function SectionHeading({ index, label, title }: { index: string; label: string; title: string }) {
  return (
    <Reveal className="mb-8">
      <div className="flex items-center gap-4 mb-4 font-mono text-xs tracking-[0.18em] uppercase text-muted-foreground">
        <span className="text-primary font-semibold">{index}</span>
        <span className="h-px w-10 bg-border" />
        <span>{label}</span>
      </div>
      <h2 className="text-3xl md:text-4xl font-bold">{title}</h2>
    </Reveal>
  );
}

/* ========== Sidebar TOC ========== */
function DocsSidebar() {
  const { t } = useLanguage();
  const items = [
    { id: "install", label: t.docs_nav_install },
    { id: "token", label: t.docs_nav_token },
    { id: "settings", label: t.docs_nav_settings },
    { id: "shortcuts", label: t.docs_nav_shortcuts },
    { id: "troubleshoot", label: t.docs_nav_troubleshoot },
    { id: "faq", label: t.docs_nav_faq },
  ];
  return (
    <aside className="hidden lg:block w-64 shrink-0 sticky top-24 self-start">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-4">
        {t.docs_sidebar_title}
      </div>
      <nav className="space-y-1">
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="block text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 py-1.5 px-3 rounded-lg hover:bg-card/50"
          >
            {item.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}

/* ========== Page ========== */
export default function Docs() {
  const { t } = useLanguage();
  const { query, setQuery, visible } = useDocsSearch();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!query) return;
    const timer = setTimeout(() => setCount((c) => c + 1), 400);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && query) setQuery("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [query, setQuery]);
  const anyVisible = query ? Object.values(visible).some(Boolean) : true;
  const hasResults = query ? anyVisible : true;
  return (
    <div className="min-h-screen flex flex-col">
      <DocsNav />
      <main className="flex-1 pt-28 pb-20">
        <div className="container">
          <Reveal>
            <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">{t.docs_title}</h1>
            <p className="text-muted-foreground text-lg max-w-2xl">{t.docs_subtitle}</p>
            <p className="text-foreground/80 text-base md:text-lg max-w-2xl leading-relaxed mt-6">
              {t.docs_intro}
            </p>
            <div className="mt-6">
              <DocsSearch query={query} setQuery={setQuery} onJump={(href) => { const el = document.querySelector(href); el?.scrollIntoView({ behavior: "smooth" }); }} />
            </div>
            {!hasResults && (
              <p className="mt-4 text-sm text-muted-foreground">{t.docs_search_noresult}</p>
            )}
          </Reveal>
          <div className="mt-16 flex gap-12">
            <DocsSidebar />
            <div className="flex-1 max-w-3xl space-y-24">
              <InstallSection visible={visible.install} />
              <TokenSection visible={visible.token} />
              <SettingsSection visible={visible.settings} />
              <ShortcutsSection visible={visible.shortcuts} />
              <TroubleshootSection visible={visible.troubleshoot} />
              <FaqSection visible={visible.faq} />
            </div>
          </div>
        </div>
      </main>
      <footer className="border-t border-border/60 py-8">
        <div className="container flex items-center justify-between text-sm text-muted-foreground">
          <Link href="/" className="underline-shift hover:text-foreground transition-colors">
            ← {t.nav_features}
          </Link>
          <a href={REPO} target="_blank" rel="noopener noreferrer" className="underline-shift hover:text-foreground transition-colors">
            {t.nav_github}
          </a>
        </div>
      </footer>
    </div>
  );
}
