/*
 * Krevyx — Emerald Ledger premium landing (Cursor kalitesinde)
 * v2: TR/EN i18n + dark/light tema + SSS + premium animasyonlar
 * Siyah zemin + emerald #00A878 imza rengi. Space Grotesk display / Public Sans / JetBrains Mono.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import Reveal, { RevealWithRef } from "@/components/Reveal";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const REPO = "https://github.com/yasinkaya701/OllamaX";
const ICON_512 = "/manus-storage/krevyx-icon-512_b8b42c0f.png";
const PREVIEW = "/manus-storage/krevyx-app-screenshot_f6aacd94.png";
const HERO_BG = "/manus-storage/krevyx-hero-bg_213e10c8.png";
const VISION_BG = "/manus-storage/krevyx-vision-bg_907ba001.png";
const PROVIDERS_BG = "/manus-storage/krevyx-providers-bg_8560967c.png";

/* ========== typewriter (hero) ========== */
function useTypewriter(lines: string[]) {
  const [text, setText] = useState("");
  const [lineIdx, setLineIdx] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let mounted = true;
    let ti: ReturnType<typeof setTimeout>;
    let full = "";
    const target = lines[0];
    const step = () => {
      if (!mounted) return;
      if (full.length < target.length) {
        full = target.slice(0, full.length + 1);
        setText("$ " + full);
        ti = setTimeout(step, 26 + Math.random() * 34);
      } else if (lineIdx < lines.length - 1) {
        setLineIdx((i) => i + 1);
        full = "";
        ti = setTimeout(() => {
          setLineIdx(0);
          full = "";
        }, 2600);
      } else {
        setDone(true);
      }
    };
    const start = setTimeout(step, 700);
    return () => {
      mounted = false;
      clearTimeout(start);
      clearTimeout(ti);
    };
  }, [lines, lineIdx]);

  return { text, done, current: lines[lineIdx] ?? lines[0] };
}

/* ========== count-up (stats) ========== */
function useCountUp(targetStr: string) {
  const [val, setVal] = useState("0");
  useEffect(() => {
    const num = parseInt(targetStr, 10);
    if (isNaN(num)) { setVal(targetStr); return; }
    let frame: ReturnType<typeof requestAnimationFrame>;
    let start: number | null = null;
    const dur = 1200;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(String(Math.round(num * eased)) + targetStr.replace(/[0-9]/g, ""));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [targetStr]);
  return val;
}

/* ========== scroll progress ========== */
function ScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setP(h > 0 ? window.scrollY / h : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="fixed top-0 left-0 right-0 z-[61] h-px pointer-events-none">
      <div
        className="h-full bg-primary origin-left"
        style={{
          transform: `scaleX(${p})`,
          background: "linear-gradient(90deg, rgba(0,168,120,0.3), rgba(0,168,120,0.95))",
          transition: "transform 80ms linear",
        }}
      />
    </div>
  );
}

/* ========== particle network (hero canvas) ========== */
function ParticleField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf: number;
    let w = 0, h = 0;
    type P = { x: number; y: number; vx: number; vy: number; r: number };
    let pts: P[] = [];
    const COUNT = 48;
    const resize = () => {
      w = canvas.width = canvas.offsetWidth * devicePixelRatio;
      h = canvas.height = canvas.offsetHeight * devicePixelRatio;
      ctx.scale(1, 1);
    };
    const init = () => {
      resize();
      pts = Array.from({ length: COUNT }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3 * devicePixelRatio,
        vy: (Math.random() - 0.5) * 0.3 * devicePixelRatio,
        r: (Math.random() * 1.4 + 0.6) * devicePixelRatio,
      }));
    };
    init();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const isDark = document.documentElement.classList.contains("dark");
    const lineColor = isDark ? [0, 168, 120] : [0, 120, 90];
    const draw = () => {
      if (!visible) return;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        a.x += a.vx; a.y += a.vy;
        if (a.x < 0 || a.x > w) a.vx *= -1;
        if (a.y < 0 || a.y > h) a.vy *= -1;
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${lineColor.join(",")}, 0.55)`;
        ctx.fill();
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist = 110 * devicePixelRatio;
          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.12;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(${lineColor.join(",")}, ${alpha})`;
            ctx.lineWidth = 1 * devicePixelRatio;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    let visible = true;
    const onVis = () => {
      visible = document.visibilityState === "visible";
      if (visible) raf = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", onVis);
    draw();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return (
    <canvas
      ref={ref}
      className="absolute inset-0 w-full h-full pointer-events-none opacity-80"
      style={{ mixBlendMode: "screen" }}
    />
  );
}

