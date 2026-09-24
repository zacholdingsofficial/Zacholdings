import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useMotionValue, useSpring, useMotionTemplate } from "framer-motion";
import { Lock, Mail, Building2, UserCircle, Briefcase, ArrowLeft, Shield, Eye, EyeOff, ChevronRight } from "lucide-react";
import { Button } from "../../components/ui/button";
import { useAuthStore } from "../../store/authStore";
import { supabase } from "../../supabase";

// --- CUSTOM SELECT ARROW ---
const DropdownArrow = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

// --- DIRECTIONAL STEP TRANSITION ---
const pageVariants = {
  initial: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? 32 : -32,
  }),
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? -32 : 32,
    transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
  }),
};

// --- FLOATING LABEL (shared visual language for every field) ---
const fieldLabelClass = (floated: boolean, focused: boolean) =>
  [
    "absolute left-14 pointer-events-none font-medium transition-all duration-200 origin-left",
    floated ? "top-[15px] text-[11px]" : "top-1/2 -translate-y-1/2 text-[15px]",
    focused ? "text-[#4F46E5]" : "text-slate-400",
  ].join(" ");

const fieldInputClass =
  "peer w-full h-[64px] rounded-2xl bg-[#F5F6FB] border border-black/10 px-5 pl-14 pt-[22px] pb-[6px] text-[15px] font-medium outline-none focus:bg-white focus:border-[#4F46E5] focus:ring-4 focus:ring-[#4F46E5]/[0.09] transition-all text-[#171C26] placeholder-transparent";

// --- FINE GRAIN OVERLAY, USED AT ~4% OPACITY ON THE BRAND PANEL ---
const NOISE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
const NOISE_BG = `data:image/svg+xml,${encodeURIComponent(NOISE_SVG)}`;

// --- SUBSIDIARY NODES FOR THE HERO: fixed positions around the parent hub, each floating
// independently. No rotation is used anywhere in this diagram — only translate and scale,
// which (unlike rotate) never depend on a browser's guess about an element's pivot point. ---
const NODE_ANGLES = [15, 80, 140, 205, 265, 330];
const NODE_RADII = [150, 195, 120, 178, 145, 200];
const NODE_SIZES = [5, 4, 6, 4.5, 5, 4];
const NODE_FLOAT_DURATIONS = [5.5, 6.5, 4.8, 6, 5.2, 7];
const NODE_FLOAT_DELAYS = [0, 0.6, 1.1, 0.3, 1.6, 0.9];
const NODE_FLOAT_AMPLITUDES = [7, 5, 8, 6, 7, 5];
const NODES = NODE_ANGLES.map((angle, i) => {
  const rad = (angle * Math.PI) / 180;
  const radius = NODE_RADII[i];
  return {
    x: radius * Math.cos(rad),
    y: radius * Math.sin(rad),
    size: NODE_SIZES[i],
    floatDuration: NODE_FLOAT_DURATIONS[i],
    floatDelay: NODE_FLOAT_DELAYS[i],
    floatAmp: NODE_FLOAT_AMPLITUDES[i],
  };
});

// --- A QUIET, RECURRING FILLER: A MEASURED LINE, ECHOING THE INSTRUMENT ON THE LEFT ---
const MeasureDivider = () => (
  <div className="flex-1 min-h-[28px] flex items-center">
    <div className="relative w-full h-px bg-black/[0.06]">
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className="absolute top-1/2 -translate-y-1/2 w-px h-2 bg-black/10" style={{ left: `${(i / 8) * 100}%` }} />
      ))}
    </div>
  </div>
);

// --- CUSTOM DROPDOWN, STYLED TO MATCH THE REST OF THE FORM RATHER THAN THE OS CHROME ---
function CustomSelect({
  icon,
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => o.value === value);
  const floated = open || !!value;

  return (
    <div className="relative" ref={rootRef}>
      {icon}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`w-full h-[64px] rounded-2xl border px-5 pl-14 pt-[22px] pb-[6px] text-[15px] font-medium text-left outline-none transition-all ${
          open ? "bg-white border-[#4F46E5] ring-4 ring-[#4F46E5]/[0.09]" : "bg-[#F5F6FB] border-black/10"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span className="block truncate text-[#171C26]">{selected ? selected.label : ""}</span>
      </button>
      <label className={fieldLabelClass(floated, open)}>{label}</label>
      <DropdownArrow className={`absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none transition-transform duration-200 ${open ? "rotate-180" : ""}`} />

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: "top" }}
            className="absolute left-0 right-0 top-[70px] z-30 rounded-2xl border border-black/10 bg-white shadow-[0_20px_45px_-16px_rgba(49,46,129,0.22)] overflow-hidden"
          >
            <div className="max-h-56 overflow-y-auto py-1.5">
              {options.length === 0 && (
                <div className="px-5 py-3 text-[13.5px] text-slate-400">No options available</div>
              )}
              {options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-3 px-5 py-3 text-[14.5px] text-left transition-colors ${
                    o.value === value ? "text-[#10192B] font-semibold bg-[#F5F6FB]" : "text-[#171C26] hover:bg-[#F5F6FB]/70"
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === value && <span className="h-[6px] w-[6px] rounded-full bg-[#4F46E5] shrink-0" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- MAIN LOGIN PAGE ---
export default function LoginPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [direction, setDirection] = useState(1);
  const [selectedRole, setSelectedRole] = useState<"admin" | "head" | "user" | null>(null);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [companiesDb, setCompaniesDb] = useState<{ id: number, name: string, logo_url: string | null }[]>([]);
  const [headUsers, setHeadUsers] = useState<{ name: string, email: string }[]>([]);
  const [adminLogo, setAdminLogo] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const signIn = useAuthStore((state) => state.signIn);

  // cursor-reactive spotlight for the brand panel
  const glowX = useMotionValue(72);
  const glowY = useMotionValue(18);
  const springGlowX = useSpring(glowX, { stiffness: 60, damping: 22 });
  const springGlowY = useSpring(glowY, { stiffness: 60, damping: 22 });
  const spotlightBackground = useMotionTemplate`radial-gradient(560px circle at ${springGlowX}% ${springGlowY}%, rgba(99,102,241,0.28), transparent 62%)`;

  const handlePanelMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    glowX.set(((e.clientX - rect.left) / rect.width) * 100);
    glowY.set(((e.clientY - rect.top) / rect.height) * 100);
  };

  // subtle 3D tilt for the credential card
  const cardX = useMotionValue(0);
  const cardY = useMotionValue(0);
  const springRotateX = useSpring(cardY, { stiffness: 200, damping: 24 });
  const springRotateY = useSpring(cardX, { stiffness: 200, damping: 24 });

  const handleCardMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    cardX.set((((e.clientX - rect.left) / rect.width) - 0.5) * 8);
    cardY.set((((e.clientY - rect.top) / rect.height) - 0.5) * -8);
  };
  const handleCardMouseLeave = () => {
    cardX.set(0);
    cardY.set(0);
  };

  useEffect(() => {
    if (!document.getElementById('zayd-brand-fonts')) {
      const link = document.createElement('link');
      link.id = 'zayd-brand-fonts';
      link.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }

    if (window.matchMedia) {
      setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    const fetchInitialData = async () => {
      try {
        const { data: compData } = await supabase.from('companies').select('id, name, logo_url');
        if (compData) setCompaniesDb(compData);

        const { data: adminData } = await supabase.from('employees').select('profile_image_url').eq('access_level', 'admin').limit(1).single();

        const fallbackFavicon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%2310192B'/%3E%3Ctext x='50' y='67' font-family='Georgia,serif' font-size='52' fill='%23C6A15B' text-anchor='middle'%3EZ%3C/text%3E%3C/svg%3E";
        let currentFavicon = fallbackFavicon;

        if (adminData && adminData.profile_image_url) {
          setAdminLogo(adminData.profile_image_url);
          currentFavicon = adminData.profile_image_url;
        }

        let linkFav = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
        if (!linkFav) {
          linkFav = document.createElement('link');
          linkFav.rel = 'icon';
          document.head.appendChild(linkFav);
        }
        linkFav.href = currentFavicon;
      } catch (e) {
        console.error("Failed to load initial data", e);
      }
    };
    fetchInitialData();
  }, []);

  const activeCompanyObj = useMemo(() => {
    if (!selectedCompany) return null;
    return companiesDb.find(c => c.name === selectedCompany) || null;
  }, [selectedCompany, companiesDb]);

  const handleRoleSelect = (role: "admin" | "head" | "user") => {
    setError("");
    setSelectedRole(role);
    setSelectedCompany("");
    setEmail("");
    setPassword("");
    setDirection(1);
    setStep(role === "admin" ? 3 : 2);
  };

  const handleCompanySelect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;

    if (selectedRole === 'head') {
      if (activeCompanyObj) {
        const { data } = await supabase.from('employees').select('name, email').eq('company_id', activeCompanyObj.id).eq('access_level', 'head');
        if (data && data.length > 0) {
          setHeadUsers(data);
          if (data.length === 1) setEmail(data[0].email);
          else setEmail("");
        } else setHeadUsers([]);
      }
    }
    setDirection(1);
    setStep(3);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setIsLoggingIn(true);
    const result = await signIn(email, password);
    if (result.error) { setError("Authentication failed. Please verify your credentials."); setIsLoggingIn(false); }
    else navigate("/dashboard");
  };

  const goBack = () => {
    setError(""); setEmail(""); setPassword(""); setHeadUsers([]);
    setDirection(-1);

    if (step === 3 && selectedRole !== "admin") setStep(2);
    else if (step === 3 && selectedRole === "admin") { setSelectedCompany(""); setSelectedRole(null); setStep(1); }
    else if (step === 2) { setSelectedCompany(""); setSelectedRole(null); setStep(1); }
  };

  const markerLeft = step === 1 ? "0%" : step === 2 ? "50%" : "100%";

  // WhatsApp "forgot password" hand-off — pre-filled with whatever context we already know
  const forgotContext = selectedRole === 'admin' ? 'the admin panel' : (activeCompanyObj?.name || 'my company');
  const forgotIdentity = email || '[your registered email]';
  const forgotMessage = `Hi, I've forgotten my password for Zac Holdings. I work under ${forgotContext} and my username is ${forgotIdentity}. Could you please reset my password?`;
  const forgotHref = `https://wa.me/917558957246?text=${encodeURIComponent(forgotMessage)}`;

  const headNeedsSelection = selectedRole === 'head' && headUsers.length > 1 && !email;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap');
        .font-display { font-family: 'Fraunces', Georgia, serif; font-optical-sizing: auto; }
        .font-sans { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
      `}</style>

      <div className="min-h-screen w-full flex flex-col md:flex-row font-sans bg-white">

        {/* LEFT: BRAND PANEL */}
        <div
          onMouseMove={handlePanelMouseMove}
          className="w-full md:w-1/2 relative flex flex-col overflow-hidden px-8 md:pl-24 md:pr-14 lg:pl-32 py-12 md:py-14"
          style={{ background: "linear-gradient(160deg, #0A0B1F 0%, #14153D 55%, #241C5E 100%)" }}
        >
          {/* drifting aurora glow — translate and opacity only, so it renders identically everywhere */}
          <motion.div
            className="absolute w-[440px] h-[440px] rounded-full pointer-events-none"
            style={{
              top: "-12%",
              left: "-8%",
              background: "radial-gradient(circle, rgba(99,102,241,0.32), transparent 70%)",
              filter: "blur(70px)",
            }}
            animate={reduceMotion ? undefined : { x: [0, 44, -18, 0], y: [0, -28, 22, 0] }}
            transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute w-[380px] h-[380px] rounded-full pointer-events-none"
            style={{
              bottom: "-14%",
              right: "2%",
              background: "radial-gradient(circle, rgba(129,140,248,0.26), transparent 70%)",
              filter: "blur(80px)",
            }}
            animate={reduceMotion ? undefined : { x: [0, -30, 26, 0], y: [0, 24, -16, 0] }}
            transition={{ duration: 32, repeat: Infinity, ease: "easeInOut", delay: 3 }}
          />

          {/* cursor-reactive spotlight */}
          <motion.div className="absolute inset-0 pointer-events-none" style={{ background: spotlightBackground }} />

          {/* fine blueprint grid, replacing the flat dot field */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.05]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
              backgroundSize: "46px 46px",
            }}
          />

          {/* paper-grain texture */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.045] mix-blend-overlay"
            style={{ backgroundImage: `url("${NOISE_BG}")` }}
          />

          {/* vertical measuring edge, filling the long left margin */}
          <div className="absolute left-5 md:left-7 top-0 bottom-0 w-px bg-white/[0.06] pointer-events-none hidden sm:block">
            {Array.from({ length: 40 }).map((_, i) => (
              <span key={i} className="absolute left-0 w-2 h-px bg-white/10" style={{ top: `${i * 40}px` }} />
            ))}
          </div>

          {/* hero — the parent company at the centre, subsidiaries connected around it, each
              breathing gently on its own. Every motion here is a translate or a scale on an
              element centred on itself — never a rotation around a computed pivot — so there
              is nothing for a browser's transform-origin guess to get wrong. */}
          <motion.svg
            className="absolute -right-24 -bottom-32 md:-right-4 md:-bottom-36 w-[560px] h-[560px] pointer-events-none"
            viewBox="0 0 520 520"
            fill="none"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          >
            {/* faint orbit guides */}
            <circle cx="260" cy="260" r="120" stroke="#818CF8" strokeOpacity="0.12" strokeWidth="1" strokeDasharray="2 7" />
            <circle cx="260" cy="260" r="160" stroke="#818CF8" strokeOpacity="0.1" strokeWidth="1" strokeDasharray="2 7" />

            {/* outer boundary, traced in once as the diagram assembles */}
            <motion.circle
              cx="260" cy="260" r="204"
              stroke="#6366F1" strokeWidth="1" strokeOpacity="0.32"
              initial={reduceMotion ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.4, ease: [0.65, 0, 0.35, 1], delay: 0.35 }}
            />

            {/* subsidiaries — fixed positions, connecting lines drawn in once, each node
                then floats up and down independently of the others */}
            {NODES.map((n, i) => {
              const cx = 260 + n.x;
              const cy = 260 + n.y;
              const lineDelay = 0.7 + i * 0.1;
              return (
                <g key={i}>
                  <motion.line
                    x1="260" y1="260" x2={cx} y2={cy}
                    stroke="#818CF8" strokeOpacity="0.4" strokeWidth="1"
                    initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.6, delay: lineDelay, ease: [0.65, 0, 0.35, 1] }}
                  />
                  <motion.g
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={
                      reduceMotion
                        ? { opacity: 1, y: 0 }
                        : { opacity: 1, y: [0, -n.floatAmp, 0] }
                    }
                    transition={{
                      opacity: { duration: 0.5, delay: lineDelay + 0.2 },
                      y: reduceMotion
                        ? { duration: 0 }
                        : { duration: n.floatDuration, repeat: Infinity, ease: "easeInOut", delay: n.floatDelay + 1 },
                    }}
                  >
                    <circle cx={cx} cy={cy} r={n.size} fill="#4F46E5" />
                    <circle cx={cx} cy={cy} r={n.size + 3} stroke="#4F46E5" strokeOpacity="0.25" strokeWidth="1" />
                  </motion.g>
                </g>
              );
            })}

            {/* parent hub, with a slow, living pulse — a circle scaling around its own centre,
                which is always safe regardless of a browser's default transform box */}
            {!reduceMotion && [0, 1].map((i) => (
              <motion.circle
                key={i}
                cx="260" cy="260" r="9"
                stroke="#818CF8" strokeWidth="1"
                initial={{ opacity: 0.45, scale: 0.7 }}
                animate={{ opacity: [0.45, 0], scale: [0.7, 2.6] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: "easeOut", delay: 1.5 + i * 1.6 }}
              />
            ))}
            <circle cx="260" cy="260" r="7" fill="#312E81" />
            <circle cx="260" cy="260" r="7" fill="#4F46E5" fillOpacity="0.35" />
          </motion.svg>

          <div className="relative z-10 flex-1 flex flex-col justify-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="max-w-md w-full"
            >
              <div className="mb-11">
                {adminLogo ? (
                  <img src={adminLogo} alt="Company logo" className="h-11 w-auto max-w-[150px] object-contain" />
                ) : (
                  <span className="font-display text-5xl text-white leading-none">Z</span>
                )}
              </div>

              <h1 className="font-display text-[3rem] md:text-[3.7rem] leading-[1.06] text-white font-normal tracking-tight mb-7">
                Welcome to<br />Zac Holdings
              </h1>

              <div className="w-14 h-px bg-[#6366F1]/70 mb-7" />

              <p className="text-[15.5px] text-white/55 font-normal leading-relaxed max-w-xs">
                Access is invitation-only. For credentials or support, contact your administrator.
              </p>
            </motion.div>
          </div>

          {/* quiet signature, panel corner */}
          <div className="relative z-10 flex items-center justify-end pt-10">
            <a
              href="https://wa.me/917558957246"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] font-medium text-white/25 hover:text-[#818CF8] transition-colors select-none"
              title="Developer"
            >
              R.
            </a>
          </div>
        </div>

        {/* RIGHT: LOGIN CARD */}
        <div className="w-full md:w-1/2 flex flex-col items-center justify-center bg-[#F5F6FB] p-6 sm:p-12 gap-5">

          <motion.div
            onMouseMove={handleCardMouseMove}
            onMouseLeave={handleCardMouseLeave}
            style={{ rotateX: springRotateX, rotateY: springRotateY, transformPerspective: 1400 }}
            className="relative bg-white rounded-[2rem] shadow-[0_30px_80px_-24px_rgba(30,27,75,0.16)] border border-black/[0.06] w-full max-w-[520px] h-[640px] overflow-hidden"
          >
            {/* registration marks, like a printed plate */}
            <span className="absolute top-4 left-4 w-3 h-3 border-t border-l border-[#4F46E5]/40 pointer-events-none z-20" />
            <span className="absolute bottom-4 right-4 w-3 h-3 border-b border-r border-[#4F46E5]/40 pointer-events-none z-20" />

            {/* ruler-style step indicator */}
            <div className="absolute top-0 left-9 right-9 h-6 z-20 pointer-events-none">
              <div className="absolute top-[11px] left-0 right-0 h-px bg-black/[0.07]" />
              {[0, 1, 2].map((i) => (
                <span key={i} className="absolute top-[7px] w-px h-[9px] bg-black/[0.14]" style={{ left: `${i * 50}%` }} />
              ))}
              <motion.span
                className="absolute top-[6px] h-[11px] w-[11px] -ml-[5.5px] rounded-full bg-[#4F46E5]"
                style={{ boxShadow: "0 0 0 4px rgba(99,102,241,0.18)" }}
                animate={{ left: markerLeft }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>

            <AnimatePresence mode="wait" custom={direction}>

              {/* STEP 1: ROLE */}
              {step === 1 && (
                <motion.div
                  key="step1"
                  custom={direction}
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="absolute inset-0 flex flex-col p-8 md:p-12 pt-14 md:pt-16"
                >
                  <h2 className="font-display text-[30px] text-[#171C26] font-normal tracking-tight mb-1.5">Sign in as</h2>
                  <p className="text-[14.5px] text-slate-500 mb-7">Choose the role that matches your access.</p>

                  <div className="flex flex-col">
                    <button onClick={() => handleRoleSelect("admin")} className="w-full flex items-center gap-4 py-5 px-2 -mx-2 rounded-xl border-b border-black/[0.06] group text-left transition-all duration-200 hover:bg-black/[0.015] active:scale-[0.99]">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-[#171C26]/70 group-hover:bg-gradient-to-br group-hover:from-[#4F46E5] group-hover:to-[#312E81] group-hover:text-white group-hover:rotate-6 transition-all duration-300">
                        <Shield className="h-5 w-5" strokeWidth={1.75} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="block text-[16.5px] font-semibold text-[#171C26]">System Administrator</span>
                        <span className="block text-[12.5px] text-slate-400 mt-0.5">Full platform oversight</span>
                      </div>
                      <ChevronRight className="h-[18px] w-[18px] text-slate-300 group-hover:text-[#4F46E5] group-hover:translate-x-0.5 transition-all duration-300 shrink-0" />
                    </button>

                    <button onClick={() => handleRoleSelect("head")} className="w-full flex items-center gap-4 py-5 px-2 -mx-2 rounded-xl border-b border-black/[0.06] group text-left transition-all duration-200 hover:bg-black/[0.015] active:scale-[0.99]">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-[#171C26]/70 group-hover:bg-gradient-to-br group-hover:from-[#4F46E5] group-hover:to-[#312E81] group-hover:text-white group-hover:rotate-6 transition-all duration-300">
                        <Briefcase className="h-5 w-5" strokeWidth={1.75} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="block text-[16.5px] font-semibold text-[#171C26]">Organizational Head</span>
                        <span className="block text-[12.5px] text-slate-400 mt-0.5">Manage your division</span>
                      </div>
                      <ChevronRight className="h-[18px] w-[18px] text-slate-300 group-hover:text-[#4F46E5] group-hover:translate-x-0.5 transition-all duration-300 shrink-0" />
                    </button>

                    <button onClick={() => handleRoleSelect("user")} className="w-full flex items-center gap-4 py-5 px-2 -mx-2 rounded-xl group text-left transition-all duration-200 hover:bg-black/[0.015] active:scale-[0.99]">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-[#171C26]/70 group-hover:bg-gradient-to-br group-hover:from-[#4F46E5] group-hover:to-[#312E81] group-hover:text-white group-hover:rotate-6 transition-all duration-300">
                        <UserCircle className="h-5 w-5" strokeWidth={1.75} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="block text-[16.5px] font-semibold text-[#171C26]">Corporate Employee</span>
                        <span className="block text-[12.5px] text-slate-400 mt-0.5">Daily workspace access</span>
                      </div>
                      <ChevronRight className="h-[18px] w-[18px] text-slate-300 group-hover:text-[#4F46E5] group-hover:translate-x-0.5 transition-all duration-300 shrink-0" />
                    </button>
                  </div>

                  <MeasureDivider />
                </motion.div>
              )}

              {/* STEP 2: ORGANIZATION */}
              {step === 2 && (
                <motion.div
                  key="step2"
                  custom={direction}
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="absolute inset-0 flex flex-col p-8 md:p-12 pt-14 md:pt-16"
                >
                  <h2 className="font-display text-[30px] text-[#171C26] font-normal tracking-tight mb-1.5">Your organization</h2>
                  <p className="text-[14.5px] text-slate-500 mb-7">Select the company you're signing in to.</p>

                  <form onSubmit={handleCompanySelect} className="space-y-4">
                    <CustomSelect
                      icon={<Building2 className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none z-10" strokeWidth={1.75} />}
                      label="Organization"
                      value={selectedCompany}
                      onChange={setSelectedCompany}
                      options={(companiesDb || []).map((c) => ({ value: c.name, label: c.name }))}
                    />

                    <Button type="submit" disabled={!selectedCompany} className="w-full h-[64px] rounded-2xl text-[15px] font-semibold shadow-[0_20px_40px_-18px_rgba(49,46,129,0.38)] transition-all duration-300 bg-gradient-to-br from-[#4F46E5] to-[#312E81] hover:from-[#5B52F0] hover:to-[#3730A3] active:scale-[0.98] text-white disabled:opacity-40 mt-2">
                      Continue
                    </Button>
                  </form>

                  <div className="mt-auto pt-5 border-t border-black/[0.06]">
                    <button onClick={goBack} className="text-[13px] font-medium text-slate-400 hover:text-[#10192B] transition-colors flex items-center gap-2 group">
                      <ArrowLeft className="h-[15px] w-[15px] group-hover:-translate-x-0.5 transition-transform duration-200" /> Back
                    </button>
                  </div>
                </motion.div>
              )}

              {/* STEP 3: CREDENTIALS */}
              {step === 3 && (
                <motion.div
                  key="step3"
                  custom={direction}
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="absolute inset-0 flex flex-col p-8 md:p-12 pt-14 md:pt-16 overflow-y-auto max-sm:[&::-webkit-scrollbar]:hidden"
                >

                  <div className="flex items-center gap-4 mb-6 shrink-0">
                    {selectedRole === 'admin' ? (
                      adminLogo ? <img src={adminLogo} alt="Admin" className="h-12 w-auto max-w-[150px] object-contain shrink-0" /> : <Shield className="h-9 w-9 text-[#10192B] shrink-0" strokeWidth={1.5} />
                    ) : (
                      activeCompanyObj?.logo_url ? <img src={activeCompanyObj.logo_url} alt={activeCompanyObj.name} className="h-12 w-auto max-w-[150px] object-contain shrink-0" /> : <Building2 className="h-9 w-9 text-[#10192B] shrink-0" strokeWidth={1.5} />
                    )}
                    <div className="min-w-0">
                      <h2 className="font-display text-[26px] text-[#171C26] font-normal tracking-tight leading-none truncate">Sign in</h2>
                      <p className="text-[12.5px] text-slate-400 mt-1 truncate">
                        {selectedRole === 'admin' ? 'Master administration' : activeCompanyObj?.name}
                      </p>
                    </div>
                  </div>

                  {error && (
                    <div className="mb-4 rounded-2xl bg-red-50/70 p-4 text-[13.5px] font-medium text-red-600 border border-red-100 flex items-center gap-3 shrink-0">
                      <Shield className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} /> {error}
                    </div>
                  )}

                  <form onSubmit={handleLogin} className="space-y-4 w-full shrink-0">

                    {selectedRole === 'head' ? (
                      (headUsers || []).length > 1 ? (
                        <CustomSelect
                          icon={<UserCircle className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none z-10" strokeWidth={1.75} />}
                          label="Your profile"
                          value={email}
                          onChange={setEmail}
                          options={(headUsers || []).map((h) => ({ value: h.email, label: h.name }))}
                        />
                      ) : (
                        <div className="relative">
                          <UserCircle className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" strokeWidth={1.75} />
                          <input type="text" readOnly value={headUsers[0]?.name || email} className="w-full h-[64px] rounded-2xl bg-[#F5F6FB] border border-black/10 px-5 pl-14 pt-[22px] pb-[6px] text-[15px] font-medium outline-none text-slate-500 cursor-not-allowed" />
                          <label className={fieldLabelClass(true, false)}>Your profile</label>
                        </div>
                      )
                    ) : (
                      <div className="relative">
                        <Mail className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none z-10" strokeWidth={1.75} />
                        <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder=" " className={fieldInputClass} />
                        <label htmlFor="email" className={`${fieldLabelClass(false, false)} peer-focus:top-[15px] peer-focus:text-[11px] peer-focus:text-[#4F46E5] peer-[&:not(:placeholder-shown)]:top-[15px] peer-[&:not(:placeholder-shown)]:text-[11px]`}>
                          Email address
                        </label>
                      </div>
                    )}

                    <div className="relative">
                      <Lock className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none z-10" strokeWidth={1.75} />
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)}
                        placeholder=" " className={`${fieldInputClass} pr-14 [&::-ms-reveal]:hidden [&::-ms-clear]:hidden`}
                      />
                      <label htmlFor="password" className={`${fieldLabelClass(false, false)} peer-focus:top-[15px] peer-focus:text-[11px] peer-focus:text-[#4F46E5] peer-[&:not(:placeholder-shown)]:top-[15px] peer-[&:not(:placeholder-shown)]:text-[11px]`}>
                        Password
                      </label>
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#10192B] transition-colors p-2 rounded-lg z-10">
                        {showPassword ? <EyeOff className="h-5 w-5" strokeWidth={1.75} /> : <Eye className="h-5 w-5" strokeWidth={1.75} />}
                      </button>
                    </div>

                    <div className="flex justify-end -mt-1">
                      <a
                        href={forgotHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12.5px] font-medium text-slate-400 hover:text-[#4F46E5] transition-colors"
                      >
                        Forgot password?
                      </a>
                    </div>

                    <Button type="submit" disabled={isLoggingIn || headNeedsSelection} className="w-full h-[64px] mt-2 rounded-2xl text-[15px] font-semibold shadow-[0_20px_40px_-18px_rgba(49,46,129,0.38)] transition-all duration-300 bg-gradient-to-br from-[#4F46E5] to-[#312E81] hover:from-[#5B52F0] hover:to-[#3730A3] active:scale-[0.98] text-white disabled:opacity-50">
                      {isLoggingIn ? "Signing in..." : "Sign in"}
                    </Button>
                  </form>

                  <div className="mt-auto pt-5 border-t border-black/[0.06] shrink-0">
                    <button onClick={goBack} className="text-[13px] font-medium text-slate-400 hover:text-[#10192B] transition-colors flex items-center gap-2 group">
                      <ArrowLeft className="h-[15px] w-[15px] group-hover:-translate-x-0.5 transition-transform duration-200" /> Back
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <p className="text-[11.5px] text-slate-400 font-medium">© 2026 Zac Holdings Pvt Ltd</p>
        </div>
      </div>
    </>
  );
}