/* ========== SectionHeading (i18n-aware) ========== */
function SectionHeading({
  index,
  label,
  title,
  sub,
}: {
  index: string;
  label: string;
  title: string;
  sub?: string;
}) {
  return (
    <Reveal className="mb-14 md:mb-20">
      <div className="flex items-center gap-4 mb-6 font-mono text-xs tracking-[0.18em] uppercase text-muted-foreground">
        <span className="text-primary font-semibold">{index}</span>
        <span className="h-px w-10 bg-border" />
        <span>{label}</span>
      </div>
      <h2 className="text-4xl md:text-6xl font-bold mb-5 max-w-3xl leading-[1.04]">{title}</h2>
      {sub && <p className="text-muted-foreground text-base md:text-lg max-w-2xl leading-relaxed">{sub}</p>}
    </Reveal>
  );
}

/* ========== OS icons ========== */
function OsWin() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 6.5L10.5 5.5V11.5H3Z" /><path d="M11.5 5.4L21 4V11.5H11.5Z" />
      <path d="M3 12.5H10.5V18.5L3 17.5Z" /><path d="M11.5 12.5H21V20L11.5 18.6Z" />
    </svg>
  );
}
function OsMac() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M15.3 1.2c-.8.9-2 1.6-3.2 1.5-.1-1.1.4-2.3 1.2-3.1.8-.9 2.1-1.6 3.3-1.5.1 1.1-.4 2.3-1.3 3.1Z" />
      <path d="M16.8 7.2c-1.8-.1-3.3 1-4.2 1s-2.2-1-3.7-.9c-1.9 0-3.7 1.1-4.7 2.9-2 3.5-.5 8.7 1.5 11.6 1 1.4 2.1 3 3.6 3 1.5-.1 2-1 3.8-1s2.2 1 3.7 1c1.6 0 2.5-1.4 3.5-2.9.8-1.1 1.4-2.3 1.4-2.4 0 0-2.7-1-2.8-4.1 0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2.1-3.7-2.2Z" />
    </svg>
  );
}
function OsLinux() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="7.5" r="2.4" />
      <path d="M7.6 12.2c-2.2.6-3.6 2.8-3.4 5 .2 2 1.9 3.6 4 3.6h7.6c2.1 0 3.8-1.6 4-3.6.2-2.2-1.2-4.4-3.4-5" />
      <path d="M12 9.9v3.4" />
    </svg>
  );
}

/* ========== Language Switcher ========== */
function LangSwitch() {
  const { lang, setLang, t } = useLanguage();
  return (
    <div className="flex items-center border border-border rounded-lg overflow-hidden text-xs font-mono">
      <button
        onClick={() => setLang("tr")}
        className={`px-3 py-1.5 transition-colors duration-150 ${
          lang === "tr"
            ? "bg-primary text-primary-foreground font-semibold"
            : "text-muted-foreground hover:text-foreground"
        }`}
        aria-label={t.lang_tr}
      >
        TR
      </button>
      <button
        onClick={() => setLang("en")}
        className={`px-3 py-1.5 transition-colors duration-150 ${
          lang === "en"
            ? "bg-primary text-primary-foreground font-semibold"
            : "text-muted-foreground hover:text-foreground"
        }`}
        aria-label={t.lang_en}
      >
        EN
      </button>
    </div>
  );
}

/* ========== Theme Toggle ========== */
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
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
  );
}

/* ========== Nav ========== */
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const { t } = useLanguage();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const links: [string, string][] = [
    ["#vizyon", t.vision_label],
    ["#ozellikler", t.nav_features],
    ["#saglayicilar", t.nav_providers],
    ["#indir", t.nav_downloads],
    ["#sss", t.nav_faq],
    ["#surum", t.nav_changelog],
    ["/docs", t.docs_nav_install],
  ];
  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-background/80 backdrop-blur-xl border-b border-border/60" : "bg-transparent"
      }`}
    >
      <nav className="container flex items-center justify-between h-16">
        <a href="#" className="flex items-center gap-3 group">
          <img src={ICON_512} alt="Krevyx" className="w-9 h-9 transition-transform duration-300 group-hover:scale-105" loading="lazy" decoding="async" />
          <span className="font-display text-lg font-bold tracking-tight">
            Krevyx
          </span>
          <span className="hidden md:inline font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground border border-border rounded px-2 py-0.5 ml-1">
            {t.nav_version}
          </span>
        </a>
        <div className="hidden lg:flex items-center gap-8 text-sm text-muted-foreground">
          {links.map(([href, label]) => (
            <a key={href} href={href} className="underline-shift hover:text-foreground transition-colors">
              {label}
            </a>
          ))}
          <a href={REPO} target="_blank" rel="noopener noreferrer" className="underline-shift hover:text-foreground transition-colors">
            {t.nav_github}
          </a>
        </div>
        <div className="flex items-center gap-3">
          <LangSwitch />
          <ThemeToggle />
          <a
            href="#indir"
            className="hidden sm:inline-flex items-center gap-2 text-sm font-semibold text-primary-foreground bg-primary px-4 py-2 rounded-lg transition-transform duration-150 active:scale-[0.97] hover:brightness-110"
          >
            {t.nav_download_cta}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M12 4v12m0 0l-4.5-4.5M12 16l4.5-4.5M4 20h16" />
            </svg>
          </a>
        </div>
      </nav>
    </header>
  );
}

/* ========== Hero ========== */
function Hero() {
  const { t, lang } = useLanguage();
  const lines =
    lang === "en"
      ? [
          "krevyx run --orchestrate 18 providers",
          "krevyx discover --live --auto",
          "krevyx compose --files ./src --agents 7",
        ]
      : [
          "krevyx run --orchestrate 18 sağlayıcı",
          "krevyx discover --live --auto",
          "krevyx compose --files ./src --agents 7",
        ];
  const { text } = useTypewriter(lines);
  return (
    <section className="relative pt-36 md:pt-44 pb-20 overflow-hidden">
      {/* Sinematik zemin görseli + karartı + perspektif ağı */}
      <img
        src={HERO_BG}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover opacity-60"
        loading="lazy"
        decoding="async"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/40 to-background" />
      <div className="hero-perspective-floor" />
      <div className="lens-flare" style={{ width: 90, height: 90, top: "22%", right: "16%" }} />
      <div className="container relative">
        <div className="max-w-4xl">
          <Reveal>
            <p className="font-mono text-xs tracking-[0.22em] uppercase text-primary mb-6 flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {t.hero_badge}
            </p>
          </Reveal>
          <Reveal delay={60}>
            <h1 className="font-display text-[clamp(2.6rem,7vw,5.4rem)] font-bold leading-[1.02] tracking-tight">
              {t.hero_title_1}
              <br />
              <span className="text-primary">{t.hero_title_2}</span>
              {t.hero_title_3 && <>{` ${t.hero_title_3}`}</>}
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
              {t.hero_sub}
            </p>
          </Reveal>
          <Reveal delay={180}>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <a
                href="#indir"
                className="inline-flex items-center gap-2 font-semibold text-primary-foreground bg-primary px-6 py-3 rounded-lg text-base transition-all duration-150 active:scale-[0.97] hover:brightness-110 hover:shadow-[0_0_40px_-8px_rgba(0,168,120,0.6)]"
              >
                {t.hero_cta_primary}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M12 4v12m0 0l-4.5-4.5M12 16l4.5-4.5M4 20h16" />
                </svg>
              </a>
              <a
                href={REPO}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 font-medium px-6 py-3 rounded-lg border border-border hover:border-primary/60 hover:text-foreground text-muted-foreground transition-colors duration-150"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.33.96.1-.74.4-1.25.73-1.54-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.73.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
                </svg>
                {t.hero_cta_secondary}
              </a>
            </div>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-12 max-w-2xl rounded-xl border border-border/80 bg-card/70 backdrop-blur-md px-5 py-4 font-mono text-sm text-foreground/90 shadow-[0_0_80px_-20px_rgba(0,168,120,0.45)]">
              <span className="caret-blink">{text}</span>
            </div>
          </Reveal>
        </div>
        <Reveal delay={300} className="mt-16">
          <div className="relative rounded-2xl border border-border/70 bg-card/70 backdrop-blur-sm p-2 md:p-3 transition-all duration-500 hover:border-primary/30 shadow-[0_30px_100px_-30px_rgba(0,168,120,0.35)]">
            <img
              src={PREVIEW}
              alt="Krevyx uygulaması — gerçek arayüz (Agent Studio, sağlayıcılar, ayarlar)"
              className="w-full rounded-lg transition-transform duration-700 hover:scale-[1.01]"
              fetchPriority="high"
              decoding="async"
            />
            {/* Screenshot altı yansıma / derinlik */}
            <div
              className="absolute left-4 right-4 -bottom-6 h-10 rounded-b-[50%] bg-primary/15 blur-xl"
              aria-hidden
            />
            <div className="absolute top-4 left-4 font-mono text-[10px] tracking-[0.14em] uppercase text-primary bg-background/80 backdrop-blur border border-primary/30 rounded px-2 py-1">
              {t.hero_screenshot_label}
            </div>
            <div className="lens-flare" style={{ width: 70, height: 70, top: -24, right: 90 }} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ========== Stats Bar ========== */
function StatsItem({ value, label, delay }: { value: string; label: string; delay: number }) {
  const [visible, setVisible] = useState(false);
  const display = useCountUp(value);
  return (
    <RevealWithRef delay={delay} className="text-center md:text-left">
      <div
        className="font-display text-4xl md:text-5xl font-bold text-foreground"
        ref={(el) => {
          if (!el) return;
          const obs = new IntersectionObserver(
            ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
            { threshold: 0.3 }
          );
          obs.observe(el);
        }}
      >
        {visible ? display : "0"}
      </div>
      <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground mt-2">{label}</div>
    </RevealWithRef>
  );
}
function StatsBar() {
  const { t } = useLanguage();
  const stats = [
    { value: t.stats_1_value, label: t.stats_1_label },
    { value: t.stats_2_value, label: t.stats_2_label },
    { value: t.stats_3_value, label: t.stats_3_label },
    { value: t.stats_4_value, label: t.stats_4_label },
    { value: t.stats_5_value, label: t.stats_5_label },
  ];
  return (
    <section className="relative py-10 border-y border-border/60 bg-card/30">
      <div className="container grid grid-cols-2 md:grid-cols-5 gap-y-8 gap-x-4">
        {stats.map((s, i) => (
          <StatsItem key={s.label} value={s.value} label={s.label} delay={i * 50} />
        ))}
      </div>
    </section>
  );
}

/* ========== Vision ========== */
function Vision() {
  const { t } = useLanguage();
  return (
    <section id="vizyon" className="py-24 md:py-32 relative overflow-hidden">
      <img
        src={VISION_BG}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover opacity-35"
        loading="lazy"
        decoding="async"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/85 via-background/60 to-background/95" />
      <div className="container relative">
        <SectionHeading
          index={t.vision_index}
          label={t.vision_label}
          title={t.vision_title}
          sub={t.vision_sub}
        />
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { title: t.vision_1_title, desc: t.vision_1_desc, num: "I" },
            { title: t.vision_2_title, desc: t.vision_2_desc, num: "II" },
            { title: t.vision_3_title, desc: t.vision_3_desc, num: "III" },
          ].map((item, i) => (
            <RevealWithRef key={item.num} delay={i * 70}>
              <div className="relative group h-full border border-border/60 bg-card/20 rounded-xl p-8 transition-all duration-300 hover:border-primary/40 hover:bg-card/50">
                <div className="font-display text-5xl font-bold text-primary/15 group-hover:text-primary/25 transition-colors duration-300 select-none">
                  {item.num}
                </div>
                <h3 className="font-display text-xl font-bold text-foreground mt-4">{item.title}</h3>
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{item.desc}</p>
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
            </RevealWithRef>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ========== Features ========== */
function Features() {
  const { t } = useLanguage();
  return (
    <section id="ozellikler" className="py-24 md:py-32">
      <div className="container">
        <SectionHeading
          index={t.features_index}
          label={t.features_label}
          title={t.features_title}
          sub={t.features_sub}
        />
        <div className="space-y-px">
          {t.features.map((f, i) => {
            const flip = i % 2 === 1;
            return (
              <Reveal key={f.index}>
                <div className={`group grid md:grid-cols-12 gap-4 md:gap-8 py-8 md:py-10 border-t border-border/70 hover:bg-card/40 transition-colors duration-300 px-2 md:px-4 rounded-xl -mx-2 md:-mx-4 relative overflow-hidden ${flip ? "md:flex-row-reverse" : ""}`}>
                  {/* Left emerald border slide on hover */}
                  <div className="absolute left-0 top-0 bottom-0 w-0 group-hover:w-1 bg-primary transition-all duration-300" />
                  <div className="md:col-span-1 font-mono text-sm text-muted-foreground group-hover:text-primary transition-colors duration-300">{f.index}</div>
                  <div className="md:col-span-4">
                    <h3 className="font-display text-2xl md:text-3xl font-semibold">
                      {f.title}
                    </h3>
                    <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground mt-3">
                      {f.meta}
                    </div>
                  </div>
                  <div className={`md:col-span-4 text-muted-foreground leading-relaxed ${flip ? "md:order-first md:col-start-5" : ""}`}>{f.desc}</div>
                  {/* Sistem artifact — terminal/çıktı kalıbı */}
                  <div className={`md:col-span-3 ${flip ? "md:order-first md:col-start-2" : ""}`}>
                    <div className="rounded-lg border border-border/50 bg-card/60 backdrop-blur-sm p-3.5 font-mono text-[11px] leading-5 text-foreground/80 group-hover:border-primary/30 transition-colors duration-300">
                      {f.artifact.map((line, li) => (
                        <div key={li} className={li === 0 ? "text-primary" : li === f.artifact.length - 1 && line.startsWith("✓") ? "text-primary/80" : "text-foreground/60"}>
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
          <div className="border-t border-border/70" />
        </div>
      </div>
    </section>
  );
}

/* ========== Providers ========== */
function Providers() {
  const { t } = useLanguage();
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    let raf: number;
    const tick = () => {
      setOffset((o) => (o + 0.3) % 100);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const providers = ["Ollama", "OpenAI", "Anthropic", "Gemini", "OpenRouter", "xAI", "Mistral", "DeepSeek", "Groq", "Cohere", "Perplexity", "Together", "Cerebras", "Fireworks", "Replicate", "Azure", "Bedrock", "LM Studio"];
  return (
    <section id="saglayicilar" className="py-24 md:py-32 relative overflow-hidden">
      <img
        src={PROVIDERS_BG}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover opacity-30"
        loading="lazy"
        decoding="async"
      />
      <div className="glow-spot" style={{ width: 640, height: 640, bottom: -260, right: "-10%" }} />
      <div className="container relative">
        <SectionHeading
          index={t.providers_index}
          label={t.providers_label}
          title={t.providers_title}
          sub={t.providers_sub}
        />
        <div className="flex flex-wrap gap-3">
          {providers.map((p, i) => (
            <Reveal key={p} delay={(i % 6) * 40}>
              <div className="glow-card rounded-full px-5 py-2.5 text-sm font-medium text-foreground/90 transition-transform duration-200 hover:scale-105">
                {p}
              </div>
            </Reveal>
          ))}
        </div>
        <Marquee items={providers.slice(0, 6)} label="live" />
        <Reveal delay={100}>
          <div className="mt-10 rounded-xl border border-border/70 bg-card/50 p-5 md:p-6 font-mono text-sm max-w-3xl overflow-hidden relative">
            <div className="text-muted-foreground text-xs uppercase tracking-[0.16em] mb-3">$ krevyx providers --list</div>
            <div className="grid sm:grid-cols-3 gap-x-6 gap-y-1 text-foreground/85">
              {providers.map((p) => (
                <div key={p} className="flex items-center gap-2">
                  <span className="text-primary">✓</span> {p}
                </div>
              ))}
            </div>
            {/* Subtle animated scanline */}
            <div
              className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
              style={{ transform: `translateY(${offset * 3}px)` }}
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ========== Downloads ========== */
/* Detect the visitor's OS from navigator.userAgent and platform */
function detectOS(): "win" | "mac" | "linux" | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator.platform || "").toLowerCase();
  if (/windows|win32|win64/.test(ua) || platform.startsWith("win")) return "win";
  if (/macintosh|mac os x|darwin/.test(ua) || platform.startsWith("mac")) return "mac";
  if (/linux/.test(ua) || platform.includes("linux")) return "linux";
  return null;
}

function Downloads() {
  const { t } = useLanguage();
  const detected = detectOS();
  const platforms = [
    {
      os: "Windows",
      osKey: "win" as const,
      icon: <OsWin />,
      files: "Krevyx.Ultra.3.12.0.exe",
      note: "Windows 10/11 · x64 · NSIS",
      href: `${REPO}/releases/download/v3.13.0/Krevyx.Ultra.3.12.0.exe`,
      ready: true,
    },
    {
      os: "macOS",
      osKey: "mac" as const,
      icon: <OsMac />,
      files: "Krevyx.Ultra-3.12.0-arm64.dmg",
      note: "Apple Silicon (arm64)",
      href: `${REPO}/releases/download/v3.13.0/Krevyx.Ultra-3.12.0-arm64.dmg`,
      ready: true,
    },
    {
      os: "Linux",
      osKey: "linux" as const,
      icon: <OsLinux />,
      files: "Krevyx.Ultra-3.12.0.AppImage",
      note: "Debian tabanlı · AppImage · v3.12.0",
      href: `${REPO}/releases/download/v3.13.0/Krevyx.Ultra-3.12.0.AppImage`,
      ready: true,
    },
  ];
  // Highlight the detected platform and move it to the front
  const sorted = detected
    ? [...platforms.filter((p) => p.osKey === detected), ...platforms.filter((p) => p.osKey !== detected)]
    : platforms;
  return (
    <section id="indir" className="py-24 md:py-32 relative overflow-hidden border-t border-border/60">
      <div className="glow-spot" style={{ width: 780, height: 500, top: "10%", left: "-15%" }} />
      <div className="container relative">
        <SectionHeading
          index={t.downloads_index}
          label={t.downloads_label}
          title={t.downloads_title}
          sub={t.downloads_sub}
        />
        <div className="grid md:grid-cols-3 gap-5">
          {sorted.map((p, i) => {
            const isMatch = detected === p.osKey;
            return (
            <Reveal key={p.os} delay={i * 70}>
            {isMatch && (
              <div className="absolute -top-0 left-6 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.16em] text-primary-foreground bg-primary border border-primary/60 rounded-full px-3 py-1 shadow-lg">
                {t.downloads_recommended}
              </div>
            )}
              <a
                href={p.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${p.os}${isMatch ? ` — ${t.downloads_recommended}` : ""}`}
                className={`glow-card block rounded-2xl p-7 h-full relative overflow-hidden group transition-transform duration-300 ${isMatch ? "ring-2 ring-primary/70 scale-[1.02]" : ""}`}
                style={isMatch ? { boxShadow: "0 0 40px rgba(0,168,120,0.18)" } : undefined}
              >
                {/* Animated gradient sweep on hover */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:via-primary/3 group-hover:to-primary/0 transition-all duration-500" />
                <div className="relative">
                  <div className="flex items-center justify-between mb-8">
                    <span className="text-foreground transition-transform duration-300 group-hover:scale-110">{p.icon}</span>
                    <span className={`font-mono text-[10px] uppercase tracking-[0.16em] border rounded-full px-3 py-1 transition-all duration-300 ${
                      p.ready
                        ? "text-primary border-primary/40 bg-primary/5"
                        : "text-muted-foreground border-border"
                    }`}>
                      {p.ready ? t.downloads_ready : t.downloads_soon}
                    </span>
                  </div>
                  <h3 className="font-display text-2xl font-semibold mb-2">{p.os}</h3>
                  <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary mb-4">Ultra Edition</div>
                  <div className="font-mono text-xs text-muted-foreground mb-5">{p.note}</div>
                  <div className="text-sm text-foreground/80 leading-relaxed mb-6">{p.files}</div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                    {t.downloads_cta}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M7 17 17 7M17 7H9M17 7v8" />
                    </svg>
                  </div>
                </div>
              </a>
            </Reveal>
            );
          })}
        </div>
        <Reveal delay={150}>
          <div className="mt-8 rounded-xl border border-border/70 bg-card/50 p-5 md:p-6 font-mono text-sm">
            <span className="text-primary">$</span>{" "}
            <span className="text-foreground/85">
              git clone {REPO.replace("https://github.com/", "")}.git && cd Krevyx && npm install && npm start
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ========== FAQ ========== */
function Faq() {
  const { t } = useLanguage();
  return (
    <section id="sss" className="py-24 md:py-32 relative overflow-hidden">
      <div className="glow-spot" style={{ width: 500, height: 500, top: "20%", right: "-8%", opacity: 0.4 }} />
      <div className="container relative">
        <SectionHeading
          index={t.faq_index}
          label={t.faq_label}
          title={t.faq_title}
          sub={t.faq_sub}
        />
        <Reveal>
          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="space-y-2">
              {t.faq.map((item, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className="border border-border/70 rounded-xl px-5 bg-card/40 backdrop-blur-sm hover:border-primary/30 transition-colors duration-300"
                >
                  <AccordionTrigger className="text-left font-display text-base md:text-lg font-semibold py-5 no-underline hover:text-primary transition-colors duration-200">
                    <span className="flex items-start gap-4">
                      <span className="font-mono text-xs text-primary mt-1 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                      <span>{item.q}</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-sm md:text-base leading-relaxed pb-5 pl-10">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ========== Changelog ========== */
function Changelog() {
  const { t } = useLanguage();
  return (
    <section id="surum" className="py-24 md:py-28 border-t border-border/60">
      <div className="container grid md:grid-cols-2 gap-12">
        <div>
          <Reveal>
            <div className="flex items-center gap-4 mb-6 font-mono text-xs tracking-[0.18em] uppercase text-primary">
              <span className="text-muted-foreground">{t.changelog_index}</span>
              <span className="h-px w-10 bg-primary/50" />
              <span>{t.changelog_label}</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-semibold mb-4">{t.changelog_title}</h2>
            <p className="text-muted-foreground leading-relaxed max-w-md">
              {t.changelog_sub}
            </p>
          </Reveal>
        </div>
        <div className="space-y-1">
          {t.changelog.map((c, i) => (
            <Reveal key={c.v} delay={i * 50}>
              <div className="flex items-baseline gap-5 py-3 border-b border-border/60 hover:bg-card/30 transition-colors duration-200 rounded px-2">
                <span className="font-mono text-sm text-primary w-16 shrink-0">{c.v}</span>
                <span className="text-sm text-muted-foreground">{c.d}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ========== Roadmap ========== */
function Roadmap() {
  const { t } = useLanguage();
  const [open, setOpen] = useState<string | null>("v3.13.0");
  const statusLabel = (s: string) =>
    s === "done"
      ? t.roadmap_status_done
      : s === "developing"
        ? t.roadmap_status_developing
        : s === "planned"
          ? t.roadmap_status_planned
          : t.roadmap_status_idea;
  return (
    <section id="yol-haritasi" className="py-24 md:py-32 relative overflow-hidden border-t border-border/60">
      <div className="glow-spot" style={{ width: 560, height: 560, top: "-10%", right: "-10%", opacity: 0.5 }} />
      <div className="container relative">
        <SectionHeading
          index={t.roadmap_index}
          label={t.roadmap_label}
          title={t.roadmap_title}
          sub={t.roadmap_sub}
        />
        <div className="mt-16 relative max-w-3xl mx-auto">
          {/* Timeline spine */}
          <div className="absolute left-[27px] md:left-7 top-0 bottom-0 w-px bg-gradient-to-b from-primary/60 via-border/60 to-transparent" />
          <div className="space-y-4">
            {t.roadmap_items.map((item, i) => {
              const isOpen = open === item.version;
              return (
                <RevealWithRef key={item.version} delay={i * 50}>
                  <div className="relative">
                    {/* Node dot */}
                    <div className={`absolute left-[20px] md:left-0 top-7 w-3.5 h-3.5 rounded-full bg-background border-2 z-10 transition-all duration-300 ${
                      item.status === "done"
                        ? "bg-primary border-primary shadow-[0_0_12px_rgba(0,168,120,0.6)]"
                        : isOpen
                          ? "border-primary shadow-[0_0_12px_rgba(0,168,120,0.6)] scale-110"
                          : "border-primary/60"
                    }`} />
                    <button
                      onClick={() => setOpen(isOpen ? null : item.version)}
                      aria-expanded={isOpen}
                      className="w-full text-left pl-14 md:pl-12 rounded-xl border transition-all duration-300 group overflow-hidden active:scale-[0.995]"
                      style={{
                        borderColor: isOpen ? "rgba(0,168,120,0.45)" : "rgba(255,255,255,0.08)",
                        backgroundColor: isOpen ? "rgba(0,168,120,0.06)" : "rgba(255,255,255,0.02)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-4 px-5 md:px-6 py-5">
                        <div className="flex-1">
                          <span className={`inline-block font-mono text-[10px] uppercase tracking-[0.16em] rounded-full px-3 py-1 mb-2.5 ${
                            item.status === "done"
                              ? "text-primary border border-primary/50 bg-primary/15"
                              : item.status === "developing"
                                ? "text-primary border border-primary/40 bg-primary/10"
                                : item.status === "planned"
                                  ? "text-foreground/70 border border-border bg-card/40"
                                  : "text-muted-foreground border border-border/60 bg-card/20"
                          }`}>
                            {item.version} · {statusLabel(item.status)}
                          </span>
                          <h3 className="font-display text-lg md:text-xl font-bold text-foreground">{item.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{item.desc}</p>
                        </div>
                        {/* Chevron */}
                        <span
                          className={`mt-1 shrink-0 w-8 h-8 rounded-full border border-border flex items-center justify-center transition-transform duration-300 ${isOpen ? "rotate-180 border-primary/50 text-primary" : "text-muted-foreground group-hover:border-primary/40 group-hover:text-foreground"}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </span>
                      </div>
                      {/* Expandable details */}
                      <div
                        className="grid transition-all duration-300"
                        style={{
                          gridTemplateRows: isOpen ? "1fr" : "0fr",
                          transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
                        }}
                      >
                        <div className="overflow-hidden">
                          <div className="px-5 md:px-6 pb-6 pt-1">
                            <div className="border-t border-border/60 pt-5">
                              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary mb-3">{t.roadmap_detail}</div>
                              <ul className="space-y-2.5">
                                {item.goals.map((g) => (
                                  <li key={g} className="flex items-start gap-3 text-sm text-foreground/80 leading-relaxed">
                                    <span className="text-primary mt-0.5 shrink-0">—</span>
                                    <span>{g}</span>
                                  </li>
                                ))}
                              </ul>
                              <p className="font-mono text-xs text-muted-foreground mt-4 leading-relaxed">{item.note}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  </div>
                </RevealWithRef>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ========== Feedback ========== */
function Feedback() {
  const { t } = useLanguage();
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("sending");
  };

  return (
    <section id="geri-bildirim" className="py-24 md:py-32 border-t border-border/60 relative overflow-hidden">
      <div className="glow-spot" style={{ width: 520, height: 520, bottom: "-12%", left: "-10%", opacity: 0.35 }} />
      <div className="container relative">
        <div className="grid md:grid-cols-2 gap-12 items-start">
          <div>
            <Reveal>
              <div className="flex items-center gap-4 mb-6 font-mono text-xs tracking-[0.18em] uppercase text-primary">
                <span className="text-muted-foreground">{t.feedback_index}</span>
                <span className="h-px w-10 bg-primary/50" />
                <span>{t.feedback_label}</span>
              </div>
              <h2 className="text-3xl md:text-5xl font-display font-semibold mb-5">{t.feedback_title}</h2>
              <p className="text-muted-foreground leading-relaxed max-w-md">{t.feedback_sub}</p>
              <div className="mt-8 flex items-center gap-3 font-mono text-[11px] text-muted-foreground tracking-[0.12em] uppercase">
                <span className="w-2 h-2 rounded-full bg-primary/70 animate-pulse" />
                <span>yk7016903@gmail.com</span>
              </div>
            </Reveal>
          </div>
          <Reveal delay={80}>
            <form
              action="https://formsubmit.co/yk7016903@gmail.com"
              method="POST"
              onSubmit={handleSubmit}
              className="glow-card border border-border/70 rounded-2xl p-7 bg-card/40 backdrop-blur-sm space-y-4"
              aria-label={t.aria_feedback}
            >
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2" htmlFor="fb-name">
                    {t.feedback_name}
                  </label>
                  <input
                    id="fb-name"
                    name="name"
                    type="text"
                    className="w-full bg-background/60 border border-border/70 rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-colors"
                    placeholder="Ada Lovelace"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2" htmlFor="fb-email">
                    {t.feedback_email}
                  </label>
                  <input
                    id="fb-email"
                    name="email"
                    type="email"
                    className="w-full bg-background/60 border border-border/70 rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-colors"
                    placeholder="ada@example.com"
                  />
                </div>
              </div>
              <div>
                <label className="block font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2" htmlFor="fb-subject">
                  {t.feedback_subject}
                </label>
                <input
                  id="fb-subject"
                  name="subject"
                  type="text"
                  required
                  className="w-full bg-background/60 border border-border/70 rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-colors"
                  placeholder={t.feedback_subject_placeholder}
                />
              </div>
              <div>
                <label className="block font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2" htmlFor="fb-message">
                  {t.feedback_message}
                </label>
                <textarea
                  id="fb-message"
                  name="message"
                  required
                  rows={5}
                  className="w-full bg-background/60 border border-border/70 rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-colors resize-y"
                  placeholder={t.feedback_message_placeholder}
                />
              </div>
              {/* FormSubmit configurasyon */}
              <input type="hidden" name="_subject" value="Krevyx Site Feedback" />
              <input type="hidden" name="_captcha" value="false" />
              <input type="hidden" name="_template" value="table" />
              <button
                type="submit"
                disabled={status === "sending"}
                className="w-full bg-primary text-primary-foreground font-display font-semibold text-sm tracking-wide rounded-lg py-3.5 hover:bg-primary/90 active:scale-[0.98] transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {status === "sending" ? t.feedback_sending : t.feedback_submit}
              </button>
              {status === "sent" && (
                <p className="text-xs text-primary font-mono tracking-wide">{t.feedback_sent}</p>
              )}
              {status === "error" && (
                <p className="text-xs text-destructive font-mono tracking-wide">{t.feedback_error}</p>
              )}
            </form>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ========== Footer ========== */
function Footer() {
  const { t } = useLanguage();
  return (
    <footer className="border-t border-border/60 py-12">
      <div className="container flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <img src={ICON_512} alt="Krevyx" className="w-7 h-7" loading="lazy" decoding="async" />
          <div>
            <div className="font-display font-bold text-sm">
              Krevyx
              <span className="ml-2 font-mono text-[9px] tracking-[0.14em] uppercase border border-primary/40 text-primary rounded px-1.5 py-0.5">{t.footer_edition}</span>
            </div>
            <div className="font-mono text-[10px] text-muted-foreground tracking-[0.14em] uppercase">{t.footer_version}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted-foreground">
          <a href={REPO} target="_blank" rel="noopener noreferrer" className="underline-shift hover:text-foreground transition-colors">{t.nav_github}</a>
          <Link href="/docs" className="underline-shift hover:text-foreground transition-colors">{t.docs_title}</Link>
          <a href={`${REPO}/blob/main/CHANGELOG.md`} target="_blank" rel="noopener noreferrer" className="underline-shift hover:text-foreground transition-colors">{t.footer_changelog}</a>
          <a href={`${REPO}/blob/main/docs/ARCHITECTURE.md`} target="_blank" rel="noopener noreferrer" className="underline-shift hover:text-foreground transition-colors">{t.footer_architecture}</a>
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">
          {t.footer_copyright}
        </div>
      </div>
    </footer>
  );
}

/* ========== Bölüm kenarı glow (scroll'da açılan sinematik şerit) ========== */
function SectionEdgeGlow({ id }: { id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add("is-visible");
          obs.disconnect();
        }
      },
      { threshold: 0.6 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref} className={`section-edge-glow absolute left-0 right-0 top-0 z-0 ${id ?? ""}`} aria-hidden />;
}

/* ========== Sonsuz kayan şerit (sağlayıcı/feature marquee) ========== */
function Marquee({ items, label }: { items: string[]; label?: string }) {
  const row = [...items, ...items];
  return (
    <div className="marquee-strip mt-10">
      <div className="marquee-track gap-4">
        {[0, 1].map((half) => (
          <div key={half} className="flex gap-4 shrink-0">
            {row.map((item, i) => (
              <div
                key={`${half}-${i}`}
                className="flex items-center gap-3 whitespace-nowrap rounded-full border border-border/50 bg-card/30 backdrop-blur-sm px-5 py-2 text-sm font-medium text-foreground/80"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
                {item}
                {label && <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-primary/70">{label}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ========== Parallax glow (hero) ========== */
function ParallaxGlow() {
  const [y, setY] = useState(0);
  useEffect(() => {
    const onScroll = () => setY(window.scrollY * 0.15);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div
      className="glow-spot"
      style={{
        width: 560,
        height: 560,
        top: -280 + y * 0.5,
        left: "50%",
        transform: `translateX(-50%) translateY(${y * 0.3}px)`,
        opacity: 0.65,
      }}
    />
  );
}

/* ========== Page ========== */
export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <ScrollProgress />
      <div className="grain-overlay" />
      <div className="topline" />
      <Nav />
      <main className="flex-1 relative">
        <Hero />
        <SectionEdgeGlow />
      <StatsBar />
        <SectionEdgeGlow />
      <Vision />
        <SectionEdgeGlow />
      <Features />
        <SectionEdgeGlow />
        <Providers />
        <SectionEdgeGlow />
        <Downloads />
        <Faq />
        <Changelog />
        <Roadmap />
        <Feedback />
      </main>
      <Footer />
    </div>
  );
}
